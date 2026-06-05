const {
  pois, users, currentUser, backgroundUsers, buddyDemands, matchPlans, chatThreads, deals, replanningEvents,
  scenes, sceneGroups: _sceneGroups, sceneCatalog: _sceneCatalog, sceneIntentSamples, MAP_LAYOUT: _MAP_LAYOUT, area, areaShort,
  lifeCircles: _lifeCircles, brand: _brand, circleWeather: _circleWeather, cityOptions: _cityOptions
} = window.mockData;
const lifeCircles = _lifeCircles || [];
const cityOptions = _cityOptions || [
  { id: "default", name: areaShort || "当前城市", shortName: areaShort || "当前城市", areaName: area, center_lat: window.mockData.mapCenter?.lat, center_lng: window.mockData.mapCenter?.lng }
];
const brand = _brand || { name: "走起不", tagline: "想出门，就走起不", slogans: [] };
const circleWeather = _circleWeather || { temp: 22, label: "微风", tip: "" };
const sceneGroups = _sceneGroups || [];
const sceneCatalog = _sceneCatalog || {};
const MAP_LAYOUT = _MAP_LAYOUT || {
  type: "schematic_percent",
  description: "示意地图：x/y 为百分比位置，非真实经纬度。",
  user_pin: { x: 48, y: 54, label: "你在这里（示意）" }
};
const { parseIntent, runMatching, computeReputationScore } = window.MatchingUtils || {};
if (!window.MatchingUtils) {
  console.error("MatchingUtils 未加载，请确认 utils/matching.js 已引入");
}

const PLAN_STATUS = Object.freeze({
  IDLE: "idle",
  MATCHED: "matched",
  NEGOTIATING: "negotiating",
  PENDING_LOCK: "pending_lock",
  LOCKED_WAITING_PEER: "locked_waiting_peer",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  FALLBACK_READY: "fallback_ready"
});

const PLAN_STATUS_META = Object.freeze({
  [PLAN_STATUS.IDLE]: { label: "待发起", progress: 5 },
  [PLAN_STATUS.MATCHED]: { label: "已匹配待沟通", progress: 20 },
  [PLAN_STATUS.NEGOTIATING]: { label: "沟通中", progress: 45 },
  [PLAN_STATUS.PENDING_LOCK]: { label: "待锁定诚意金", progress: 58 },
  [PLAN_STATUS.LOCKED_WAITING_PEER]: { label: "已锁定，待对方确认", progress: 75 },
  [PLAN_STATUS.CONFIRMED]: { label: "双方确认成局", progress: 100 },
  [PLAN_STATUS.REJECTED]: { label: "对方拒绝", progress: 28 },
  [PLAN_STATUS.FALLBACK_READY]: { label: "候补方案已就绪", progress: 55 }
});

const DEMO_AGENT_MEMORY = {
  preferred_scenes: ["韩餐", "咖啡", "轻运动"],
  default_budget_range: [60, 90],
  distance_preference_km: 1.5,
  social_preference: "低打扰 1v1",
  avoid_conditions: ["等待超过 15 分钟", "太嘈杂的多人拼桌局"],
  deal_preference: "帮你省钱、单人套餐优先",
  learned_from: {
    recent_views: ["韩餐", "咖啡", "汤锅"],
    accepted_plans: ["Seoul Bowl 韩式简餐", "Powell Coffee"],
    rejected_reasons: ["太远", "太嘈杂", "预算太高"]
  }
};

