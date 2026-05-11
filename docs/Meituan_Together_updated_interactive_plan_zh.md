# Meituan Together｜增强版交互设计更新文档

## 0. 文档目的

本文件用于更新现有的 **Meituan Together｜一起去** 项目方案，重点解决两个问题：

1. 避免项目过度偏向“社交软件”，保持美团本地生活属性。
2. 借鉴 GitHub MealMate 项目中值得学习的系统设计思路，增强交互功能，让作品不只是静态 demo，而更像一个可运行的产品原型。

---

# 1. 最新项目定位更新

## 1.1 原定位风险

之前设计中包含：

- 附近的人
- 用户 Profile
- 匹配后聊天
- 兴趣标签
- 社交关系可能性

这些元素如果处理不好，会让项目看起来像：

- 附近的人社交 App
- 饭搭子版陌陌
- 本地生活外壳下的社交产品

这会削弱项目与美团本地生活赛道的关系。

---

## 1.2 新定位

### 项目名称

**Meituan Together｜一起去**

### 一句话定义

Meituan Together 是美团 App 内置的 **场景型搭子成局工具**。它不展示“附近的人”，而是展示“附近地点上的本地生活需求”；不构建长期社交关系，而是用 AI 帮用户围绕一次具体的吃饭、KTV、探店、夜宵或娱乐活动完成临时成局。

### 核心概念

**从“发现地点”升级为“组织本地生活”**

### 英文概念

**Local Life Coordination**

---

# 2. 产品边界更新

## 2.1 我们做什么

| 模块 | 说明 |
|---|---|
| 地点上的搭子需求 | 在美团 POI 上展示当前是否有人想一起去 |
| 场景型搭子 | 围绕吃饭、KTV、酒吧、探店等具体场景成局 |
| AI 成局助手 | AI 协调人、地点、时间、预算和社交节奏 |
| 成局确认室 | 匹配后进入有限聊天，用于确认方案 |
| 到店转化 | 成局后自然连接团购、预约、路线、到店 |

## 2.2 我们不做什么

| 不做 | 原因 |
|---|---|
| 不做附近的人裸露展示 | 避免变成陌生人社交软件 |
| 不做关注 / 粉丝关系 | 避免长期社交关系链 |
| 不做个人动态流 | 避免变成社区内容平台 |
| 不做长期个人主页 | 避免重点从场景转移到个人展示 |
| 不做无限制私聊 | 聊天只服务于本次成局 |
| 不做恋爱匹配 | 保持本地生活和消费场景属性 |

---

# 3. 关键设计原则

## 3.1 POI-first，而不是 People-first

地图中心是地点，不是人。

用户看到的是：

- 这家火锅店有 6 人想拼桌
- 这家 KTV 有 4 人想组局
- 这家韩餐店有 2 人想找饭搭子

而不是：

- 附近有谁
- 谁离你 300 米
- 谁想聊天

## 3.2 Intent-first，而不是 Profile-first

展示的是本次活动需求，而不是完整个人资料。

## 3.3 Plan-first，而不是 Chat-first

聊天不是主功能。核心输出是 AI 生成的可执行成局方案。

---

# 4. 三大 Section 更新版设计

---

# Section 1：成局地图 Buddy Map

## 4.1 更新后的 Section 定位

建议从“搭子地图”强化为：

## **成局地图**

它不是“附近的人地图”，而是“附近有哪些本地生活成局机会”。

---

## 4.2 页面重点

地图上展示的是 POI 场所 pin，每个 pin 显示：

- 场所名称
- 类型
- 人均价格
- 评分
- 距离
- 当前搭子需求数
- 是否已有即将成局的小组
- 是否有团购 / 套餐可承接

---

## 4.3 地图 Pin 交互升级

### Pin 默认状态

```text
韩餐店 A
3 人想去
```

### 点击 Pin 后展开 Bottom Sheet

```text
Seoul Bowl 韩式简餐
韩餐｜人均 $22｜评分 4.6｜距离 0.8km

当前成局机会：
1. 今晚 6:30｜饭搭子｜1v1｜预算 $20｜轻松聊天
2. 今晚 7:00｜探店｜2-3 人｜想试新菜
3. 今晚 8:00｜夜宵｜小组｜低压力社交

按钮：
[加入这个局] [让 AI 帮我匹配] [查看团购]
```

---

## 4.4 新增交互功能

### 功能 1：场景筛选

用户可以筛选：

- 饭搭子
- KTV 搭子
- 酒吧搭子
- 火锅拼桌
- 咖啡轻聊
- 探店拍照
- 夜宵搭子

### 功能 2：时间筛选

