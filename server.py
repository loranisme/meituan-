#!/usr/bin/env python3
import json
import mimetypes
import os
import ssl
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request


ROOT = Path(__file__).resolve().parent
GEMINI_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"


AI_MATCH_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "intent_patch",
        "agent_profile",
        "director_brief",
        "clarifying_questions",
        "plan_overrides",
        "merchant_layer",
        "demo_hooks",
    ],
    "properties": {
        "intent_patch": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "activity_type",
                "category_preference",
                "budget_min",
                "budget_max",
                "social_style",
                "group_size",
                "target_time",
                "distance_tolerance_km",
                "confidence",
            ],
            "properties": {
                "activity_type": {"type": "string"},
                "category_preference": {"type": "string"},
                "budget_min": {"type": "number"},
                "budget_max": {"type": "number"},
                "social_style": {"type": "string"},
                "group_size": {"type": "string"},
                "target_time": {"type": "string"},
                "distance_tolerance_km": {"type": "number"},
                "confidence": {"type": "number"},
            },
        },
        "agent_profile": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "mood_label",
                "user_state",
                "activity_strategy",
                "confidence",
                "score_basis",
            ],
            "properties": {
                "mood_label": {"type": "string"},
                "user_state": {"type": "string"},
                "activity_strategy": {"type": "string"},
                "confidence": {"type": "number"},
                "score_basis": {"type": "string"},
            },
        },
        "director_brief": {"type": "string"},
        "clarifying_questions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "plan_overrides": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "plan_index",
                    "match_id",
                    "headline",
                    "explanation",
                    "closing_line",
                    "risk",
                    "conversion_prompt",
                    "score_reason",
                ],
                "properties": {
                    "plan_index": {"type": "integer"},
                    "match_id": {"type": "string"},
                    "headline": {"type": "string"},
                    "explanation": {"type": "string"},
                    "closing_line": {"type": "string"},
                    "risk": {"type": "string"},
                    "conversion_prompt": {"type": "string"},
                    "score_reason": {"type": "string"},
                },
            },
        },
        "merchant_layer": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "summary",
                "real_fields",
                "simulated_fields",
                "generated_fields",
                "freshness_label",
            ],
            "properties": {
                "summary": {"type": "string"},
                "real_fields": {"type": "array", "items": {"type": "string"}},
                "simulated_fields": {"type": "array", "items": {"type": "string"}},
                "generated_fields": {"type": "array", "items": {"type": "string"}},
                "freshness_label": {"type": "string"},
            },
        },
        "demo_hooks": {"type": "array", "items": {"type": "string"}},
    },
}


CHAT_REPLY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["reply", "intent", "confidence"],
    "properties": {
        "reply": {"type": "string"},
        "intent": {"type": "string"},
        "confidence": {"type": "number"},
    },
}


