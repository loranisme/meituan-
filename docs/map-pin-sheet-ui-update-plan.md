# Map Pin and Bottom Sheet UI Update Plan

## 1. 更新目标

本阶段只精修主地图里最影响 demo 观感的两个 UI 部分：

1. **地图 Pin 分级**：让用户一眼看出普通地点、热门地点、AI 推荐地点和当前选中地点。
2. **POI Bottom Sheet 商家卡升级**：点击 pin 后，让用户立刻理解这个地点为什么能成局。

本阶段不做：

1. 不接真实地图 API。
2. 不重写热力图算法。
3. 不做真实路线规划。
4. 不改 AI 匹配主链路。

Demo 口径：

```text
地图不是展示“附近的人”，而是展示“附近地点上的成局机会”。
Pin 负责让用户快速发现哪里热、哪里适合我；Bottom Sheet 负责解释这个地点为什么能马上成局。
```

## 2. 当前问题

### 2.1 Pin 层问题

当前 pin 已经能展示需求数和热门状态，但层级还可以更清楚：

1. 普通 pin、热门 pin、AI 推荐 pin、选中 pin 的视觉差异不够强。
2. 所有 pin 信息密度接近，地图扫读时不够快。
3. AI 推荐结果和地图点位之间的关系还不够明显。
4. 选中 pin 没有足够强的“我正在看这里”的视觉锚点。

### 2.2 Bottom Sheet 问题

当前 POI sheet 已经有商家图、基础信息、需求和 CTA，但可以更像美团业务卡：

1. “商家信息”和“成局机会”还可以分层。
2. 团购、等待、想约人数、即将成局这些业务字段可以更突出。
3. 当前需求列表可以更像真实用户需求卡。
4. CTA 可以按主次重新排列，突出“让 Agent 安排”。

## 3. 第一部分：地图 Pin 分级

### 3.1 Pin 类型

建议定义 4 种 pin：

| 类型 | 触发条件 | 视觉目标 |
|------|----------|----------|
| 普通 pin | 默认 POI | 地图基础信息，不抢视觉 |
| 热门 pin | `hot_score > 80` 或 `buddy_demand_count >= 7` | 告诉用户这里正在热 |
| AI 推荐 pin | POI 命中当前 `matchResults` | 告诉用户这里和我的需求有关 |
| 选中 pin | `selectedPOI` | 当前浏览焦点，必须最突出 |

### 3.2 普通 Pin

展示：

```text
图标 + 想约人数
```

示例：

```text
[饭] 4 想约
```

视觉：

```text
白底胶囊
轻阴影
品类小图标保留
不显示店名
```

原因：

地图上普通点太多时，店名会让画面拥挤。普通 pin 只需要告诉用户“这里有成局机会”。

### 3.3 热门 Pin

展示：

```text
图标 + 想约人数 + 热
```

示例：

```text
[饭] 9 想约  热
```

视觉：

```text
白底或微红底
红色“热”角标
外圈淡红光
比普通 pin 稍大
```

触发建议：

```js
const isHotPin = poi.hot_score > 80 || poi.buddy_demand_count >= 7;
```

### 3.4 AI 推荐 Pin

展示：

```text
AI 分数 + 想约人数
```

示例：

```text
AI 89 · 7 想约
```

视觉：

```text
黄色描边
左侧增加 AI 小标
外圈品牌黄光
优先级高于热门 pin
```

触发建议：

```js
const matchScore = matchScoreMap[poi.poi_id];
const isAIPin = Boolean(matchScore);
```

显示逻辑：

1. 如果是 AI 推荐 pin，展示 `AI ${matchScore}`。
2. 如果不是 AI 推荐，但热门，则展示 `热`。
3. 如果只是普通，则展示想约人数。

### 3.5 选中 Pin

展示：

```text
店名 + AI 分 / 想约人数
```

示例：

```text
Seoul Bowl
AI 89 · 7 人想约
```

视觉：

```text
放大 1.12 倍
品牌黄描边
更强阴影
z-index 最高
显示店名浮标
```

交互：

1. 点击 pin 后，该 pin 进入 selected 状态。
2. Bottom Sheet 滚动或更新到对应 POI。
3. 如果该 POI 是 AI 推荐点，保留 AI 分数。

## 4. Pin 内容规则

### 4.1 地图默认态

默认态只展示：

```text
品类图标 + 想约人数
```

热门展示：

```text
品类图标 + 想约人数 + 热
```

### 4.2 AI 匹配后

跑完 AI 后，命中 `matchResults` 的 pin 展示：

```text
AI 分数 + 想约人数
```

例如：

```text
AI 89 · 7 想约
```

### 4.3 选中态

选中态展示：

```text
店名
AI 分数 / 想约人数 / 距离
```

例如：

```text
Seoul Bowl
AI 89 · 0.8km
```

## 5. Pin 代码改动入口

主要文件：

```text
app.js
style.css
```

### 5.1 `pinSummaryHTML(poi, matchScore)`