- 现在
- 午餐
- 晚餐
- 夜宵
- 周末
- 自定义

### 功能 3：热度切换

显示不同维度的热度：

- 当前想去人数
- 即将成局数量
- 团购优惠强度
- AI 推荐强度

### 功能 4：加入已有局

用户可以点击“加入这个局”，不一定要从 AI Matching 开始。

### 功能 5：创建新需求

如果用户没有看到合适的局，可以点击：

```text
我也想去
```

然后生成一条新的 Buddy Demand。

---

## 4.5 Section 1 工程状态设计

```json
{
  "selectedCategory": "饭搭子",
  "selectedTime": "今晚",
  "selectedPOI": "poi_001",
  "visibleDemands": ["demand_001", "demand_002"],
  "bottomSheetOpen": true
}
```

### 需要支持的交互事件

| 事件 | 结果 |
|---|---|
| 点击 Pin | 打开 POI Bottom Sheet |
| 切换筛选 | 刷新地图 pin |
| 点击加入这个局 | 进入 AI 成局助手或确认流程 |
| 点击我也想去 | 创建新的 Buddy Demand |
| 点击团购 | 展示 deal card |

---

# Section 2：AI 成局助手 AI Matching

## 5.1 更新后的 Section 定位

不要叫“AI Matching”这么像社交软件。建议叫：

## **AI 成局助手**

它的目标不是“找人”，而是生成本次本地生活活动的成局方案。

---

## 5.2 AI 成局助手输入

### 输入方式 1：从地图 Pin 进入

用户点击某个 POI 后，AI 已经知道：

- 用户想去哪里
- 该 POI 的类型
- 当前有哪些搭子需求
- 当前有哪些优惠
- 当前地点热度

### 输入方式 2：自然语言输入

例如：

```text
今晚想找一个人吃韩餐，预算 20 刀以内，不想太尴尬，最好轻松聊聊。
```

### 输入方式 3：快速标签

- 预算
- 时间
- 场景
- 人数
- 社交节奏
- 距离范围

---

## 5.3 AI 解析结果展示

AI 把输入解析为本次成局条件：

```json
{
  "activity_type": "饭搭子",
  "target_time": "今晚 18:00-20:00",
  "category_preference": "韩餐",
  "budget_max": 20,
  "group_size": "1v1",
  "social_style": "轻松聊天",
  "distance_tolerance": "15 分钟步行",
  "poi_constraint": "Seoul Bowl 韩式简餐"
}
```

页面要把这些字段可视化成标签：

```text
饭搭子｜今晚｜韩餐｜$20以内｜1v1｜轻松聊天｜15分钟内
```

---

## 5.4 匹配逻辑更新

### 核心原则

不是匹配“谁和谁最像”，而是匹配：

```text
谁 + 哪个地点 + 什么时间 + 什么预算
能够最容易成局
```

### 方案评分

```text
PlanScore =
成局可行性 35%
+ 场所匹配度 25%
+ 时间匹配度 15%
+ 预算匹配度 10%
+ 社交节奏兼容度 10%
+ 团购 / 到店转化潜力 5%
```

### 为什么降低兴趣标签权重

兴趣标签只做辅助，不做核心。因为项目主线不是社交兴趣匹配，而是本地生活成局。

---

## 5.5 AI 输出升级

不要只输出：

```text
你和 M-27 匹配度 89%
```

要输出：

```text
AI 已生成 2 个可成局方案
```

### 方案 A

```text
推荐方案：今晚 6:30 去 Seoul Bowl

参与者：
- 你
- 匿名用户 M-27

地点：
Seoul Bowl 韩式简餐

理由：
- 你们都想今晚吃韩餐
- 预算都在 $20 左右
- 都选择低压力轻松聊天
- 该店距离双方都在 15 分钟以内
- 当前等待时间 12 分钟
- 有双人套餐优惠

状态：
高概率成局
```

### 方案 B

```text
备选方案：今晚 7:00 去 Korean Bowl

理由：
- 更便宜
- 等待时间更短
- 但距离略远
```

---

## 5.6 新增交互功能

### 功能 1：方案对比

展示 2–3 个方案：

| 方案 | 地点 | 时间 | 成局概率 | 人均 | 等待 |
|---|---|---|---:|---:|---:|
| A | Seoul Bowl | 6:30 | 89% | $22 | 12min |
| B | Korean Bowl | 7:00 | 82% | $18 | 5min |
| C | BBQ House | 7:30 | 74% | $25 | 20min |

### 功能 2：换一个地点

用户点击后，AI 保留搭子和时间，重新推荐地点。

### 功能 3：换一个时间

