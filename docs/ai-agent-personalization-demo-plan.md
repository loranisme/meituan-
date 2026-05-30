# AI Agent Personalization Demo Update Plan

## 1. 更新目标

把当前 AI section 从“一次性 AI 匹配”升级成“我的出门 Agent”。

Demo 要让观众快速看懂三件事：

1. 用户不需要手动筛选条件，只要自然说出今天的状态和需求。
2. Agent 会读取用户历史行为和偏好记忆，生成更个性化的成局方案。
3. 用户对推荐的反馈会反哺 Agent，让它下次更像自己的私人助手。

建议 demo 口径：

```text
传统匹配工具要求用户自己选时间、预算、地点、人数。
走起不的 AI Agent 允许用户只说一句自然语言，比如“今天有点累，不想走太远，预算别太高”。
Agent 会结合用户在美团里的浏览、收藏、历史成局、拒绝反馈和消费习惯，自动生成可执行的本地生活方案。
```

## 2. 本次更新范围

本阶段偏 demo，不做真实长期训练，也不做复杂后端画像系统。

要做的是：

1. 用 mock 数据展示“Agent 已经记住我”。
2. 在推荐结果里展示“Agent 为什么基于我的记忆这样推荐”。
3. 加入轻量反馈按钮，展示“Agent 记忆被更新”。

不做的是：

1. 不接真实用户长期数据库。
2. 不做真实模型微调。
3. 不改变现有规则匹配作为真相源的架构。
4. 不重写现有 AI director 后端，只增强前端 demo 表达。

## 3. 新增页面主线

当前主线：

```text
输入需求 -> 解析标签 -> 规则匹配 -> AI 文案增强 -> 方案结果
```

更新后主线：

```text
一句话表达今天状态
-> Agent 读取个人记忆
-> Agent 理解当前需求
-> Agent 生成个性化成局方案
-> 用户反馈
-> Agent 更新记忆
```

页面标题建议从：

```text
把一句话变成今晚的方案
```

升级为：

```text
我的出门 Agent
```

副标题建议：

```text
只说今天的状态，Agent 会结合你的历史偏好自动安排。
```

## 4. 新增 Demo 模块

### 4.1 Agent 记忆卡片

位置：AI 输入框下方、解析结果上方。

目的：让观众一眼看到“这个 Agent 记得我”。

示例文案：

```text
小团的 Agent 记忆

最近常选：韩餐 / 咖啡 / 轻运动
默认预算：¥60-90
距离偏好：1.5km 内
社交偏好：低压力 1v1
避免推荐：排队超过 15 分钟、太吵的多人局
团购偏好：券后价格稳定、双人套餐优先
```

可视化建议：

```text
[近距离优先] [低压力] [1v1] [预算可控] [少排队] [不太吵]
```

### 4.2 本次需求理解卡片

位置：现有 `Agent 理解结果` 卡片升级。

目的：把用户一句话拆成“当下状态 + 硬条件 + 软偏好”。

示例输入：

```text
今天有点累，不想走太远，预算别太高，想找个人吃点东西但别太尴尬。
```

示例输出：

```text
当前状态：低能量 / 想省心
硬条件：近距离、预算可控
软偏好：低压力、不尴尬、1v1 优先
Agent 判断：适合韩餐、咖啡或安静轻食，不适合 KTV / 多人热闹局
```

### 4.3 个性化推荐理由

位置：每张推荐卡片中，替换或增强当前 `为什么是这家店 / 这个人 / 这个时间`。

目的：证明推荐不是泛泛匹配，而是基于用户记忆。

示例：

```text
为什么适合你：

1. 距离 0.8km，符合你常选的 1.5km 内偏好。
2. 等待 12 分钟，低于你不喜欢的 15 分钟阈值。
3. 对方也是轻松聊天型，降低尴尬感。
4. 韩餐是你最近浏览和成局最多的类型。
5. 券后价格在你的默认预算内。
```

### 4.4 反馈培养 Agent

位置：推荐卡片按钮区。

新增按钮：

```text
喜欢这个
太远了
太吵了
预算太高
以后少推荐这类
```

点击后出现 toast 或 notice：

```text
Agent 已更新记忆：以后会优先推荐 1.5km 内、低等待、低压力场景。
```

或：

```text
已记住：你不喜欢多人热闹局。下次会降低 KTV / 酒吧多人局权重。
```

## 5. 建议数据结构

可以在 `mockData.js` 的 `currentUser` 上新增 demo 画像字段。

建议字段：

