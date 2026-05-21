## loranisme 改动部分及解释

> 对应 Git 提交：`221eb62`（2026-05-13）、`ff21ef3`（2026-05-17）  
> 基准：在 `432d08e`（siigure 局态机 / 支付锁定 / 候补 / 稀疏模式等）之上快进追加。

### 改动边界

- **改动文件**：`app.js`、`index.html`、`style.css`、`server.py`（新增）、`.env.example`（新增）、`.gitignore`（新增）
- **未改动**：`mockData.js`、`utils/matching.js`、`docs/` 下既有文档（本文件为新增说明）
- **运行方式变化**：Demo 需通过 `python3 server.py` 启动，才能访问 `POST /api/ai-match`；不再建议仅用静态文件打开 `index.html`
- **与 siigure 改动的关系**：保留局态机、诚意金 Bottom Sheet、候补、稀疏模式等逻辑；在其上叠加重规划、团购排序、Gemini 导演层与地图锁定

---

### 提交与文件统计

| 提交 | 说明 | 涉及文件 |
|------|------|----------|
| `221eb62` | 改进重规划与团购排序流程 | `app.js`、`index.html`、`style.css` |
| `ff21ef3` | Gemini Agent 集成与固定地图视图 | 上述 + `server.py`、`.env.example`、`.gitignore` |

合计（相对 `432d08e`）：6 个文件，约 +977 / −218 行。

---

### 改动清单

#### 1. 重规划（Replanning）

**场景**：成局协商过程中出现异常——换地点、排队时间变长等。

| 函数 | 作用 |
|------|------|
| `rankReplanCandidates(match, eventType)` | 从 POI 池筛选候选店，多维度打分并取 Top 5 |
| `replanModalCopy(eventType, match)` | 按事件类型生成弹窗标题与说明文案 |
| `openReplanChooser(eventType, match, options)` | 展示候选列表模态框，支持选店或「继续等原店」 |
| `commitReplanChoice(match, item, eventType, options)` | 确认换店：更新 match、写入聊天消息、回到协商态 |
| `keepOriginalPlanAfterWait(match, nextWait, options)` | 排队变长时保留原店，仅更新等待时间说明 |

**支持的事件类型**：

- `change_place` — 换地点
- `waiting_time_change` — 排队变长（可换低等待店，也可继续等）

**综合分公式**（UI 与代码一致）：

> 品类相似 26% + 等待友好 22% + 人均相近 17% + 距离 13% + 评分 10% + 对方偏好 12%

**状态与局态衔接**：

- 新增 `appState.replanningNotice`，在 AI 结果页与聊天页展示通知条
- 换店后调用 `setPlanStatus(PLAN_STATUS.NEGOTIATING)`，并重置 `depositLocked`、`depositAgreementChecked` 等，避免沿用旧支付锁定状态

---

#### 2. 团购 / 套餐排序（Deal Ranking）

**场景**：匹配成功、选定 POI 后，需要选择具体团购券 / 套餐。

| 函数 | 作用 |
|------|------|
| `buildDealCandidates(match)` | 基于当前 POI 生成多种券种（基础券、双人、低价、多人/KTV 等） |
| `rankDealCandidates(match)` | 按人数、预算、折扣、有效期、对方偏好等维度排序 |
| `openDealRankChooser()` | 弹窗展示排序后的套餐列表，用户选择 |
| `targetGroupCount()` / `groupFitScore()` | 根据 `group_size` 推断目标人数并评估套餐适配度 |

**排序权重**（代码内）：

> 人数适配 25% + 优惠力度 25% + 预算 20% + 有效期 12% + 对方偏好 10% + POI 绑定 8%

成功页会展示「AI 当前推荐：xxx 套餐」；聊天 / 成功页提供「选择团购」入口。

---

#### 3. Gemini「成局导演」Agent

**架构**：浏览器 → `POST /api/ai-match` → `server.py` → Google Gemini API → 结构化 JSON → 前端合并展示。

**后端 `server.py` 要点**：

- 基于 `ThreadingHTTPServer` + `SimpleHTTPRequestHandler`，默认端口 `8000`（可通过 `PORT` 环境变量覆盖）
- 静态资源与 `index.html` 同源托管，避免纯静态打开时跨域无法调 AI
- `call_gemini()`：调用 `gemini-2.5-flash`（可通过 `GEMINI_MODEL` 覆盖），`responseSchema` 约束输出 JSON
- `DEVELOPER_PROMPT` 约束：**不编造商家**，仅使用请求体中的 `merchant_candidates` 与 `local_plans`；本地规则评分为「真相源」，模型主要增强意图理解、解释、风险与演示话术
- 失败时返回 `503` + `{ "error": "...", "fallback": true }`，前端走本地兜底

**输出 Schema 主要字段**（`AI_MATCH_SCHEMA`）：

| 字段 | 含义 |
|------|------|
| `intent_patch` | 对用户意图的补充/修正（含 `confidence`） |
| `director_brief` | 成局导演总述 |
| `clarifying_questions` | 可选澄清问题列表 |
| `plan_overrides` | 每个方案的标题、解释、风险、转化话术等 |
| `merchant_layer` | 真实 / 模拟 / 生成字段划分，便于答辩 |
| `demo_hooks` | 演示用钩子文案 |

