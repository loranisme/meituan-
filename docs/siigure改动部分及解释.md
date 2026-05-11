## siigure 改动部分及解释

### 改动边界
- 改动文件：`app.js`、`mockData.js`、`utils/matching.js`、`style.css`、`index.html`
- 未改动高德 API Key 与高德调用方式
- 未引入第三方状态机库、未新增后端模拟层、未实现真实支付流
- 未拆大架构、未引入复杂状态管理框架、未实现真实分布式锁与事务
- UI 改造未触碰任何业务逻辑，`app.js` 模板字符串中的类名 100% 兼容保留

---

### 改动清单

#### 1. 状态机（集中枚举 + 单一状态源）
- `app.js` 顶部新增 `PLAN_STATUS` 与 `PLAN_STATUS_META` 常量，集中管理局态枚举
- 新增 `setPlanStatus()`，把 `appState.planStatus` 作为单一状态源，原确认布尔字段改为派生同步，便于旧 UI 兼容
- 聊天页新增极简"当前局态"指示器：状态标签 + 细进度条

#### 2. 支付意愿锁定（克制 Bottom Sheet）
- 新增 `renderDepositSheet()` 实现底部弹窗
- 弹窗包含：
  - 勾选"同意冻结诚意金"
  - 规则摘要文案：`T-30 退出扣 50% 作为演示（非真实支付流程）`
- 用户点"我确认"时先走锁定弹窗，勾选后才进入"已锁定，待对方确认"
- 成功页新增一行诚意金状态：`已锁定 / 已解锁（发生改约或拒绝后释放）`

#### 3. 候补方案（拒绝事件触发）
- 聊天页动作区新增"模拟对方拒绝"
- 触发后自动执行：
  - 从现有候选列表重排（优先候补 C，其次 B）
  - 给出文案解释（明确"基于现有候选列表重排，未引入额外算法"）
  - 无候补时给降级建议（放宽时间 / 预算再匹配）

#### 4. 稀疏模式（开关 + 低供给 mock + 空态兜底）
- `mockData.js` 新增 `sparseSupply`（低供给 users / pois 子集）
- AI 页面新增"稀疏模式"开关
- `runAI()` 在稀疏模式下切换到低供给数据源
- 稀疏模式无结果时显示"空态兜底卡片"与放宽条件建议

#### 5. 意图分层可视化（不接 LLM）
- `utils/matching.js` 的 `parseIntent()` 新增规则信号计数，输出：
  - `parse_confidence`
  - `parse_layer`（`rule_parsed` / `low_confidence`）
- AI 解析卡新增两层可视化文案：
  - `规则解析成功`
  - `低置信度待澄清`

#### 6. 并发字段仅展示与日志
- `app.js` 新增并发叙事字段生成：
  - `match_version`
  - `reservation_ttl`
  - `idempotency_key`
- 字段仅用于：
  - 控制台日志输出（`console.info`）
  - 聊天页调试面板展示
- 未实现真实分布式锁 / 事务，仅保留可解释字段 + 演示事件

#### 7. UI 视觉体系收敛（黄色降权 + 层级重建）
- **黄色只保留唯一 CTA 用途**：`--yellow` 改为 `#F7C600`，仅用于主按钮（`primary-button` / `cta-match-btn`），其余位置一律去黄
- **非 CTA 黄色全部替换**：
  - 地图 hot pin → 红色语义（`#fee2e2` / `#ef4444`）
  - 地图选中 pin → 灰色（`#e2e8f0`）
  - 消息气泡（我）→ 灰色（`#e2e8f0`）
  - 成功页对勾图标 → 绿色语义（`#dcfce7` / `#166534`）
  - 分析进度点 → 蓝色（`#3b82f6`）
  - 群组列表图标、`want-go-button`、`wait-chip`、`deal-bar` 等 → 灰/中性色
- **卡片分层（一级 / 二级降级）**：
  - 一级卡 `.card`：白底、`rounded-3xl`、`shadow-card`、padding 20
  - 卡中卡 `.card .card` 自动降级：灰底 `#f8f9fb`、`rounded-2xl`、无阴影、padding 12/14
- **按钮规格统一**：
  - 主按钮：`min-height: 48px`、`font-weight: 600`、`font-size: 16`、品牌色边框 `#e8b600`
  - 次按钮：白底 + 灰边 `#d0d5dd` + 深灰字、同样 48px 高
- **标签去黄归一**：`meta-row` / `tag-row` / `intent-tag` / `mchip` 全部统一为 `#f3f4f6` 灰底 + `#344054` 深灰字
- **字体层级硬约束**（在 `@layer base` 中全局生效）：
  - `h1 = 32px / 700`
  - `h2 = 22px / 600`
  - `h3 = 16px / 600`
  - `body = 14px`，与正文/标签拉开层级

#### 8. CSS 迁移到 Tailwind（Play CDN 模式）
- `index.html` 引入 Tailwind Play CDN：`https://cdn.tailwindcss.com`
- `index.html` 内 `tailwind.config` 注入品牌色与设计令牌：
  - 颜色：`brand`、`brand-edge`、`ink`、`muted`、`line`、`surface`
  - 阴影：`shadow-card`、`shadow-sheet`
  - 字体栈：苹方 / 微软雅黑 / 系统字体
- `index.html` 内新增 `<style type="text/tailwindcss">` 块，用 `@apply` + `@layer components` 重写所有自定义组件类（约 60 个：`card` / `primary-button` / `secondary-button` / `filter-chip` / `tag` / `message` / `modal-*` / `gc-*` 等）
- `style.css` 从 **1025 行 → 179 行**（砍掉 ~82%），仅保留 Tailwind 表达不了的部分：
  - 地图渲染（`fake-map` 多层渐变、`map-pin` 全套、`[data-category="…"]` 属性选择器）
  - 关键帧动画（`pulse-ring` / `pulse-blue` / `spin` / `fadeUp`）
  - 伪元素（`primary-button.is-loading::after` 旋转 spinner、`why-details summary::before` 三角形）
  - 媒体查询（`@media (min-width: 760px)` 桌面预览态）
- `app.js` 一行未动，所有原有类名仍生效，可逐步迁移到 utility 写法

#### 9. 注意事项 / 后续可做
- 当前 Tailwind 是 Play CDN 模式，**仅适合 demo / 原型**：体积大、首屏会一瞬间未样式化（FOUC）
- 若要上线，需切换到本地 Tailwind CLI 构建：加 `package.json` + `tailwind.config.js`，跑 `npx tailwindcss -i input.css -o style.css --watch` 即可生成生产级 CSS
- 想新增语义色（如 `success` / `danger`），直接改 `index.html` 顶部 `tailwind.config.theme.extend.colors`，全局立刻可用