def to_openapi_schema(schema):
    if isinstance(schema, list):
        return [to_openapi_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    converted = {}
    for key, value in schema.items():
        if key in {"additionalProperties"}:
            continue
        converted[key] = to_openapi_schema(value)

    if converted.get("type") == "object" and "properties" in converted:
        converted["propertyOrdering"] = list(converted["properties"].keys())
    return converted


DEVELOPER_PROMPT = """
你是美团本地生活比赛 demo 的 AI 成局导演。
目标：把用户一句自然语言需求，变成可履约、可解释、可商业转化的到店方案。

支持的活动类型（activity_type）包括但不限于：
饭搭子、KTV搭子、酒吧搭子、咖啡搭子、夜宵搭子、
攀岩搭子、骑行搭子、桌游搭子、聚会桌游搭子、RPG桌游搭子、跑团搭子。
请根据用户表述选择最贴近的类型；category_preference 应对应 POI 的 sub_category（如抱石、休闲骑行、跑团、RPG、聚会桌游），
不要默认推荐韩餐，除非用户明确想吃或 merchant_candidates 仅有餐饮。

约束：
1. 不编造商家。只能使用输入里的 merchant_candidates 和 local_plans。
2. 保留本地规则评分作为真相源；你只增强意图理解、解释、风险预判和演示话术。
3. 明确区分真实字段、模拟字段、生成字段，让答辩时能解释数据层。
4. 输出中文短句，适合直接展示在手机 UI 上。
5. 强调"成局"而不是泛社交聊天：时间、地点、参与者、团购/到店转化、异常兜底。
6. 非餐饮场景（攀岩/骑行/桌游）优先引用 venue_extra 类信息：难度、路线、包厢时长等。
7. 需要理解 NLP 和情绪信号。比如"今天心情不好"应识别为低能量/低压力陪伴，
   优先给近距离、低等待、1v1 或小组安静活动，并解释 AI 评分依据。
8. agent_profile 要写清用户状态、活动策略和评分依据，不要像筛选器一样只复述字段。
"""


CHAT_PROMPT = """
你在美团本地生活搭子 demo 里扮演"对方用户"，模拟真实聊天回复。

[通用规则]
1. 用中文短句，20 字以内优先，语气像真实年轻用户。
2. 不要输出 emoji，不要夸张，不要恋爱化，不要暴露自己是 AI。
3. 不要引导私聊，不要说"好的，明白"等客服式语气。

[根据 mode 字段区分场景]
- mode = "matched_user_demo"（成局前协商阶段）：
  聚焦时间、地点、预算、等待是否确认；对方确认时自然顺势确认。
- mode = "group_chat_post_success"（成局后群聊阶段）：
  已确认见面，聊天内容围绕：出发时间、是否在路上、到店情况、实际体验。
  模拟真实搭子到店前后的协调对话，语气自然随意。
"""


def load_env_file():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, value = clean.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def https_context():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def extract_gemini_text(response_payload):
    texts = []
    for candidate in response_payload.get("candidates", []):
        content = candidate.get("content") or {}
        for part in content.get("parts", []):
            text = part.get("text")
            if isinstance(text, str):
                texts.append(text)
    if texts:
        return "".join(texts).strip()
    return ""


def parse_llm_json(text):
    if not text:
        raise RuntimeError("LLM response did not include output text")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        snippet = text[:500].replace("\n", " ")
        raise RuntimeError(f"LLM returned invalid JSON at {exc.lineno}:{exc.colno}: {snippet}") from exc


def active_llm_provider():
    explicit = os.environ.get("LLM_PROVIDER", "").strip().lower()
    if explicit in {"gemini", "deepseek"}:
        return explicit
    if os.environ.get("DEEPSEEK_API_KEY", "").strip():
        return "deepseek"
    if os.environ.get("GEMINI_API_KEY", "").strip():
        return "gemini"
    return ""


def call_deepseek(client_payload):
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")

    model = os.environ.get("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL).strip() or DEFAULT_DEEPSEEK_MODEL
    body = {
        "model": model,
        "temperature": 0.25,
        "max_tokens": 6000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": DEVELOPER_PROMPT.strip()},
            {
                "role": "user",
                "content": (
                    "请基于以下 JSON 输入生成 AI 成局导演结果，"
                    "只返回一个 JSON 对象，字段需包含 intent_patch, director_brief, "
                    "agent_profile, clarifying_questions, plan_overrides, merchant_layer, demo_hooks。\n"
                    f"{json.dumps(client_payload, ensure_ascii=False)}"
                ),
            },
        ],
    }
    req = request.Request(
        DEEPSEEK_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=25, context=https_context()) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek API error {exc.code}: {detail[:500]}") from exc

    payload = json.loads(raw)
    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("DeepSeek response had no choices")
    text = (choices[0].get("message") or {}).get("content") or ""
    return parse_llm_json(text.strip())


def call_gemini(client_payload):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    model = os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL
    body = {
        "systemInstruction": {
            "parts": [{"text": DEVELOPER_PROMPT.strip()}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "请基于以下 JSON 输入生成 AI 成局导演结果，"
                            "只能返回符合 generationConfig.responseSchema 的 JSON。\n"
                            f"{json.dumps(client_payload, ensure_ascii=False)}"
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.25,
            "maxOutputTokens": 6000,
            "responseMimeType": "application/json",
            "responseSchema": to_openapi_schema(AI_MATCH_SCHEMA),
        },
    }
    req = request.Request(
        GEMINI_URL_TEMPLATE.format(model=model),
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=25, context=https_context()) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini API error {exc.code}: {detail[:500]}") from exc

    payload = json.loads(raw)
    text = extract_gemini_text(payload)
    if not text:
        block_reason = payload.get("promptFeedback", {}).get("blockReason")
        suffix = f": {block_reason}" if block_reason else ""
        raise RuntimeError(f"Gemini response did not include output text{suffix}")
    return parse_llm_json(text)


def call_llm(client_payload):
    provider = active_llm_provider()
    if provider == "deepseek":
        return call_deepseek(client_payload)
    if provider == "gemini":
        return call_gemini(client_payload)
    raise RuntimeError("Set DEEPSEEK_API_KEY or GEMINI_API_KEY in .env to enable /api/ai-match")


def call_deepseek_chat(client_payload):
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")

    model = os.environ.get("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL).strip() or DEFAULT_DEEPSEEK_MODEL
    body = {
        "model": model,
        "temperature": 0.45,
        "max_tokens": 800,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": CHAT_PROMPT.strip()},
            {
                "role": "user",
                "content": (
                    "请基于以下 JSON 输入模拟对方用户回复，"
                    "只返回 JSON：reply, intent, confidence。\n"
                    f"{json.dumps(client_payload, ensure_ascii=False)}"
                ),
            },
        ],
    }
    req = request.Request(
        DEEPSEEK_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=18, context=https_context()) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek chat API error {exc.code}: {detail[:500]}") from exc

    payload = json.loads(raw)
    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("DeepSeek chat response had no choices")
    text = (choices[0].get("message") or {}).get("content") or ""
    return parse_llm_json(text.strip())


def call_gemini_chat(client_payload):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    model = os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL
    body = {
        "systemInstruction": {
            "parts": [{"text": CHAT_PROMPT.strip()}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "请基于以下 JSON 输入模拟对方用户回复，"
                            "只能返回符合 generationConfig.responseSchema 的 JSON。\n"
                            f"{json.dumps(client_payload, ensure_ascii=False)}"
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.45,
            "maxOutputTokens": 800,
            "responseMimeType": "application/json",
            "responseSchema": to_openapi_schema(CHAT_REPLY_SCHEMA),
        },
    }
    req = request.Request(
        GEMINI_URL_TEMPLATE.format(model=model),
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=18, context=https_context()) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini chat API error {exc.code}: {detail[:500]}") from exc

    payload = json.loads(raw)
    text = extract_gemini_text(payload)
    if not text:
        block_reason = payload.get("promptFeedback", {}).get("blockReason")
        suffix = f": {block_reason}" if block_reason else ""
        raise RuntimeError(f"Gemini chat response did not include output text{suffix}")
    return parse_llm_json(text)


def call_chat_llm(client_payload):
    provider = active_llm_provider()
    if provider == "deepseek":
        return call_deepseek_chat(client_payload)
    if provider == "gemini":
        return call_gemini_chat(client_payload)
    raise RuntimeError("Set DEEPSEEK_API_KEY or GEMINI_API_KEY in .env to enable /api/chat-reply")


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        target = (ROOT / clean).resolve()
        if target != ROOT and ROOT not in target.parents:
            target = ROOT / "index.html"
        return str(target)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/runtime-config.js":
            amap_key = os.environ.get("AMAP_KEY", "").strip()
            body = (
                f"window.AMAP_KEY = {json.dumps(amap_key)};\n"
                f"window.__RUNTIME_CONFIG = {{ amapKeyConfigured: {json.dumps(bool(amap_key))} }};\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # 美团 POI 真接入占位（Demo 仍用 mockData.js）
        if self.path.split("?", 1)[0] == "/api/meituan-poi":
            json_response(
                self,
                501,
                {
                    "error": "not implemented",
                    "message": "Reserved for Meituan POI OpenAPI. Demo uses mockData.js.",
                    "contract": {"poi_id": "string", "fields": ["name", "cover_image", "business_hours", "deals"]},
                },
            )
            return
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        route = self.path.split("?", 1)[0]
        if route not in {"/api/ai-match", "/api/chat-reply"}:
            json_response(self, 404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            client_payload = json.loads(self.rfile.read(length).decode("utf-8"))
            result = call_llm(client_payload) if route == "/api/ai-match" else call_chat_llm(client_payload)
            json_response(self, 200, {**result, "provider": active_llm_provider()})
        except Exception as exc:
            json_response(self, 503, {"error": str(exc), "fallback": True})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()


def main():
    load_env_file()
    mimetypes.add_type("application/javascript", ".js")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving http://127.0.0.1:{port}")
    provider = active_llm_provider()
    if provider:
        print(f"AI provider: {provider} (/api/ai-match enabled)")
    else:
        print("Set DEEPSEEK_API_KEY or GEMINI_API_KEY in .env to enable /api/ai-match.")
    if os.environ.get("AMAP_KEY", "").strip():
        print("AMap: AMAP_KEY configured (/runtime-config.js)")
    else:
        print("AMap: set AMAP_KEY in .env for real map (otherwise fake-map demo)")
    server.serve_forever()


if __name__ == "__main__":
    main()