**前端 `app.js` 要点**：

| 函数 | 作用 |
|------|------|
| `buildAIDirectorPayload(availablePOIs)` | 组装发给后端的 JSON（区域、用户输入、解析意图、候选 POI、本地 Top3 方案） |
| `requestAIDirector(payload)` | `fetch("/api/ai-match")` |
| `enrichWithAIDirector(availablePOIs)` | 在 `runAI()` 本地 `runMatching()` 之后调用；合并 `intent_patch` 与 `plan_overrides` |
| `renderAIDirectorCard()` | 展示「Gemini Agent 已生成建议」或「本地兜底」提示 |

**新增状态**：

- `appState.aiDirector`
- `appState.aiAgentError`

匹配卡片通过 `match.ai_director` 展示 `headline`、`explanation`、`risk`、`conversion_prompt` 等。

---

#### 4. 固定地图视图（Fixed Map View）

**目的**：Demo 录制时地图始终落在固定商圈，避免拖出范围。

| 常量 / 函数 | 作用 |
|-------------|------|
| `BUSINESS_DISTRICT_MAP` | 商圈中心、边界、`fitPadding`、`maxZoom`、`fallbackZoom` |
| `mockPoiLngLat()` / `getMockPoisWithCoords()` | 为 Mock POI 生成商圈内坐标 |
| `ensureDistrictFitMarkers()` / `lockBusinessDistrictViewport()` | `setFitView` 框选所有 POI |
| `setMapLockedStatus()` | 禁用拖拽、缩放、滚轮、双击缩放等交互 |

地图初始化在 `initAMap()` 中调用 `lockBusinessDistrictViewport()`；页面切换回地图页时 `gaodeMap.resize()`。

---

#### 5. 配置与工程文件

**`.env.example`**：

```env
GEMINI_API_KEY=replace_me
GEMINI_MODEL=gemini-2.5-flash
PORT=8000
```

**`.gitignore`**：忽略 `.env`、`__pycache__/`、`.DS_Store`。

**`index.html` / `style.css`**：为重规划弹窗（`replanChoiceModal`）、团购排序弹窗（`dealRankModal`）、AI 导演卡片、地图 pin 等补充结构与样式；未推翻 siigure 的 Tailwind 体系。

---

### 如何本地运行

```bash
# 可选：启用完整 Gemini 能力
cp .env.example .env
# 编辑 .env，填入 GEMINI_API_KEY

python3 server.py
# 浏览器访问 http://127.0.0.1:8000
```

- **未配置 `GEMINI_API_KEY`**：静态页与规则匹配、重规划、团购排序仍可用；AI 导演卡片显示本地兜底。
- **已配置 Key**：`runAI()` 完成后会请求 Gemini，增强意图与方案文案。

---

### 建议演示路径

1. **地图** — 查看锁定商圈内的 POI，点击进入详情  
2. **AI** — 输入需求或快捷 prompt →「开始 AI 匹配」→ 查看规则结果 +（可选）Gemini 导演卡  
3. **重规划** — 在结果页或聊天中触发「模拟排队变长」「换地点」→ 对比候选排序 → 选店或继续等  
4. **成局 / 团购** — 确认匹配 → 成功页「选择团购」→ 查看套餐 AI 排序  

---

### 与 siigure 改动的对照

| 领域 | siigure（`432d08e`） | loranisme（本批） |
|------|----------------------|-------------------|
| 成局状态 | `PLAN_STATUS` 状态机、诚意金锁定 | 换店 / 排队时回到 `NEGOTIATING` 并重置押金相关状态 |
| 匹配主链路 | 规则 `parseIntent` + `runMatching`、稀疏模式 | 匹配后 `enrichWithAIDirector` 润色文案 |
| 异常兜底 | 模拟对方拒绝 → 候补重排 | 换店 / 排队变长 → 候选 POI 排序弹窗 |
| 商业转化 | 成功页展示团购信息 | 多券种生成 + `rankDealCandidates` 排序选择 |
| 地图 | 高德 SDK 展示 | 固定商圈 + 禁交互 |
| 部署 | 以前端静态为主 | 增加 Python 代理层 |

更细的 siigure 改动说明见：[siigure改动部分及解释.md](./siigure改动部分及解释.md)。

---

### 查看代码 diff

```bash
# 两批提交合并 diff
git diff 432d08e..ff21ef3

# 按提交查看
git show 221eb62
git show ff21ef3

# 单文件
git diff 432d08e..ff21ef3 -- app.js
git show ff21ef3 -- server.py
```

---

### 注意事项 / 后续可做

1. **协作冲突点**：`app.js` 为双方高频修改文件，并行开发时合并需留意局态机与 `enrichWithAIDirector` 的调用顺序。  
2. **安全**：`GEMINI_API_KEY` 仅放在本地 `.env`，勿提交仓库；答辩环境可用无 Key 的兜底路径。  
3. **与架构缺口文档的关系**：`demo-open-issues-and-architecture-gaps.md` 中部分「无真实 LLM」描述在本批已部分缓解（Gemini 导演层），但并发锁、真实支付等缺口仍未实现。  
4. **生产化**：`server.py` 为 Demo 级单进程 HTTP；上线需独立 API 服务、鉴权、限流与可观测性。