```js
agent_memory: {
  preferred_scenes: ["韩餐", "咖啡", "轻运动"],
  default_budget_range: [60, 90],
  distance_preference_km: 1.5,
  social_preference: "低压力 1v1",
  avoid_conditions: ["排队超过 15 分钟", "太吵的多人局"],
  deal_preference: "券后价格稳定、双人套餐优先",
  learned_from: {
    recent_views: ["韩餐", "咖啡", "抱石"],
    accepted_plans: ["Seoul Bowl 韩式简餐", "Powell Coffee"],
    rejected_reasons: ["太远", "太吵", "预算太高"]
  }
}
```

如果不想改 `currentUser` 结构，也可以在 `app.js` 里先加 demo 常量：

```js
const DEMO_AGENT_MEMORY = {
  preferred_scenes: ["韩餐", "咖啡", "轻运动"],
  default_budget_range: [60, 90],
  distance_preference_km: 1.5,
  social_preference: "低压力 1v1",
  avoid_conditions: ["排队超过 15 分钟", "太吵的多人局"],
  deal_preference: "券后价格稳定、双人套餐优先"
};
```

Demo 优先建议：先放在 `app.js`，减少数据迁移风险；后续再沉到 `mockData.js`。

## 6. 建议前端改动入口

### 6.1 `appState`

在 `appState` 中新增：

```js
agentMemory: null,
agentMemoryNotice: "",
agentFeedbackLog: []
```

用途：

1. `agentMemory`：当前 demo 用户的 Agent 记忆。
2. `agentMemoryNotice`：反馈后展示“Agent 已更新记忆”。
3. `agentFeedbackLog`：记录用户本次 demo 点击过的反馈。

### 6.2 `renderAIPage()`

在 AI 输入卡之后新增：

```js
${renderAgentMemoryCard()}
```

建议顺序：

```text
AI 输入卡
Agent 记忆卡片
AI 处理过程
AI Director 卡片
本次理解卡片
推荐结果
```

### 6.3 新增 `renderAgentMemoryCard()`

职责：

1. 展示用户长期偏好。
2. 展示“Agent 从哪些行为学到这些偏好”。
3. 如果有 `agentMemoryNotice`，展示最近一次更新。

建议信息结构：

```text
小团的 Agent 记忆
从浏览、收藏、成局和反馈里学到

常选场景 / 默认预算 / 距离偏好 / 社交偏好 / 避免项 / 团购偏好
```

### 6.4 `renderIntentCard()`

将现有“Agent 理解结果”扩展成三行：

```text
当前状态：低能量 / 想省心
硬条件：近距离、预算可控
软偏好：低压力、不尴尬
```

这些可以先基于 `appState.aiMoodProfile`、`appState.parsedIntent` 和 `agentMemory` 拼文案，不需要复杂算法。

### 6.5 `renderMatchCard(match, index)`

在 `details.why-details` 里新增“基于你的记忆”段落。

建议新增 helper：

```js
function personalizedReasonLines(match, memory) {
  return [
    `距离 ${match.poi.distance_km}km，符合你常选的 ${memory.distance_preference_km}km 内偏好`,
    `等待 ${match.poi.wait_time_min} 分钟，低于你不喜欢的 15 分钟阈值`,
    `${match.intent.category_preference} 命中你最近常选的场景`,
    `券后价格在你的默认预算范围内`
  ];
}
```

注意：文案要允许条件不命中时换成保守说法，避免出现明显假话。

### 6.6 新增反馈处理函数

新增按钮：

```html
<button data-agent-feedback="like">喜欢这个</button>
<button data-agent-feedback="too_far">太远了</button>
<button data-agent-feedback="too_noisy">太吵了</button>
<button data-agent-feedback="too_expensive">预算太高</button>
<button data-agent-feedback="less_like_this">以后少推荐这类</button>
```

新增函数：

```js
function applyAgentFeedback(type, match) {
  // 只做 demo 级状态更新，不做真实持久化
}
```

反馈映射建议：

| 反馈 | Demo 记忆更新 |
|------|---------------|
| `like` | 增强当前场景、社交风格、距离偏好 |
| `too_far` | 降低距离偏好，例如从 1.5km 调到 1.2km |
| `too_noisy` | 添加“避免多人热闹局” |
| `too_expensive` | 降低默认预算上限 |
| `less_like_this` | 添加当前品类到弱化列表 |

## 7. 推荐排序的 Demo 口径

现阶段不必大改 `runMatching()`。

建议先做到“表达层个性化”：

1. 规则匹配仍然使用当前 `runMatching()`。
2. Agent 记忆先用于解释、标签、反馈和轻量排序提示。
3. 如果要增强一点真实感，可在 `rerunMatching()` 后对 Top 3 做轻量重排：