建议改成负责输出三种摘要：

```js
function pinSummaryHTML(poi, matchScore) {
  if (matchScore) {
    return `
      <span class="pin-ai-score">AI ${matchScore}</span>
      <span class="pin-count"><b>${poi.buddy_demand_count}</b><small>想约</small></span>
    `;
  }

  return `
    <span class="pin-count"><b>${poi.buddy_demand_count}</b><small>想约</small></span>
    ${isHotPoi(poi) ? "<em>热</em>" : ""}
  `;
}
```

### 5.2 新增 `isHotPoi(poi)`

```js
function isHotPoi(poi) {
  return Number(poi.hot_score || 0) > 80 || Number(poi.buddy_demand_count || 0) >= 7;
}
```

### 5.3 `renderMockMapPins()`

给 pin 增加 class：

```js
const isHot = isHotPoi(poi);
const isAI = Boolean(matchScore);
const isSelected = poi.poi_id === appState.selectedPOI?.poi_id;

class="map-pin ${isHot ? "is-hot" : ""} ${isAI ? "is-ai" : ""} ${isSelected ? "is-selected" : ""}"
```

### 5.4 `renderAmapPins()`

同样保持 class 逻辑一致，避免真实高德模式和 mock 模式样式不一致。

## 6. Pin CSS 建议

### 6.1 普通 Pin

```css
.map-pin {
  background: #fff;
  border: 1px solid rgba(255,255,255,0.9);
  box-shadow: 0 5px 14px rgba(15,23,42,0.12);
}
```

### 6.2 热门 Pin

```css
.map-pin.is-hot {
  background: #fffafa;
  border-color: rgba(255,36,66,0.34);
  box-shadow:
    0 0 0 3px rgba(255,36,66,0.12),
    0 8px 20px rgba(255,36,66,0.16);
}
```

### 6.3 AI 推荐 Pin

```css
.map-pin.is-ai {
  border-color: #f5c800;
  background: #fffdf0;
  box-shadow:
    0 0 0 4px rgba(255,224,51,0.34),
    0 9px 24px rgba(15,23,42,0.16);
}

.pin-ai-score {
  font-size: 10px;
  font-weight: 900;
  color: #1a1a1a;
  background: #ffe033;
  border-radius: 999px;
  padding: 2px 5px;
}
```

### 6.4 选中 Pin

```css
.map-pin.is-selected {
  transform: translate(-50%, -50%) scale(1.12);
  z-index: 8;
  border-color: #ffe033;
  border-width: 2px;
  box-shadow:
    0 0 0 5px rgba(255,224,51,0.38),
    0 12px 28px rgba(15,23,42,0.22);
}
```

## 7. 第二部分：Bottom Sheet 商家卡升级

### 7.1 信息架构

Bottom Sheet 建议分成 5 层：

```text
1. 商家 Hero
2. 商家基础信息
3. 成局机会摘要
4. 当前需求列表
5. 操作按钮
```

### 7.2 商家 Hero

展示：

```text
商家图片
营业状态
品类标签
```

建议：

1. 保留当前 `merchant-hero`。
2. 图片上可加小标签：

```text
营业中
韩餐
```

### 7.3 商家基础信息

展示：

```text
Seoul Bowl 韩式简餐
4.6 ★ · 韩餐 · 0.8km · 步行约 9 分钟
人均 ¥100 · 等待 12 分钟
```

重点：

1. 距离和步行时间放前面。
2. 等待时间要明显。
3. 人均价格与团购价格区分。

### 7.4 成局机会摘要

新增一个高亮区块：

```text
这里为什么容易成局

7 人最近想约
2 个即将成局
等待 12 分钟
双人套餐 ¥76/人
```

视觉：

```text
浅黄色背景
四宫格数据
数字加粗
```

建议字段来源：

| 展示字段 | 数据来源 |
----------|----------|
| 最近想约 | `poi.buddy_demand_count` |
| 即将成局 | 可 mock：`Math.max(1, Math.round(poi.buddy_demand_count / 4))` |
| 等待时间 | `poi.wait_time_min` |
| 团购 | `poi.deal_text` 或 `getDeal(poi.poi_id)` |

### 7.5 适合什么局

展示：

```text
适合：低压力 1v1 / 轻松聊天 / 晚饭
```

可以复用现有 `merchantFitSummary(poi)`：

```text
title: 适合边吃边聊
text: 第一次见面选这类店比较稳，排队不久、预算清楚，聊天压力低。
chips: 韩餐 / 轻松聊天 / 预算清楚
```

### 7.6 当前需求列表

需求卡建议更真实一点：

```text
M-27
今晚 18:30 · 想吃韩餐 · 轻松聊天
预算 ¥60-90 · 距你 0.5km · 已验证

L-42
今晚 19:00 · 想找低压力饭搭子
预算 ¥50-80 · 不想太尴尬
```

视觉：

```text
小头像 / 匿名名
时间 + 意图
预算 + 社交风格
已验证 badge
```

注意：