const appState = {
  currentPage: "map",
  selectedCategory: "全部",
  selectedSceneGroup: null,
  sceneNavExpanded: false,
  selectedPOI: pois.find((p) => p.poi_id === "poi_039") || pois[0],
  selectedDemandId: null,
  poiConstraint: null,
  userInput: "今晚想找一个人吃韩餐，预算 80 元以内，不想太尴尬，最好轻松聊聊，离我不要太远。",
  parsedIntent: null,
  matchResults: [],
  selectedMatch: null,
  generatedPlan: null,
  chatThread: null,
  planStatus: PLAN_STATUS.IDLE,
  currentUserConfirmed: false,
  matchedUserConfirmed: false,
  planConfirmed: false,
  depositSheetVisible: false,
  depositAgreementChecked: false,
  depositLocked: false,
  selectedDeal: null,
  fallbackSuggestion: "",
  sparseMode: false,
  debugMeta: null,
  replanningNotice: "",
  aiDirector: null,
  aiMoodProfile: null,
  aiAgentError: "",
  aiLoading: false,
  aiStep: -1,
  matchAnimPhase: null,
  matchAnimCandidates: 0,
  matchPreviewUsers: [],
  matchResultFilter: "all",
  matchProfileIndex: null,
  aiHasRun: false,
  pendingSuccess: false,
  toast: "",
  groupChats: [],
  viewingGroupChatId: null,
  excludedUserIds: [],
  pendingFallbackMatch: null,
  lastRematchNote: "",
  aiProvider: "",
  aiRuleFallback: false,
  aiFilteredByGemini: false,
  aiFilterReason: "",
  chatReplyLoading: false,
  lastRejectRematch: null,
  selectedCircleId: lifeCircles[0]?.id || "near",
  circlePageOpen: false,
  browseRadiusKm: 2,
  circleTimeSlot: "now",
  selectedCityId: cityOptions[0]?.id || "default",
  mapLayer: "normal",
  mapExpandedClusterId: null,
  mapManualPOI: false,
  poiSheetTab: "demands",
  agentMemory: null,
  agentMemoryNotice: "",
  agentFeedbackLog: [],
  preferenceDrawerOpen: false,
  developerMode: new URLSearchParams(window.location.search).get("dev") === "1",
  developerControlsVisible: new URLSearchParams(window.location.search).get("dev") === "1"
};

window.appState = appState;

function canShowDeveloperControls() {
  return !!(appState.developerControlsVisible || appState.developerMode);
}

let gaodePOIs = [];
let mockMapReady = false;
let amapInstance = null;
let amapRangeCircle = null;
let amapHeatLayer = null;
let leafletMap = null;
let leafletMarkers = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const CITY_CIRCLE_OFFSETS = Object.freeze({
  near: { lng: 0, lat: 0 },
  eat: { lng: 0.0065, lat: 0.0018 },
  play: { lng: -0.0075, lat: 0.0052 },
  sport: { lng: 0.0085, lat: -0.006 }
});

function apiURLCandidates(path) {
  const currentOrigin = window.location.origin || "";
  const isFileOrNull = !currentOrigin || currentOrigin === "null" || currentOrigin.startsWith("file:");
  // When served via HTTP (dev server), prefer current origin; fallback to 8002 for file:// protocol
  const fallbackAPI = "http://127.0.0.1:8002";
  const candidates = isFileOrNull ? [`${fallbackAPI}${path}`] : [`${currentOrigin}${path}`, `${fallbackAPI}${path}`];
  return [...new Set(candidates)];
}

