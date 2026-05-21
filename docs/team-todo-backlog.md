# Meituan Together — 双人共识 Todo（聊天整理 + 可执行项）

> 来源：siigure × loranisme 聊天记录（2026-05）  
> 用途：期中前 Demo 排期、分工勾选  
> **代码真实进度请以 [`implementation-checklist.md`](./implementation-checklist.md)（诚实版）为准**；本文件为聊天原始待办。  
> **图例**：`[ ]` 未做 · `[~]` 有部分骨架 · `[x]` 已基本可用

---

## 分工约定（聊天里说的）

| 角色 | 近期 | 负责倾向 |
|------|------|----------|
| **siigure** | 下周期中，考完再大块开发 | 已做局态机 / 候补 / 稀疏 / 诚意金等；后续可接力 Profile、品类扩展 |
| **loranisme（你）** | 考前尽量多推 | **AI Section 优先**（队友点名 Demo 成败关键）、地图商家、拒人/改条件叙事、推 `main` |
| **共同** | LLM：DeepSeek（你）或 Gemini 免费层（队友）均可 | `server.py` 抽象成可切换 provider，`.env` 各自 key |

---

## P0 — Demo 必须能讲通（考前优先）

### A. AI Section（队友：太烂，先修这块）

| # | 状态 | 任务 | 验收标准 |
|---|------|------|----------|
| A1 | `[~]` | **LLM 可切换**：`server.py` 支持 DeepSeek（OpenAI 兼容）+ 保留 Gemini | `.env.example` 写清 `DEEPSEEK_API_KEY` / `GEMINI_API_KEY`；无 key 时规则降级不白屏 |
| A2 | `[~]` | **意图解析体验**：AI 页展示解析层（规则 L0 / Agent L2）、置信度、澄清问句 | 低置信度时有 1～2 条可点选澄清，而非静默失败 |
| A3 | `[ ]` | **导演层与匹配联动**：`/api/ai-match` 返回的 `plan_overrides` 真正改排序/文案，并触发 **全量重算分** | 改意图后 `runMatching` 重跑，结果列表分数与说明更新 |
| A4 | `[ ]` | **AI 介入叙事统一**：拒人、改条件、换店后，聊天里固定出现「AI 成局导演」系统消息 + 简短理由 | 三条线话术风格一致，答辩可指同一 Agent |
| A5 | `[ ]` | **延迟与降级 UI**：请求中 loading、超时 toast、fallback 标签可见 | 避免 Demo 时长时间无反馈（架构缺口 §1.1） |

### B. 交互：拒人 → AI 换人 + 重打分（你提的核心故事）

| # | 状态 | 任务 | 验收标准 |
|---|------|------|----------|
| B1 | `[~]` | **拒绝对方后自动介入** | 已有 `simulateMatchReject` + 候补切换；需补：**调用 Agent 或规则重排**、更新 `total_score` 与 breakdown，而非仅换 `selectedMatch` |
| B2 | `[ ]` | **重打分算法可演示** | 聊天/结果页展示「因 B 拒绝，对 C/D 重新计算：距离 xx、预算 xx…」；与 `matching.js` 权重一致 |
| B3 | `[ ]` | **状态机闭环** | `REJECTED` → `FALLBACK_READY` → 用户可「接受候补」进入新聊天；诚意金在拒绝后释放（已有部分逻辑，需 UI 按钮） |
| B4 | `[ ]` | **（可选）真双边**：对端拒绝用按钮模拟，而非仅 dev「模拟对方拒绝」 | 答辩可说「非一键假双确」 |

### C. 交互：改时间更短 / 预算偏高 → 对方同意 → AI 重分配（你提）

| # | 状态 | 任务 | 验收标准 |
|---|------|------|----------|
| C1 | `[ ]` | **快捷回复「时间短一点」** | 目前快捷条无此项；需加入并与「预算有点高」同级 |
| C2 | `[ ]` | **模拟对方同意改动** | 用户发改时间/预算后，1～2s 内对端消息：「可以，按你说的来」 |
| C3 | `[ ]` | **Agent 自动重分配** | 更新 `intent_patch`（时间/预算）→ 重跑匹配 → 推送新 Top 方案或换 POI/搭子；聊天 AI 消息说明原因 |
| C4 | `[~]` | **与重规划区分** | 「预算高」可走降人均 POI；「时间短」可走更近/等待更短 POI；不要和 `change_place` 混为一谈 |

### D. 地图 & 商家详情（你提：尽量美团感）