1. 不展示完整个人主页。
2. 只展示本次 intent 和履约可信字段。
3. 符合“非社交 App”的定位。

### 7.7 CTA 排序

建议按钮顺序：

```text
主按钮：让 Agent 安排
次按钮：加入这个局
轻按钮：我也想去
```

原因：

你的项目主线已经升级到个性化 AI Agent，所以地图点击后的主 CTA 应该导向 Agent 生成方案。

按钮文案建议：

```text
让 Agent 安排
加入这个局
我也想去
```

点击行为：

| 按钮 | 行为 |
------|------|
| 让 Agent 安排 | 带 POI constraint 跳转 AI 页并自动 runAI |
| 加入这个局 | 选择当前需求并进入匹配/确认流程 |
| 我也想去 | 生成一条当前用户 demand 或展示 toast |

## 8. Bottom Sheet 代码改动入口

主要函数：

```text
updatePOISheet()
getFakeDemands(poi)
merchantFitSummary(poi)
merchantDealShort(poi)
defaultIntentTextForPoi(poi)
```

### 8.1 `updatePOISheet()`

建议调整 HTML 顺序：

```text
merchant-hero
merchant-title
merchant-meta
map-merchant-opportunity-card
merchant-fit-section
map-merchant-live
map-merchant-actions
```

### 8.2 新增机会卡 helper

```js
function opportunitySummaryForPoi(poi) {
  return {
    demandCount: poi.buddy_demand_count || 0,
    formingCount: Math.max(1, Math.round((poi.buddy_demand_count || 0) / 4)),
    waitLabel: `${poi.wait_time_min} 分钟`,
    dealLabel: merchantDealShort(poi)
  };
}
```

### 8.3 新增需求卡 helper

```js
function demandCardHTML(demand) {
  return `
    <button type="button" class="map-demand-row" data-demand="${demand.demand_id}">
      ...
    </button>
  `;
}
```

目的：

把 `updatePOISheet()` 里的 HTML 拆出来，后面更容易精修。

## 9. CSS 建议

### 9.1 成局机会卡

```css
.map-opportunity-card {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  background: #fff8e6;
  border: 1px solid rgba(245,200,0,0.42);
}

.map-opportunity-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.map-opportunity-grid div {
  background: #fff;
  border-radius: 12px;
  padding: 8px;
}

.map-opportunity-grid b {
  display: block;
  font-size: 16px;
}

.map-opportunity-grid span {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #6b7280;
}
```

### 9.2 当前需求卡

```css
.map-demand-row {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid #eee;
  text-align: left;
}

.map-demand-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f3f4f6;
  display: grid;
  place-items: center;
  font-weight: 800;
}
```

### 9.3 CTA 区

```css
.map-merchant-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.map-merchant-actions .agent-main {
  grid-column: 1 / -1;
}
```

## 10. 验收标准

### 10.1 Pin 分级

完成后应能看到：

1. 普通 pin 和热门 pin 视觉不同。
2. AI 匹配后，命中方案的 POI 显示 `AI 分数`。
3. 当前选中 pin 明显放大或高亮。
4. pin 不因文字过多导致地图拥挤。

### 10.2 Bottom Sheet

完成后点击任意 pin，应能看到：

1. 商家图和基础信息。
2. 距离、步行时间、等待、人均。
3. “这里为什么容易成局”机会卡。
4. 当前需求列表。
5. `让 Agent 安排`、`加入这个局`、`我也想去` 三个 CTA。

### 10.3 Demo 讲述

演示者应能讲清楚：

```text
Pin 不是普通 POI 点，而是成局机会点。
点开后，Bottom Sheet 会解释这个地点为什么适合成局，并把用户导向 Agent 安排或直接加入。
```

## 11. 推荐实施顺序

### P0. Pin 分级

1. 增加 `isHotPoi()`。
2. 增强 `pinSummaryHTML()`。
3. 给 `renderMockMapPins()` 和 `renderAmapPins()` 增加 `is-ai` class。
4. 补充 `.map-pin.is-ai` 样式。

### P0. Bottom Sheet 机会卡

1. 新增 `opportunitySummaryForPoi(poi)`。
2. 在 `updatePOISheet()` 中加入“这里为什么容易成局”区块。
3. 强化距离、等待、团购字段。

### P1. 当前需求卡精修

1. 拆出 `demandCardHTML(demand)`。
2. 增加头像、验证、预算、社交风格展示。

### P1. CTA 重排

1. `让 Agent 安排` 作为主按钮。
2. `加入这个局` 和 `我也想去` 作为次级按钮。

## 12. 最小可交付版本

如果时间很紧，只做以下内容：

1. AI 推荐 pin 显示 `AI 分数`。
2. 热门 pin 更明显。
3. 选中 pin 放大并高亮。
4. Bottom Sheet 增加“这里为什么容易成局”四宫格。
5. CTA 改成 `让 Agent 安排` 优先。

最小版本完成后，地图就会从“mock 点位图”变成“成局机会地图”。