```text
记忆命中 +3
距离超过偏好 -3
等待超过避免阈值 -3
预算超过默认上限 -3
社交风格命中 +2
```

Demo 解释：

```text
底层仍由规则层保证可履约，Agent 记忆只影响个性化排序和解释。
这样能避免黑盒乱推荐，也方便降级。
```

## 8. Demo 脚本

### 8.1 开场

```text
这里我们把 AI Matching 升级成“我的出门 Agent”。
用户不需要手动筛选时间、预算、地点，只要自然说出今天状态。
```

### 8.2 输入

输入：

```text
今天有点累，不想走太远，预算别太高，想找个人吃点东西但别太尴尬。
```

讲解：

```text
Agent 会先识别这是低能量、省心、低压力需求。
然后读取小团过去在美团里的浏览、收藏、历史成局和反馈记录。
```

### 8.3 展示记忆

讲解：

```text
它知道小团平时更常接受 1.5km 内、低等待、低压力 1v1 的方案，
也知道小团不太喜欢排队太久或太吵的多人局。
```

### 8.4 展示推荐

讲解：

```text
所以这次 Agent 没有推荐 KTV 或酒吧多人局，
而是优先推荐近距离韩餐或安静咖啡，并把团购、等待和对方社交风格一起纳入方案。
```

### 8.5 展示反馈

点击：

```text
太吵了
```

展示：

```text
Agent 已更新记忆：以后会降低多人热闹局权重，优先推荐低压力 1v1 场景。
```

讲解：

```text
这一步体现它不是一次性工具，而是会被用户日常选择培养出来的个性化 Agent。
```

## 9. 验收标准

### 9.1 页面可见

完成后，AI section 应该能看到：

1. “我的出门 Agent”标题或同等定位。
2. Agent 记忆卡片。
3. 本次需求理解卡片。
4. 推荐卡片中的“基于你的记忆”理由。
5. 反馈按钮。
6. 点击反馈后的记忆更新提示。

### 9.2 Demo 逻辑可讲

演示者应能按这句话讲清楚：

```text
用户只说自然语言，Agent 同时理解当下状态和长期偏好，再把人、店、时间、预算、团购和社交压力组织成一个可执行方案。
```

### 9.3 不破坏现有链路

必须保持：

1. 原有 `runAI()` 可运行。
2. 无 LLM key 时仍走规则兜底。
3. 现有匹配结果仍能进入邀约、聊天、成功页。
4. `scripts/smoke-test.mjs` 不应因文案更新失败。

## 10. 推荐实施顺序

### P0. Agent 记忆卡片

目标：先让“它记得我”可见。

改动：

1. 增加 demo memory 数据。
2. 增加 `renderAgentMemoryCard()`。
3. 接入 `renderAIPage()`。

### P0. 个性化推荐理由

目标：让推荐理由从通用匹配变成“基于我的历史”。

改动：

1. 增加 `personalizedReasonLines(match, memory)`。
2. 在 `renderMatchCard()` 的 why details 中展示。

### P1. 反馈后记忆更新

目标：展示“Agent 可以被培养”。

改动：

1. 推荐卡新增反馈按钮。
2. 增加 `applyAgentFeedback(type, match)`。
3. 更新 `agentMemoryNotice` 并 toast。

### P2. 轻量个性化重排

目标：让结果顺序也受记忆影响。

改动：

1. 在 `rerunMatching()` 后对 Top 3 做小幅记忆加权。
2. 保留原始规则分，额外展示“个性化加权”。

## 11. 风险与注意事项

1. 不要把 demo 讲成真实模型训练。应该说是“基于用户行为记录形成偏好画像”。
2. 推荐理由不能编造不存在的历史，mock 文案要和 `agent_memory` 一致。
3. 个性化不能覆盖履约约束。距离、预算、库存、时间仍应由规则层兜底。
4. 反馈更新只在本次 demo 状态内生效即可，不需要 localStorage，除非后续明确要持久化。
5. 文案重点是“减少用户思考成本”，不是“替用户做社交判断”。

## 12. 最小可交付版本

如果时间很紧，只做以下内容也能完整展示新逻辑：

1. 一个静态 Agent 记忆卡片。
2. 推荐卡片里新增 4 条“为什么适合你”。
3. 三个反馈按钮：`喜欢这个`、`太远了`、`太吵了`。
4. 点击反馈后展示一条“Agent 已更新记忆”的 notice。

最小版本 demo 结论：

```text
这个 AI section 已经从一次性匹配，升级为能读取记忆、解释个性化选择、并通过反馈继续学习的私人出门 Agent。
```