用户点击后，AI 保留搭子和地点，重新推荐时间。

### 功能 4：换一个局

用户点击后，AI 重新匹配其他 Buddy Demand。

### 功能 5：解释为什么

用户点击“为什么推荐”，展示 explainable matching：

```text
推荐理由：
1. 时间重合度高
2. 预算一致
3. 该地点符合双方偏好
4. 当前已有 3 条相似需求
5. 有团购优惠，成局后的消费转化路径清晰
```

---

## 5.7 AI 成局助手工程实现

### 推荐实现方式

规则评分 + AI 文案生成。

#### 规则层负责

- 过滤不符合条件的 Buddy Demand
- 计算时间 / 预算 / 地点 / 场景分数
- 输出 Top 3 Plan

#### AI 层负责

- 解析自然语言
- 生成方案解释
- 生成开场白
- 生成重规划说明

---

# Section 3：成局确认室 Match Room

## 6.1 更新后的 Section 定位

不要叫 Chat Room。建议叫：

## **成局确认室**

它不是聊天软件，而是用于确认本次活动方案的轻量沟通空间。

---

## 6.2 页面结构

### 顶部：本次方案卡片

固定展示：

```text
待确认方案

地点：Seoul Bowl 韩式简餐
时间：今晚 6:30
人数：2 人
预算：$20–25
优惠：双人套餐立减 $6
状态：等待双方确认
```

### 中部：参与者卡片

展示的是本次 intent，而不是完整 profile。

```text
匿名用户 M-27
本次目的：韩餐饭搭子
标签：轻松聊天｜预算 $20｜Westwood｜1v1
账号状态：美团已验证
成局记录：完成过 5 次到店成局
```

### 下方：有限聊天

聊天只围绕方案确认。

---

## 6.3 新增交互功能

### 功能 1：双方确认

- 当前用户点击确认
- 对方模拟点击确认
- 方案状态变成 confirmed

### 功能 2：修改方案

用户可以点击：

- 修改时间
- 换地点
- 加一个人
- 改预算
- 取消

### 功能 3：AI 生成沟通话术

```text
AI 建议：
“我看系统推荐 6:30 去 Seoul Bowl，这家离我们都比较近，而且有双人套餐，你觉得可以吗？”
```

### 功能 4：成局成功页

双方确认后展示：

```text
成局成功

下一步：
[购买双人套餐]
[查看路线]
[加入日历]
[到店后打卡]
```

### 功能 5：安全操作

- 举报
- 取消匹配
- 不再推荐此用户
- 仅保留匿名身份

---

## 6.4 成局确认室状态机

```text
matched
  ↓
waiting_user_confirmation
  ↓
waiting_partner_confirmation
  ↓
confirmed
  ↓
deal_or_route_entry
```

如果用户修改：

```text
matched
  ↓
modify_request
  ↓
AI_replanning
  ↓
new_plan_generated
  ↓
waiting_confirmation
```

---

# 7. GitHub MealMate Repo 值得学习的部分

## 7.1 不建议照搬的部分

该 repo 更偏后端微服务练习，包含：

- Spring Cloud 微服务
- OAuth2 登录
- Redis
- Gateway
- 订单 / 积分 / 关注 / Feed
- 附近的人

这些对本项目有参考价值，但不适合在 hackathon demo 中完整复刻。

### 不建议照搬

| 模块 | 原因 |
|---|---|
| 重微服务架构 | 会拖慢开发，和 NoCode/CatPaw 不匹配 |
| 关注 / 粉丝关系 | 容易变成社交软件 |
| 附近的人 | 容易偏离本地生活 |
| 美食动态 Feed | 容易变成内容社区 |
| 复杂订单系统 | 不是本项目 MVP 核心 |

---

## 7.2 值得学习的部分

### 借鉴点 1：模块化拆分

原 repo 有用户、餐厅、社交、位置、订单、积分等模块。你的项目可以借鉴这种拆分，但换成更适合美团搭子的模块：

```text
Meituan Together
├── POI Module
├── Buddy Demand Module
├── AI Matching Module
├── Match Room Module
├── Deal Conversion Module
├── Trust & Safety Module
└── User Preference Module
```

### 借鉴点 2：附近位置能力，但不展示“附近的人”

可以借鉴“位置聚合”的思想，但展示对象要从人变成：

```text
附近地点上的成局机会
```

更新后逻辑：

```text
用户位置
  ↓
附近 POI
  ↓
POI 上的 Buddy Demand
  ↓
成局机会排序
```

而不是：

```text
用户位置
  ↓
附近的人
```

### 借鉴点 3：餐厅模块可以变成 POI + 成局热度

你需要增强字段：

