# Meituan Together｜一起去

本地生活场景型搭子成局 Demo（地图 POI-first + 规则匹配 + AI 成局导演）。

## 启动

```bash
cp .env.example .env
# 可选：填入 DEEPSEEK_API_KEY 或 GEMINI_API_KEY

python3 server.py
```

浏览器打开：**http://127.0.0.1:8000**

> 必须用 `server.py` 静态服务，不要直接打开 `index.html`（否则 `/api/ai-match` 不可用）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `LLM_PROVIDER` | `deepseek` 或 `gemini`（可省略，按已配置的 Key 自动选择） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `GEMINI_API_KEY` | Google Gemini API Key |
| `PORT` | 默认 `8000` |

无 Key 时：自动 **规则层匹配**（L0），可完整演示拒人换人、改预算/时间等流程。

## 自动演示 URL

| URL | 效果 |
|-----|------|
| `/?script=reject` | AI 匹配 → 模拟拒人 → 候补重算 |
| `/?script=budget` | AI 匹配 → 改预算 → 对方同意 → 重分配 |

详见 `docs/demo-script.md`。

## 文档

- `docs/implementation-checklist.md` — 功能清单（诚实版）
- `docs/team-todo-backlog.md` — 双人协作待办
- `docs/demo-open-issues-and-architecture-gaps.md` — 架构缺口

## API

| 路径 | 说明 |
|------|------|
| `POST /api/ai-match` | AI 成局导演（DeepSeek / Gemini） |
| `GET /api/meituan-poi` | 美团 POI 接入占位（501，未实现） |
