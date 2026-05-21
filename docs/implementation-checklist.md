# Meituan Together — 实施清单（诚实版）

> **图例**：`[x]` 已完成 · `[~]` 部分完成 · `[ ]` 未做  
> **最后核对**：2026-05-19 批次 1 补全后

---

## 路线 A — Demo 叙事（P0）

### 1. AI 成局助手

| ID | 状态 | 任务 | 备注 |
|----|------|------|------|
| A1 | [x] | DeepSeek + Gemini | `server.py` + `.env.example` |
| A2 | [x] | L0/L2 + 澄清可点选 | `data-clarify` 按钮触发重跑 |
| A3 | [x] | `plan_overrides` 重排 Top3 | `applyDirectorPlanOverrides` |
| A4 | [x] | 拒人/改条件调 Agent | `directorChatIntervention`（有 Key 时） |
| A5 | [x] | 超时 + fallback 标 | 12s 超时；结果页规则层横幅 |

### 2. 拒人 → AI 换人

| ID | 状态 | 任务 | 备注 |
|----|------|------|------|
| B1 | [x] | `rematchAfterReject` + 重算 | |
| B2 | [x] | 拒人重算卡片 | 聊天内 B→候补 + breakdown |
| B3 | [x] | 接受候补 | |
| B4 | [ ] | 真双边拒绝流 | 仍为「模拟对方拒绝」 |

### 3. 改时间 / 改预算

| ID | 状态 | 任务 | 备注 |
|----|------|------|------|
| C1 | [x] | 「时间短一点」 | |
| C2 | [x] | 对端同意 | |
| C3 | [x] | Agent 介入 | `directorChatIntervention` |
| C4 | [x] | 与换店区分 | 预算→`rankReplanCandidates`；时间→低等待排序 |

### 4. 地图 & 商家

| ID | 状态 | 任务 | 备注 |
|----|------|------|------|
| D1 | [x] | 头图+评分+团购+营业时间 | |
| D2 | [~] | `cover_image` | **无** `album[]` |
| D3 | [~] | 分类一致 | 未全量回归 |
| D4 | [x] | POI API 占位 | `GET /api/meituan-poi` → 501 |
| D-ui | [x] | 地图/商家不重叠 | `map-page-layout` |
| D-ui2 | [x] | 平面示意地图 + 生活圈过滤 | 石羽 2026-05-21 |
| D-ui3 | [~] | 生活圈全屏页 | 交互完整，feed/在线数为演示合成 |
| D-ui4 | [x] | 品牌「走起不」+ 无 emoji UI | `mockData.brand` |

---

## 路线 B — P1

| ID | 状态 | 任务 |
|----|------|------|
| E1 | [x] | Profile |
| E2 | [x] | 信誉算法 |
| E3 | [x] | 信誉暴露 + 5% 权重 |
| E4 | [x] | mock 用户字段 |
| E1b | [x] | AI「换一个时间」 | `changeTimeOnly` |
| E2b | [ ] | 导演时间线 UI |

---

## 路线 C — 工程

| ID | 状态 | 任务 |
|----|------|------|
| F1 | [x] | README + 启动说明 |
| F2 | [x] | `.env.example` |
| F3 | [x] | `demo-script.md` |
| F4 | [ ] | 同步 `demo-open-issues` 勾选 |

---

## 路线 D — P2

| ID | 状态 | 任务 |
|----|------|------|
| G1 | [x] | 攀岩/骑行/桌游细分（场景 Tab + parseIntent + mock POI） |
| G2 | [ ] | T-30 退局演示流 |
| G3 | [ ] | 时间筛选/热度切换 |
| G4 | [ ] | 真美团 POI API |
| G1b | [x] | 非餐饮 POI 详情 `venue_extra` + 商家弹窗 |
| G1c | [x] | AI Prompt 认识新品类 |

---

## 执行记录

| 日期 | 说明 |
|------|------|
| 2026-05-21 | **石羽**：走起不 品牌、平面地图、生活圈全屏页、UI 体系；见 [石羽-改动说明与自测记录.md](./石羽-改动说明与自测记录.md) |
| 2026-05-19 | 诚实清单 + 批次 1 代码补全 |
| 2026-05-19 | P2 G1 品类扩展：攀岩/骑行/桌游（RPG·跑团·聚会） |