- buddy_demand_count
- active_plan_count
- conversion_potential
- deal_available
- suitable_activity_types
- hot_score

### 示例

```json
{
  "poi_id": "poi_001",
  "name": "Seoul Bowl 韩式简餐",
  "avg_price": 22,
  "rating": 4.6,
  "buddy_demand_count": 8,
  "active_plan_count": 2,
  "hot_score": 91,
  "deal_available": true
}
```

### 借鉴点 4：Feed 思路可以改造成 Buddy Demand Feed

不是发动态，而是发布本地生活需求。

```json
{
  "demand_id": "demand_001",
  "poi_id": "poi_001",
  "activity_type": "饭搭子",
  "target_time": "今晚 6:30",
  "budget_range": [15, 25],
  "social_style": "轻松聊天",
  "status": "waiting"
}
```

地图上显示的需求数，就是 Buddy Demand Feed 聚合结果。

### 借鉴点 5：积分 / 签到可以改成 Trust Score

原 repo 中的积分、签到思路可以转化为信任机制。

你的项目不应该展示社交魅力，而应该展示本地生活可信度。

### Trust Score 可包含：

- 美团账号已验证
- 历史成局次数
- 到店确认次数
- 取消率
- 举报风险
- 是否使用过团购 / 到店服务

### 示例

```text
美团已验证
完成 5 次成局
低取消率
```

这比展示个人魅力更贴美团场景。

---

# 8. 新增强交互功能清单

## 8.1 Section 1 强交互

1. 地图筛选：按场景、时间、预算筛选 POI。
2. Pin 点击 Bottom Sheet：点击地图 pin 弹出地点与搭子需求详情。
3. 我也想去：用户点击后生成新的 Buddy Demand。
4. 加入这个局：用户可以直接加入已有搭子需求。
5. 热度切换：显示想去人数、即将成局、优惠力度、AI 推荐。

## 8.2 Section 2 强交互

1. 自然语言输入。
2. AI 解析标签展示。
3. 方案对比。
4. 为什么推荐。
5. 换一个地点。
6. 换一个时间。
7. 换一个局。
8. 动态重规划。

## 8.3 Section 3 强交互

1. 成局确认卡片。
2. 双方确认状态。
3. AI 开场白。
4. 修改方案。
5. 成局成功页面。
6. 安全按钮。

---

# 9. 新增数据模型更新

## 9.1 POI 新字段

```json
{
  "poi_id": "poi_001",
  "name": "Seoul Bowl 韩式简餐",
  "category": "餐饮",
  "sub_category": "韩餐",
  "avg_price": 22,
  "rating": 4.6,
  "distance_km": 0.8,
  "wait_time_min": 12,
  "buddy_demand_count": 8,
  "active_plan_count": 2,
  "hot_score": 91,
  "deal_available": true,
  "suitable_activity_types": ["饭搭子", "探店", "夜宵"]
}
```

## 9.2 BuddyDemand 新字段

```json
{
  "demand_id": "demand_001",
  "poi_id": "poi_001",
  "user_id": "user_027",
  "activity_type": "饭搭子",
  "target_time": "今晚 18:30",
  "budget_range": [15, 25],
  "social_style": "轻松聊天",
  "group_size": "1v1",
  "intent_text": "想找人吃韩餐，不想太尴尬",
  "status": "waiting",
  "visibility": "anonymous"
}
```

## 9.3 MatchPlan 新字段

```json
{
  "match_id": "match_001",
  "plan_score": 89,
  "selected_poi_id": "poi_001",
  "selected_demand_id": "demand_001",
  "suggested_time": "今晚 18:30",
  "backup_poi_id": "poi_002",
  "status": "waiting_confirmation",
  "user_confirmed": false,
  "partner_confirmed": false,
  "ai_reason": "时间、预算、地点和社交节奏都匹配",
  "deal_id": "deal_001"
}
```

## 9.4 Trust Profile 字段

```json
{
  "user_id": "user_027",
  "verified_status": true,
  "completed_plans": 5,
  "cancel_rate": 0.08,
  "report_risk": "low",
  "show_level": "basic"
}
```

---

# 10. 更像产品的状态设计

## 10.1 Buddy Demand 状态

```text
draft
  ↓
waiting
  ↓
matched
  ↓
confirmed
  ↓
completed
```

## 10.2 Match Plan 状态

```text
generated
  ↓
waiting_confirmation
  ↓
confirmed
  ↓
deal_clicked
  ↓
completed
```

## 10.3 Match Room 状态

```text
locked
  ↓
opened_after_match
  ↓
plan_confirming
  ↓
confirmed
  ↓
closed_after_activity
```