| # | 状态 | 任务 | 验收标准 |
|---|------|------|----------|
| D1 | `[ ]` | **POI 详情 Bottom Sheet**：头图、评分、人均、营业时间、标签、团购入口 | Mock 用 `image_url`（占位图或 Unsplash）；布局参考美团商户页 |
| D2 | `[ ]` | **商家图字段**：`mockData.js` 为 Top POI 补 `cover_image`、`album[]` | 地图 marker 点击后能看到图，不是纯文字 |
| D3 | `[~]` | **分类逻辑复查** | `scenes` / `parseIntent` / `activityMatchesPoi` / 地图筛选四者一致；修掉「选了咖啡却出火锅」类 bug |
| D4 | `[ ]` | **供给 API 占位** | `server.py` 或前端注释预留美团 POI API；Demo 仍用 Mock，但结构像真接入 |

---

## P1 — 体验增强（有时间再做）

### E. Profile + 信誉分（你提：简单但要有）

| # | 状态 | 任务 | 验收标准 |
|---|------|------|----------|
| E1 | `[ ]` | **Profile 基础 UI**：头像、昵称、常去区域、搭子标签 | 替换当前「数据健康度」为主展示（健康度可收进开发者折叠） |
| E2 | `[ ]` | **信誉分算法 v1** | 输入：成局次数、完成率、被鸽/拒绝率、评价（Mock）；输出 0–100 + 等级（如「靠谱搭子」） |
| E3 | `[ ]` | **信誉分暴露点** | 匹配卡片、聊天顶部、对方 Profile 展示对方信誉；匹配权重可加 5%～10% 信誉项 |
| E4 | `[ ]` | **mock 用户字段** | `users` 增加 `avatar_url`、`reputation_score`、`completed_plans` |

### F. 工程与协作

| # | 状态 | 任务 | 负责人 |
|---|------|------|--------|
| F1 | `[ ]` | **合并并 push `main`** | 双方改动无冲突；README 写启动方式 `python3 server.py` |
| F2 | `[ ]` | **`.env` 不提交** | 仅 `.env.example`；文档写 DeepSeek / Gemini 二选一 |
| F3 | `[ ]` | **Demo 脚本 3 分钟** | `docs/demo-script.md`：① AI 匹配 ② 拒人换人 ③ 改预算重分配 ④ 成局买券 |
| F4 | `[ ]` | **更新缺口文档** | 闭环项在 `demo-open-issues-and-architecture-gaps.md` 打勾 |

---

## P2 — 产品方向（考完 / 下迭代）

### G. 品类扩展：本地生活不止吃喝（你提，队友 OK）

| # | 状态 | 任务 | 说明 |
|---|------|------|------|
| G1 | `[ ]` | **新场景枚举** | 攀岩搭子、骑行搭子、桌游搭子（细分 RPG / 跑团 / 聚会桌游） |
| G2 | `[ ]` | **mockData** | 每类至少 3 个 POI + 2 个背景用户需求 + 意图样例 |
| G3 | `[ ]` | **matching 规则** | `parseIntent` 关键词 + `activityMatchesPoi` + 地图 `scenes`  Tab |
| G4 | `[ ]` | **非餐饮 POI 详情** | 攀岩馆：难度/装备；桌游吧：包厢/人均时长；骑行：路线长度 |
| G5 | `[ ]` | **AI Prompt** | Agent system prompt 认识新品类，避免全推荐韩餐 |

---

## 建议执行顺序（loranisme 考前一周）

```
Day 1–2:  A1 A3 B1 B2 C1 C2 C3        ← AI + 两条交互故事线
Day 3:    D1 D2 D3                    ← 地图商家像美团
Day 4:    A2 A4 A5 F1 F3              ← 抛光 + push main + 演示脚本
（考完）  E1–E4 + G1–G5               ← Profile 信誉 + 品类扩展
```

---

## 与现有代码对照（避免重复造轮子）

| Todo | 已有基础 | 缺口 |
|------|----------|------|
| B1 拒人换人 | `simulateMatchReject`、`PLAN_STATUS.REJECTED` | 无 Agent、无重算分展示 |
| C 改预算 | `handleQuickReply` 仅 `setPlanStatus(NEGOTIATING)` | 无对端同意、无重匹配 |
| A Agent | `server.py` + `fetchAiDirector` | 前端合并不完整；Gemini only |
| D 商家 | `merchant_layer` in AI JSON | 地图 POI 卡片仍偏简 |
| E Profile | `renderProfilePage` 仅统计数字 | 无头像昵称信誉 |
| G 品类 | mock 有「桌游」类目 | 无攀岩/骑行/跑团细分 |

---

## 待两人对齐（勾前先聊一句）

- [ ] 「弄了」= 已 push `main` 还是只接了 Gemini？  
- [ ] 考前 Demo **最小集**是否 = P0 全部（A+B+C+D）？  
- [ ] 信誉分是否进匹配权重，还是 Profile 纯展示？  
- [ ] 新品类 P2 是否只 Mock 标签，不做真实地图点位？

---

*维护：完成项把 `[ ]` 改为 `[x]`，并在文首更新「最后同步日期」。*