async function postJSONWithFallback(path, payload, options = {}) {
  const timeoutMs = options.timeoutMs || 12000;
  const timeoutMessage = options.timeoutMessage || "AI 请求超时，已切换规则层";
  let lastError = null;

  for (const url of apiURLCandidates(path)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      const shouldTryFallback =
        url === path &&
        apiURLCandidates(path).length > 1 &&
        (response.status === 404 || response.status === 405 || response.status === 0);
      if (shouldTryFallback) {
        lastError = new Error(`API route unavailable at ${path}`);
        continue;
      }
      return { response, data };
    } catch (error) {
      lastError = error.name === "AbortError" ? new Error(timeoutMessage) : error;
      if (url !== apiURLCandidates(path).at(-1)) continue;
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("API 请求失败");
}

function setPlanStatus(nextStatus) {
  appState.planStatus = nextStatus;
  appState.planConfirmed = nextStatus === PLAN_STATUS.CONFIRMED;
  appState.currentUserConfirmed = nextStatus === PLAN_STATUS.LOCKED_WAITING_PEER || nextStatus === PLAN_STATUS.CONFIRMED;
  appState.matchedUserConfirmed = nextStatus === PLAN_STATUS.CONFIRMED;
  if (appState.chatThread) appState.chatThread.plan_status = nextStatus;
}

function currentPlanStatusMeta() {
  return PLAN_STATUS_META[appState.planStatus] || PLAN_STATUS_META[PLAN_STATUS.IDLE];
}

function buildConcurrencyMeta(seed) {
  const stamp = Date.now();
  return {
    match_version: `v${stamp}-${seed + 1}`,
    reservation_ttl: 180,
    idempotency_key: `idem_${stamp}_${seed + 1}`
  };
}

function logConcurrencyMeta(meta) {
  if (!meta) return;
  console.info("[debug-concurrency]", {
    match_version: meta.match_version,
    reservation_ttl: meta.reservation_ttl,
    idempotency_key: meta.idempotency_key
  });
}

function getCurrentCircle() {
  const raw = lifeCircles.find((c) => c.id === appState.selectedCircleId) || lifeCircles[0] || {
    id: "near",
    shortName: areaShort,
    name: area,
    tagline: "",
    radius_km: 2,
    filter: () => true,
    hotScenes: [],
    matchTags: []
  };
  const city = getCurrentCity();
  const offset = CITY_CIRCLE_OFFSETS[raw.id] || CITY_CIRCLE_OFFSETS.near;
  const baseLat = Number(city.center_lat ?? raw.center_lat ?? window.mockData.mapCenter?.lat);
  const baseLng = Number(city.center_lng ?? raw.center_lng ?? window.mockData.mapCenter?.lng);
  return {
    ...raw,
    name: raw.id === "near" ? "生活圈" : raw.name,
    center_lat: Number((baseLat + offset.lat).toFixed(6)),
    center_lng: Number((baseLng + offset.lng).toFixed(6))
  };
}

function getCurrentCity() {
  return cityOptions.find((c) => c.id === appState.selectedCityId) || cityOptions[0] || {
    id: "default",
    name: areaShort || "当前城市",
    shortName: areaShort || "当前城市",
    areaName: area,
    center_lat: window.mockData.mapCenter?.lat,
    center_lng: window.mockData.mapCenter?.lng
  };
}

function currentCityUserPin() {
  return getCurrentCity().user_pin || MAP_LAYOUT.user_pin || { x: 48, y: 54, label: "你在这里" };
}

function poisInCircle(circle) {
  const c = circle || getCurrentCircle();
  const fn = c.filter || (() => true);
  const radiusKm = appState.browseRadiusKm ?? c.radius_km ?? 5;
  return pois.filter((p) => fn(p) && (p.distance_km ?? 99) <= radiusKm + 0.01);
}

function circleStats(circle) {
  const list = poisInCircle(circle);
  const buddies = list.reduce((s, p) => s + (p.buddy_demand_count || 0), 0);
  return {
    shops: list.length,
    buddies,
    active: users.length + backgroundUsers.length
  };
}

const BROWSE_RADIUS_PRESETS = [
  { value: 2, label: "附近" },
  { value: 5, label: "城市" },
  { value: 99, label: "全部" }
];

function activeGroupCount(circle) {
  const poiIds = new Set(poisInCircle(circle).map((p) => p.poi_id));
  const activePoiIds = new Set(
    buddyDemands.filter((d) => poiIds.has(d.poi_id)).map((d) => d.poi_id)
  );
  const hotPois = poisInCircle(circle).filter((p) => (p.buddy_demand_count || 0) >= 3).length;
  const count = activePoiIds.size || hotPois;
  return Math.min(12, Math.max(1, count));
}

function areaPillSubtitle(circle) {
  const n = activeGroupCount(circle);
  if (n <= 2) return "附近挺热闹";
  if (n >= 10) return "附近很热闹";
  return `今晚附近有 ${n} 个活跃组局`;
}

function browseRadiusPresetLabel(km) {
  const match = BROWSE_RADIUS_PRESETS.find((p) => Math.abs(km - p.value) < 0.01);
  return match ? match.label : "附近";
}


function poiCoverImage(poi) {
  return poi.cover_image || `https://picsum.photos/seed/${encodeURIComponent(poi.poi_id)}/800/480`;
}

function reputationBadge(user) {
  const score = user.reputation_score != null ? user.reputation_score : computeReputationScore(user);
  const tier = score >= 85 ? "靠谱搭子" : score >= 70 ? "良好" : "一般";
  return { score, tier };
}