---

# 11. 更新后的 Demo 主线

## Step 1：进入成局地图

用户看到 Westwood 生活圈：

```text
30 个地点
82 条搭子需求
218 名活跃用户
12 个即将成局
```

## Step 2：点击韩餐店 Pin

Bottom Sheet 显示：

```text
Seoul Bowl 韩式简餐
当前 3 条饭搭子需求
有双人套餐优惠
```

## Step 3：点击“让 AI 帮我匹配”

进入 AI 成局助手。

## Step 4：输入自然语言

```text
今晚想找一个人吃韩餐，预算 20 刀以内，不想太尴尬，最好轻松聊聊。
```

## Step 5：AI 解析并生成多个方案

展示方案 A / B / C，并解释推荐理由。

## Step 6：选择方案 A

进入成局确认室。

## Step 7：AI 推荐开场白

系统生成低压力开场话术。

## Step 8：双方确认

方案状态变为 confirmed。

## Step 9：进入美团闭环

展示：

- 团购
- 路线
- 加入日历
- 到店打卡

---

# 12. 高分答辩表述更新

## 12.1 避免社交软件质疑

```text
我们不是做“附近的人”，而是做“附近的本地生活成局机会”。
用户看到的不是个人，而是地点上的活动需求。
聊天也不是泛社交，而是服务于本次活动确认的成局确认室。
```

## 12.2 强调美团关系

```text
美团原本帮助用户发现去哪吃、去哪玩。
Meituan Together 进一步帮助用户找到和谁一起去，并通过 AI 把地点、时间、预算、需求和优惠组织成可执行方案。
```

## 12.3 强调 AI 价值

```text
AI 不是简单聊天，而是承担成局助手角色。
它解析用户需求，筛选地点上的搭子需求，生成多套可执行方案，并在条件变化时重新规划。
```

## 12.4 强调商业闭环

```text
成局之后自然进入美团的团购、预约、路线和到店消费体系。
因此它不是脱离平台的社交产品，而是提升本地生活转化率的 coordination layer。
```

---

# 13. 给 CatPaw 的更新版 Prompt

```text
请基于现有 Meituan Together 项目设计，增强交互功能并避免产品看起来像普通社交软件。

项目定位：
Meituan Together 是美团 App 内置的场景型搭子成局工具。它不展示附近的人，而是展示附近地点上的本地生活成局机会。用户不是来建立长期社交关系，而是围绕一次具体的吃饭、KTV、酒吧、探店或夜宵活动完成临时成局。

请实现三个核心 section：

1. 成局地图：
以 POI 为中心展示地图 pin。每个 pin 显示店名、人均、评分、距离、当前搭子需求数和即将成局数量。点击 pin 后弹出 bottom sheet，展示该地点的搭子需求卡片。支持场景筛选、时间筛选、加入这个局、我也想去、让 AI 帮我匹配。

2. AI 成局助手：
用户可以从地图进入，也可以输入自然语言需求。AI 将需求解析为结构化标签，例如活动类型、时间、预算、地点、社交节奏、人数。系统基于 mock 数据生成 2–3 个可成局方案，并展示方案对比、推荐理由、换地点、换时间、换一个局、动态重规划等交互。

3. 成局确认室：
只有匹配成功后才开放。页面顶部固定显示本次方案卡片，包括地点、时间、人数、预算、优惠。对方信息只展示匿名身份、本次 intent 标签、美团验证状态和成局记录，不展示完整个人主页。聊天区提供 AI 开场白、快捷回复、修改方案、双方确认、成局成功和团购入口。

整体视觉风格：
移动端优先，模拟美团 App 内置功能，黄色和白色主色调，卡片式布局，地图 pin，bottom sheet，匹配度条，AI 方案卡片，成局确认状态条。

请使用 mock 数据完成可交互 demo，不需要真实地图 API 或真实用户数据。
```

---

# 14. 最终更新总结

本次更新后的项目从原来的：

```text
饭搭子匹配工具
```

升级为：

```text
美团内置的本地生活成局系统
```

核心变化：

| 旧设计 | 新设计 |
|---|---|
| 附近的人 | 附近地点上的成局机会 |
| 用户 Profile | 本次 Intent Card |
| 聊天室 | 成局确认室 |
| 兴趣匹配 | 本地生活方案匹配 |
| 社交关系 | 场景型临时协同 |
| 独立社交产品 | 美团 App 内置功能 |
| 推荐候选 | 生成可执行成局方案 |

最终产品主线：

```text
成局地图 → AI 成局助手 → 成局确认室 → 美团到店转化
```

最终核心概念：

```text
Local Life Coordination
```
