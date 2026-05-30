const {
  pois, users, currentUser, backgroundUsers, buddyDemands, matchPlans, chatThreads, deals, replanningEvents,
  scenes, sceneGroups: _sceneGroups, sceneCatalog: _sceneCatalog, sceneIntentSamples, MAP_LAYOUT: _MAP_LAYOUT, area, areaShort,
  lifeCircles: _lifeCircles, brand: _brand, circleWeather: _circleWeather
} = window.mockData;
const lifeCircles = _lifeCircles || [];
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
  selectedPOI: pois[0],
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
  chatReplyLoading: false,
  lastRejectRematch: null,
  selectedCircleId: lifeCircles[0]?.id || "near",
  circlePageOpen: false,
  browseRadiusKm: 2,
  circleTimeSlot: "now",
  agentMemory: null,
  agentMemoryNotice: "",
  agentFeedbackLog: []
};

window.appState = appState;

let gaodePOIs = [];
let mockMapReady = false;
let amapInstance = null; // 高德地图实例（有 Key 时使用）
let amapRangeCircle = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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
  return lifeCircles.find((c) => c.id === appState.selectedCircleId) || lifeCircles[0] || {
    id: "near",
    shortName: areaShort,
    name: area,
    tagline: "",
    radius_km: 2,
    filter: () => true,
    hotScenes: [],
    matchTags: []
  };
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

function init() {
  const allInitUsers = [...users, ...backgroundUsers];
  appState.groupChats = matchPlans.slice(0, 3).map((plan) => {
    const poi = pois.find((p) => p.poi_id === plan.selected_poi_id);
    const user = allInitUsers.find((u) => u.user_id === plan.matched_user_id);
    const activity = categoryToActivity(poi);
    const t = plan.suggested_time;
    return {
      group_id: `gc_seed_${plan.match_id}`,
      name: `${poi.name} · ${activity}`,
      members: [{ nickname: "我", isMe: true }, { nickname: user?.nickname || "搭子", verified: user?.verified_status }],
      poi,
      suggested_time: t,
      createdAt: t,
      messages: [
        { sender: "system", text: `成局：${t} 一起去 ${poi.name}`, timestamp: t },
        { sender: "matched_user", text: "好的，待会见！", timestamp: t },
        { sender: "ai", text: "已为你们确认约局，记得准时出发！", timestamp: t }
      ]
    };
  });
  appState.agentMemory = JSON.parse(JSON.stringify(DEMO_AGENT_MEMORY));
  updateAreaPill();
  bindAreaPill();
  $("#resetDemo").addEventListener("click", () => location.reload());
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => navigate(item.dataset.page)));
  render();
  setTimeout(() => runDemoScriptIfPresent(), 900);
}

function bindAreaPill() {
  const pill = $("#areaLabel");
  if (!pill || pill.dataset.bound) return;
  pill.dataset.bound = "1";
  pill.addEventListener("click", openCirclePage);
}

function openCirclePage() {
  appState.circlePageOpen = true;
  renderCirclePage();
}

function closeCirclePage() {
  appState.circlePageOpen = false;
  const page = document.getElementById("circlePage");
  if (page) page.remove();
  document.body.style.overflow = "";
}

function applyBrowseRadius(km) {
  const next = Number(km);
  if (!Number.isFinite(next) || next <= 0) return;
  appState.browseRadiusKm = next;
  refreshMapSupply();
  syncMapRangeOverlay();
  updateAreaPill();
}

function selectLifeCircle(circleId) {
  appState.selectedCircleId = circleId;
  const circle = getCurrentCircle();
  applyBrowseRadius(circle.radius_km || 2);
  // 不关闭圈子浮层，不跳页：就地刷新浮层内容
  if (document.querySelector(".circle-page")) renderCirclePage();
  showToast(`已切换到「${circle.shortName}」`);
}

function poiCoverImage(poi) {
  return poi.cover_image || `https://picsum.photos/seed/${encodeURIComponent(poi.poi_id)}/800/480`;
}

function reputationBadge(user) {
  const score = user.reputation_score != null ? user.reputation_score : computeReputationScore(user);
  const tier = score >= 85 ? "靠谱搭子" : score >= 70 ? "良好" : "一般";
  return { score, tier };
}

function getMatchSupply() {
  const sparseSupply = window.mockData.sparseSupply || { users: users.slice(0, 2), pois: pois.slice(0, 2) };
  return {
    availablePOIs: appState.sparseMode ? sparseSupply.pois : (gaodePOIs.length ? gaodePOIs : pois),
    availableUsers: appState.sparseMode ? sparseSupply.users : users
  };
}

function applyPoiConstraintToResults(results) {
  if (!appState.poiConstraint || !results.length) return results;
  return results.map((result, index) => (
    index === 0 && isPoiCompatible(appState.parsedIntent, appState.poiConstraint)
      ? {
          ...result,
          poi: appState.poiConstraint,
          place_score: 90,
          total_score: Math.max(result.total_score, 88),
          backup_poi: findDealBackup(appState.poiConstraint),
          explanation: String(result.explanation).replace(result.poi.name, appState.poiConstraint.name)
        }
      : result
  ));
}

function rerunMatching(options = {}) {
  if (!appState.parsedIntent) return [];
  const { availablePOIs, availableUsers } = getMatchSupply();
  const exclude = [...(appState.excludedUserIds || []), ...(options.excludeUserIds || [])];
  const uniqueExclude = [...new Set(exclude)];
  let results = runMatching(appState.parsedIntent, availableUsers, availablePOIs, { excludeUserIds: uniqueExclude });
  // diversity pass: each POI appears at most once in Top3; push duplicates to tail
  const seenPois = new Set();
  const primary = [], overflow = [];
  for (const r of results) {
    (seenPois.has(r.poi.poi_id) ? overflow : (seenPois.add(r.poi.poi_id), primary)).push(r);
  }
  results = [...primary, ...overflow];
  results = applyPoiConstraintToResults(results).map((result, index) => {
    const concurrency = buildConcurrencyMeta(index);
    logConcurrencyMeta(concurrency);
    return { ...result, intent: appState.parsedIntent, concurrency };
  });
  // P2: memory-based lightweight re-ranking (+/- 3 pts on total_score)
  const mem = appState.agentMemory;
  if (mem && results.length > 1) {
    results = results.map((r) => {
      let delta = 0;
      const cat = r.poi.sub_category || r.poi.category || "";
      if (mem.preferred_scenes.some((s) => cat.includes(s) || s.includes(cat))) delta += 3;
      if (r.poi.distance_km <= mem.distance_preference_km) delta += 3;
      const avoidWait = mem.avoid_conditions.find((c) => /等待/.test(c));
      if (avoidWait && r.poi.wait_time_min < (parseInt(avoidWait) || 15)) delta += 3;
      const rejected = mem.learned_from.rejected_reasons || [];
      if (rejected.some((rr) => cat.includes(rr) || rr.includes(cat))) delta -= 3;
      if (rejected.includes("太远") && r.poi.distance_km > mem.distance_preference_km + 0.5) delta -= 3;
      if (delta === 0) return r;
      return { ...r, total_score: Math.min(100, Math.max(0, r.total_score + delta)), _memoryDelta: delta };
    }).sort((a, b) => b.total_score - a.total_score);
  }
  appState.matchResults = results;
  appState.generatedPlan = results[0] || null;
  appState.debugMeta = appState.generatedPlan ? appState.generatedPlan.concurrency : appState.debugMeta;
  return results;
}

async function runDemoScriptIfPresent() {
  const script = new URLSearchParams(window.location.search).get("script");
  if (!script) return;
  if (script === "reject") {
    showToast("演示：自动匹配 → 模拟拒人 → AI 换人重算");
    setPage("ai");
    await runAI();
    if (appState.matchResults[0]) selectMatch(appState.matchResults[0]);
    setTimeout(() => rematchAfterReject(), 1600);
    return;
  }
  if (script === "budget") {
    showToast("演示：自动匹配 → 改预算 → 对方同意 → AI 重分配");
    setPage("ai");
    await runAI();
    if (appState.matchResults[0]) selectMatch(appState.matchResults[0]);
    setTimeout(() => handleNegotiationRematch("budget"), 1600);
  }
}

function navigate(page) {
  if (appState.circlePageOpen) closeCirclePage();
  if (page === "chat") appState.viewingGroupChatId = null;
  appState.currentPage = page;
  render();
}

function setPage(page) {
  appState.currentPage = page;
  render();
}

function render() {
  $$(".page").forEach((page) => page.classList.remove("is-active"));
  const pageId = appState.currentPage === "map" ? "mapPage" : appState.currentPage === "ai" ? "aiPage" : appState.currentPage === "chat" ? "chatPage" : appState.currentPage === "success" ? "successPage" : "profilePage";
  $(`#${pageId}`).classList.add("is-active");
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.page === appState.currentPage || (appState.currentPage === "success" && item.dataset.page === "chat")));
  updateAreaPill();
  updateChatNavBadge();
  if (appState.currentPage === "map") renderMapPage();
  renderAIPage();
  renderChatPage();
  renderSuccessPage();
  renderProfilePage();
  renderDepositSheet();
  renderToast();
}

function categoryToActivity(poi) {
  if (poi.category === "KTV") return "KTV搭子";
  if (poi.category === "酒吧") return "酒吧搭子";
  if (poi.category === "咖啡") return "咖啡搭子";
  if (poi.category === "夜宵") return "夜宵搭子";
  if (poi.category === "攀岩") return "攀岩搭子";
  if (poi.category === "骑行") return "骑行搭子";
  if (poi.category === "桌游") {
    const tags = poi.tags || [];
    if (poi.sub_category === "跑团" || tags.includes("跑团")) return "跑团搭子";
    if (poi.sub_category === "RPG" || tags.includes("RPG")) return "RPG桌游搭子";
    if (poi.sub_category === "聚会桌游") return "聚会桌游搭子";
    return "桌游搭子";
  }
  return "饭搭子";
}

const CATEGORY_ABBR = {
  餐厅: "饭",
  KTV: "K",
  酒吧: "酒",
  咖啡: "咖",
  夜宵: "夜",
  攀岩: "攀",
  骑行: "骑",
  桌游: "游"
};

function categoryAbbr(poi) {
  return CATEGORY_ABBR[poi.category] || (poi.category ? poi.category[0] : "店");
}

function sceneMetaAbbr(meta) {
  return meta?.abbr || meta?.label?.[0] || "?";
}

function sceneGroupAbbr(group) {
  return group?.abbr || group?.label?.[0] || "·";
}

function sceneIcon(abbr, accent, tint, sizeClass = "") {
  const iconColor = accent || "#FF6B35";
  const iconBg = tint || "#FFF4ED";
  const size = sizeClass ? ` ${sizeClass}` : "";
  return `<span class="scene-icon${size}" style="--icon-color:${iconColor};--icon-bg:${iconBg}">${escapeHTML(String(abbr))}</span>`;
}

function poiBadgeHTML(poi) {
  const { accent, bg } = poiPhotoGradient(poi);
  return sceneIcon(categoryAbbr(poi), accent, bg, "sm");
}

function updateAreaPill() {
  const el = $("#areaLabel");
  if (!el) return;
  const shouldShow = appState.currentPage === "map";
  el.hidden = !shouldShow;
  el.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  if (!shouldShow) return;
  const circle = getCurrentCircle();
  const stats = circleStats(circle);
  el.innerHTML = `
    <span class="loc-pin" aria-hidden="true" style="background:${circle.tint || "#FFF8E6"};border:2px solid ${circle.accent || "#FF6B35"}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${circle.accent || "#FF6B35"}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
    </span>
    <span class="loc-copy"><b>${escapeHTML(circle.shortName)}</b><small>${stats.buddies} 人想找搭子 · ${stats.shops} 家店 · 约 ${appState.browseRadiusKm}km</small></span>
    <span class="loc-chev" aria-hidden="true">›</span>
  `;
  bindAreaPill();
}

function currentBrowseRadiusKm() {
  const radius = Number(appState.browseRadiusKm || getCurrentCircle().radius_km || 2);
  return Number.isFinite(radius) && radius > 0 ? radius : 2;
}

function browseRadiusVisualSize() {
  return Math.max(28, Math.min(70, currentBrowseRadiusKm() * 14));
}

function rangeLabelHTML() {
  return `<span class="user-radius-label">${currentBrowseRadiusKm()}km</span>`;
}

function syncMapRangeOverlay() {
  const userPin = MAP_LAYOUT.user_pin || { x: 48, y: 54 };
  const size = browseRadiusVisualSize();
  document.querySelectorAll(".user-radius").forEach((el) => {
    el.style.left = `${userPin.x}%`;
    el.style.top = `${userPin.y}%`;
    el.style.width = `${size}%`;
    el.style.height = `${size}%`;
    el.dataset.radiusKm = String(currentBrowseRadiusKm());
    let label = el.querySelector(".user-radius-label");
    if (!label) {
      label = document.createElement("span");
      label.className = "user-radius-label";
      el.appendChild(label);
    }
    label.textContent = `${currentBrowseRadiusKm()}km`;
  });
}

function flatMapZonesHTML(classPrefix = "", options = {}) {
  const p = classPrefix ? `${classPrefix} ` : "";
  const pulse = options.pulseEat ? `<div class="${p}map-live-pulse" style="left:${(MAP_LAYOUT.user_pin || { x: 48 }).x}%;top:${(MAP_LAYOUT.user_pin || { y: 54 }).y}%"></div>` : "";
  const userPin = MAP_LAYOUT.user_pin || { x: 48, y: 54 };
  const radiusSize = browseRadiusVisualSize();
  return `
    <div class="${p}map-zone zone-dining" aria-hidden="true"></div>
    <div class="${p}map-zone zone-play" aria-hidden="true"></div>
    <div class="${p}map-zone zone-sport" aria-hidden="true"></div>
    <div class="${p}map-zone zone-night" aria-hidden="true"></div>
    <div class="${p}map-grid" aria-hidden="true"></div>
    <div class="${p}map-road road-main" aria-hidden="true"></div>
    <div class="${p}map-road road-cross" aria-hidden="true"></div>
    <div class="${p}map-road road-upper" aria-hidden="true"></div>
    <div class="${p}map-road road-lower" aria-hidden="true"></div>
    <div class="${p}map-road road-diagonal-a" aria-hidden="true"></div>
    <div class="${p}map-road road-diagonal-b" aria-hidden="true"></div>
    <div class="${p}map-road road-secondary-a" aria-hidden="true"></div>
    <div class="${p}map-road road-secondary-b" aria-hidden="true"></div>
    <span class="${p}map-place-label label-westwood">主街</span>
    <span class="${p}map-place-label label-campus">校园侧</span>
    <span class="${p}map-place-label label-riverside">河岸路</span>
    <span class="${p}map-zone-label zone-label-dining" aria-hidden="true">🍜 餐饮区</span>
    <span class="${p}map-zone-label zone-label-play" aria-hidden="true">🎮 玩乐区</span>
    <span class="${p}map-zone-label zone-label-sport" aria-hidden="true">🧗 运动区</span>
    <span class="${p}map-zone-label zone-label-night" aria-hidden="true">🌙 夜生活</span>
    ${pulse}
    <div class="user-location-pin map-user-pin" style="left:${userPin.x}%;top:${userPin.y}%"></div>
    <div class="user-radius" data-radius-km="${currentBrowseRadiusKm()}" style="left:${userPin.x}%;top:${userPin.y}%;width:${radiusSize}%;height:${radiusSize}%">${rangeLabelHTML()}</div>
  `;
}

function miniMapPinsHTML(poiList) {
  return poiList.map((poi, index) => {
    const pos = poiMapPercent(poi);
    const demand = Number(poi.buddy_demand_count || 0);
    const hot = Number(poi.hot_score || 0);
    const size = Math.max(6, Math.min(12, 5 + demand * 0.7 + (hot > 78 ? 2 : 0)));
    const { accent } = poiPhotoGradient(poi);
    return `
      <button type="button" class="mini-merchant-pin ${hot > 78 ? "is-hot" : ""}"
        data-poi="${poi.poi_id}"
        style="left:${pos.x}%;top:${pos.y}%;--pin-color:${accent};--pin-size:${size}px;--float-delay:${(index % 6) * 0.14}s"
        title="${escapeHTML(poi.name)} · ${demand} 人想约">
        <span>${escapeHTML(categoryAbbr(poi))}</span>
      </button>
    `;
  }).join("");
}

function isHotPoi(poi) {
  return Number(poi.hot_score || 0) > 80 || Number(poi.buddy_demand_count || 0) >= 7;
}

function pinSummaryHTML(poi, matchScore) {
  if (matchScore) {
    return `
      <span class="pin-ai-score">AI ${matchScore}</span>
      <span class="pin-count"><b>${poi.buddy_demand_count}</b><small>想约</small></span>
      <span class="pin-name">${escapeHTML(poi.name)}</span>
    `;
  }
  if (isHotPoi(poi)) {
    return `
      <span class="pin-count"><b>${poi.buddy_demand_count}</b><small>想约</small></span>
      <em>热</em>
      <span class="pin-name">${escapeHTML(poi.name)}</span>
    `;
  }
  return `
    <span class="pin-count"><b>${poi.buddy_demand_count}</b><small>想约</small></span>
    <span class="pin-name">${escapeHTML(poi.name)}</span>
  `;
}

function circleMoments(circle) {
  const list = poisInCircle(circle);
  const pool = [...users, ...backgroundUsers];
  const timeLabels = { now: "刚刚", tonight: "今晚", weekend: "周末" };
  const slot = timeLabels[appState.circleTimeSlot] || "刚刚";
  return pool.slice(0, 5).map((u, i) => {
    const poi = list[i % Math.max(list.length, 1)] || pois[0];
    const scenes = circle.hotScenes || ["饭搭子"];
    const scene = scenes[i % scenes.length];
    return {
      user: u.nickname,
      avatar: u.nickname[0],
      time: slot,
      ago: `${3 + i * 4} 分钟前`,
      text: `想在 ${poi?.name || "附近"} ${scene.replace("搭子", "")}，${u.social_style || "轻松聊聊"}`,
      poi_id: poi?.poi_id
    };
  });
}

function circleHotPois(circle, limit = 6) {
  return poisInCircle(circle)
    .slice()
    .sort((a, b) => (b.buddy_demand_count || 0) - (a.buddy_demand_count || 0))
    .slice(0, limit);
}

function circleInspirePrompts(circle) {
  const poi = circleHotPois(circle, 1)[0];
  const name = poi?.name || "附近";
  const base = [
    { title: "随便走走也行", text: `在${circle.shortName}找个人一起喝咖啡，不尬聊就好`, prompt: `想在${name}附近喝咖啡，轻松聊聊，预算适中。` },
    { title: "今晚走起不", text: "不想一个人吃饭，口味清淡一点", prompt: `今晚想在${name}附近找饭搭子，人均 80 左右，轻松氛围。` },
    { title: "周末透口气", text: circle.vibe === "透口气" ? "户外轻运动，节奏慢一点" : "想试试没去过的小店", prompt: `周末在${circle.shortName}找搭子，${circle.vibe || "随性"}一点就好。` }
  ];
  return base;
}

function brandSloganLine() {
  const lines = brand.slogans || [];
  if (!lines.length) return brand.tagline;
  return lines[Math.floor(Date.now() / 8000) % lines.length];
}

function showInviteCardModal(poiOverride = null, initialMode = "join") {
  const circle = getCurrentCircle();
  const hotPoi = poiOverride || poisInCircle(circle)
    .sort((a, b) => (b.buddy_demand_count * 3 + b.hot_score) - (a.buddy_demand_count * 3 + a.hot_score))[0]
    || appState.selectedPOI || pois[0];

  let mode = initialMode === "new" ? "new" : "join";
  let selectedTime = "今晚 19:30";
  const timeOptions = ["今晚 18:00", "今晚 19:30", "今晚 21:00", "周末 15:00"];
  const budgetBase = Math.max(40, Math.round(Number(hotPoi.avg_price || 80) / 10) * 10);
  const budgetOptions = Array.from(new Set([Math.max(40, budgetBase - 20), budgetBase, budgetBase + 30]));
  let groupSize = 2;
  let budgetLimit = budgetBase;

  const normalizeGroupSize = (value) => Math.max(1, Math.min(12, Number.parseInt(value, 10) || 2));
  const normalizeBudgetLimit = (value) => Math.max(0, Math.min(999, Math.round((Number(value) || budgetBase) / 10) * 10));

  function buildCardPreview(poi) {
    const deal = getDeal(poi.poi_id);
    const spotsLeft = Math.max(1, 3 - (poi.buddy_demand_count % 3));
    const coverUrl = poiCoverImage(poi);

    if (mode === "join") {
      return `
        <div id="icCardPreview" style="border-radius:16px;overflow:hidden;box-shadow:0 10px 36px rgba(0,0,0,0.14);margin:0 16px;">
          <!-- Cover with overlay -->
          <div style="height:148px;background:url('${coverUrl}') center/cover no-repeat;position:relative;">
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0.62) 100%);"></div>
            <div style="position:absolute;top:10px;right:10px;background:#FFE033;color:#1a1a1a;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:800;">还差 ${spotsLeft} 人</div>
            <div style="position:absolute;bottom:12px;left:14px;right:14px;color:#fff;">
              <p style="font-size:17px;font-weight:900;margin:0;text-shadow:0 1px 4px rgba(0,0,0,0.4);">${escapeHTML(poi.name)}</p>
              <p style="font-size:12px;margin:3px 0 0;opacity:0.88;">评分 ${poi.rating} · ${escapeHTML(poi.sub_category)} · 人均 ¥${poi.avg_price}</p>
            </div>
          </div>
          <!-- Info body -->
          <div style="background:linear-gradient(135deg,#fffbea 0%,#fff5f7 100%);padding:14px 16px 12px;">
            <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;font-weight:600;">
              <span>时间 今晚 ${18 + Math.round(poi.hot_score / 32)}:00</span>
              <span>氛围 ${escapeHTML(poi.suitable_social_styles[0] || "轻松聊天")}</span>
              <span>预算 ¥${poi.avg_price} 以内</span>
            </div>
            ${deal ? `
              <div style="display:flex;align-items:center;gap:7px;margin-top:9px;">
                <span style="background:#ff2442;color:#fff;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;flex-shrink:0;">团购</span>
                <span style="font-size:12px;color:#555;">${escapeHTML(deal.title)}</span>
              </div>` : ""}
            <div style="border-top:1px solid rgba(0,0,0,0.07);margin-top:10px;padding-top:9px;display:flex;align-items:center;gap:6px;font-size:12px;color:#777;">
              <span style="width:8px;height:8px;border-radius:50%;background:#58cc02;flex-shrink:0;display:inline-block;"></span>
              ${escapeHTML(circle.shortName)} · 此刻 <b style="color:#FF6B35;margin:0 2px;">${poi.buddy_demand_count}</b> 人正在找搭子
            </div>
          </div>
        </div>`;
    } else {
      return `
        <div id="icCardPreview" style="border-radius:16px;overflow:hidden;box-shadow:0 10px 36px rgba(0,0,0,0.14);margin:0 16px;">
          <div style="height:120px;background:url('${coverUrl}') center/cover no-repeat;position:relative;">
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.05),rgba(0,0,0,0.55));"></div>
            <div style="position:absolute;top:10px;left:12px;background:#fff;color:#1a1a1a;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:800;">新建局</div>
            <div style="position:absolute;bottom:12px;left:14px;right:14px;color:#fff;">
              <p style="font-size:16px;font-weight:900;margin:0;">${escapeHTML(poi.name)}</p>
              <p id="icInviteSummary" style="font-size:12px;margin:5px 0 0;opacity:0.86;">${escapeHTML(selectedTime)} · ${groupSize} 人 · ¥${budgetLimit} 以内</p>
            </div>
          </div>
          <div style="background:#fff;padding:14px 16px 12px;display:grid;gap:12px;">
            <div>
              <p style="font-size:11px;color:#999;font-weight:800;margin-bottom:7px;letter-spacing:0.03em;">活动时间</p>
              <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:8px;">
              ${timeOptions.map((t) => `
                <button class="ic-time-opt" data-t="${escapeHTML(t)}"
                  style="min-height:34px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;
                    border:2px solid ${selectedTime === t ? "#FFE033" : "#ebebeb"};
                    background:${selectedTime === t ? "#FFF8CC" : "#f9f9f9"};
                    color:${selectedTime === t ? "#1a1a1a" : "#888"};">
                  ${escapeHTML(t)}
                </button>`).join("")}
              </div>
              <input id="icTimeInput" value="${escapeHTML(selectedTime)}" placeholder="自定义时间"
                style="width:100%;min-height:40px;border:1.5px solid #e8e8e8;border-radius:10px;padding:0 12px;font-size:13px;font-weight:750;color:#222;background:#fff;">
            </div>

            <div style="display:grid;grid-template-columns:0.9fr 1.1fr;gap:10px;">
              <div>
                <p style="font-size:11px;color:#999;font-weight:800;margin-bottom:7px;letter-spacing:0.03em;">人数</p>
                <div style="display:grid;grid-template-columns:34px 1fr 34px;align-items:center;border:1.5px solid #e8e8e8;border-radius:10px;overflow:hidden;min-height:40px;background:#fff;">
                  <button type="button" id="icGroupMinus" style="border:0;background:#f7f7f7;height:40px;font-size:18px;font-weight:900;color:#555;">-</button>
                  <input id="icGroupInput" type="number" min="1" max="12" value="${groupSize}"
                    style="border:0;text-align:center;font-size:14px;font-weight:900;color:#222;outline:none;">
                  <button type="button" id="icGroupPlus" style="border:0;background:#f7f7f7;height:40px;font-size:18px;font-weight:900;color:#555;">+</button>
                </div>
              </div>
              <div>
                <p style="font-size:11px;color:#999;font-weight:800;margin-bottom:7px;letter-spacing:0.03em;">人均预算</p>
                <div style="display:flex;align-items:center;border:1.5px solid #e8e8e8;border-radius:10px;min-height:40px;background:#fff;padding:0 10px;gap:4px;">
                  <span style="font-size:13px;font-weight:900;color:#555;">¥</span>
                  <input id="icBudgetInput" type="number" min="0" step="10" value="${budgetLimit}"
                    style="width:100%;border:0;font-size:14px;font-weight:900;color:#222;outline:none;">
                  <span style="font-size:12px;font-weight:800;color:#888;white-space:nowrap;">以内</span>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${budgetOptions.map((amount) => `
                <button type="button" class="ic-budget-opt" data-budget="${amount}"
                  style="min-height:30px;border-radius:999px;padding:0 12px;font-size:11px;font-weight:800;cursor:pointer;
                    border:1.5px solid ${budgetLimit === amount ? "#FFE033" : "#e8e8e8"};
                    background:${budgetLimit === amount ? "#fff8cc" : "#f7f7f7"};
                    color:${budgetLimit === amount ? "#222" : "#777"};">
                  ¥${amount}
                </button>`).join("")}
            </div>

            <p style="font-size:12px;color:#888;line-height:1.55;">生成后可分享给朋友，对方打开后能直接看到时间、人数和预算。</p>
          </div>
        </div>`;
    }
  }

  function renderModal() {
    let overlay = document.getElementById("inviteCardOverlay");
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "inviteCardOverlay";
    overlay.className = "modal-overlay";
    overlay.style.zIndex = "90";

    const tabStyle = (active) =>
      `min-height:38px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;
       border:2px solid ${active ? "#FFE033" : "#ebebeb"};
       background:${active ? "#FFE033" : "white"};
       color:${active ? "#1a1a1a" : "#666"};`;

    overlay.innerHTML = `
      <div class="modal-sheet" style="padding-bottom:36px;">
        <div class="modal-header">
          <div>
            <h2 style="font-size:17px;margin:0;">邀请卡片</h2>
            <p style="font-size:11px;color:#999;margin:2px 0 0;">发出后对方一键接受即进活动页</p>
          </div>
          <button class="modal-close" id="closeInviteCard">关闭</button>
        </div>
        <!-- Tab -->
        <div style="display:flex;gap:8px;margin:12px 16px 14px;">
          <button id="icTabJoin" style="flex:1;${tabStyle(mode === "join")}">约人来已有活动</button>
          <button id="icTabNew"  style="flex:1;${tabStyle(mode === "new")}">新建活动局</button>
        </div>
        <!-- Card preview -->
        ${buildCardPreview(hotPoi)}
        <!-- CTA row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px 0;">
          <button type="button" class="secondary-button" id="icCopy" style="min-height:46px;font-size:13px;">复制链接</button>
          <button type="button" class="primary-button"   id="icGo"   style="min-height:46px;font-size:14px;">
            ${mode === "join" ? "加入活动" : "生成卡片"}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#closeInviteCard").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#icTabJoin").addEventListener("click", () => { mode = "join"; renderModal(); });
    overlay.querySelector("#icTabNew").addEventListener("click",  () => { mode = "new";  renderModal(); });
    overlay.querySelector("#icCopy").addEventListener("click", () => showToast("链接已复制（演示）"));
    overlay.querySelector("#icGo").addEventListener("click", () => {
      if (mode === "join") {
        overlay.remove();
        appState.userInput = defaultIntentTextForPoi(hotPoi);
        appState.poiConstraint = hotPoi;
        closeCirclePage();
        setPage("ai");
        setTimeout(() => runAI(), 400);
      } else {
        overlay.remove();
        showToast(`「${hotPoi.name}」${selectedTime} · ${groupSize}人 · ¥${budgetLimit}以内已生成`);
      }
    });
    const refreshInviteSummary = () => {
      const summary = overlay.querySelector("#icInviteSummary");
      if (summary) summary.textContent = `${selectedTime} · ${groupSize} 人 · ¥${budgetLimit} 以内`;
    };
    overlay.querySelectorAll(".ic-time-opt").forEach((btn) => {
      btn.addEventListener("click", () => { selectedTime = btn.dataset.t; renderModal(); });
    });
    const timeInput = overlay.querySelector("#icTimeInput");
    if (timeInput) {
      timeInput.addEventListener("input", () => {
        const next = timeInput.value.trim();
        if (next) selectedTime = next;
        refreshInviteSummary();
      });
      timeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") timeInput.blur();
      });
    }
    overlay.querySelector("#icGroupMinus")?.addEventListener("click", () => {
      groupSize = normalizeGroupSize(groupSize - 1);
      renderModal();
    });
    overlay.querySelector("#icGroupPlus")?.addEventListener("click", () => {
      groupSize = normalizeGroupSize(groupSize + 1);
      renderModal();
    });
    overlay.querySelector("#icGroupInput")?.addEventListener("change", (e) => {
      groupSize = normalizeGroupSize(e.target.value);
      e.target.value = groupSize;
      refreshInviteSummary();
    });
    overlay.querySelector("#icBudgetInput")?.addEventListener("change", (e) => {
      budgetLimit = normalizeBudgetLimit(e.target.value);
      e.target.value = budgetLimit;
      refreshInviteSummary();
    });
    overlay.querySelectorAll(".ic-budget-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        budgetLimit = normalizeBudgetLimit(btn.dataset.budget);
        renderModal();
      });
    });
  }

  renderModal();
}

function renderCirclePage() {
  let page = document.getElementById("circlePage");
  if (page) page.remove();
  const current = getCurrentCircle();
  const circlePoiList = poisInCircle(current);
  const filteredPoiList = filteredMockPois(appState.selectedCategory);
  const displayPoiList = filteredPoiList;
  const stats = {
    shops: displayPoiList.length,
    buddies: displayPoiList.reduce((s, p) => s + (p.buddy_demand_count || 0), 0),
    active: users.length + backgroundUsers.length
  };
  const circleTotalStats = circleStats(current);
  const activeGroupId = activeSceneGroupId();
  const activeGroup = sceneGroups.find((g) => g.id === activeGroupId);
  const activeSceneName = appState.selectedCategory === "全部" ? "全部类型" : sceneFilterLabel();
  const sceneSummary = `${displayPoiList.length} 家店 · ${stats.buddies} 人想约`;
  const allUsers = [...users, ...backgroundUsers];
  const displayPoiIds = new Set(displayPoiList.map((p) => p.poi_id));
  const liveDemands = buddyDemands
    .filter((d) => d.status === "waiting" && displayPoiIds.has(d.poi_id))
    .slice(0, 5)
    .map((d) => {
      const poi = pois.find((p) => p.poi_id === d.poi_id);
      const user = allUsers.find((u) => u.user_id === d.user_id);
      return { ...d, poi_name: poi?.name || "附近餐厅", distance_km: user?.distance_km ?? poi?.distance_km ?? 1.2 };
    });
  const moments = circleMoments(current);
  const mapPois = displayPoiList
    .slice()
    .sort((a, b) => (b.buddy_demand_count || 0) - (a.buddy_demand_count || 0))
    .slice(0, 6);
  const maxPerShop = Math.max(...displayPoiList.map((p) => p.buddy_demand_count || 0), 1);
  // time-slot multipliers: buddies drop faster than shops (shops stay open, people vary)
  const slotBonus = appState.circleTimeSlot === "now" ? 1.0 : appState.circleTimeSlot === "tonight" ? 0.75 : 0.5;
  const shopMult  = appState.circleTimeSlot === "now" ? 1.0 : appState.circleTimeSlot === "tonight" ? 0.86 : 0.70;
  const effectiveBuddies = Math.round(stats.buddies * slotBonus);
  const effectiveShops   = Math.round(stats.shops   * shopMult);
  const browsing = Math.round((stats.active + stats.buddies + 12) * (0.55 + slotBonus * 0.45));
  const avgDemand = effectiveBuddies / Math.max(effectiveShops, 1);
  // normalize: hottest-shop (0–45) + avg demand density (0–35) + base(15), all × time slot
  const heatPct = Math.min(95, Math.round(slotBonus * (15 + (maxPerShop / 12) * 45 + (avgDemand / 8) * 35)));
  const timeSlots = [
    { id: "now", label: "现在" },
    { id: "tonight", label: "今晚" },
    { id: "weekend", label: "本周末" }
  ];

  page = document.createElement("div");
  page.id = "circlePage";
  page.className = "circle-page";
  page.innerHTML = `
    <header class="circle-page-header">
      <button type="button" class="back-text-btn" id="closeCirclePage">返回</button>
      <h1>发现</h1>
    </header>
    <div class="circle-page-body">
      <section class="circle-hero" style="--circle-tint:${current.tint}">
        <div class="circle-pulse-bar">
          <span><span class="live-dot"></span> ${browsing} 人正逛这个圈</span>
          <span class="circle-weather">${circleWeather.temp}° ${escapeHTML(circleWeather.label)}</span>
        </div>
        <b>${escapeHTML(current.name)}</b>
        <p>${escapeHTML(current.tagline)} · ${escapeHTML(activeSceneName)}</p>
        <p class="circle-ad-line">「${escapeHTML(brandSloganLine())}」</p>
        <div class="circle-time-row" id="circleTimeRow">
          ${timeSlots.map((t) => `
            <button type="button" class="circle-time-chip ${appState.circleTimeSlot === t.id ? "is-active" : ""}" data-slot="${t.id}">${t.label}</button>
          `).join("")}
        </div>
        <div style="margin-top:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="font-size:11px;font-weight:700;color:#555;letter-spacing:0.02em;">成局热度</span>
            <span style="font-size:11px;font-weight:700;color:#FF6B35;">${appState.circleTimeSlot === "weekend" ? "本周末" : appState.circleTimeSlot === "tonight" ? "今晚" : "此刻"} ${effectiveBuddies} 人想约 · ${heatPct}%</span>
          </div>
          <div style="height:7px;background:rgba(0,0,0,0.08);border-radius:4px;overflow:hidden;">
            <div style="width:${heatPct}%;height:100%;border-radius:4px;transition:width 0.45s ease;background:${heatPct >= 75 ? "linear-gradient(90deg,#FFB347,#FF6B35,#FF2442)" : heatPct >= 45 ? "linear-gradient(90deg,#FFE033,#FFB347,#FF6B35)" : "linear-gradient(90deg,#FFE033,#FFB347)"};"></div>
          </div>
        </div>
        <div class="circle-mini-map" id="circleMiniMap" style="margin-top:8px;">
          ${flatMapZonesHTML("", { pulseEat: true })}
          <canvas id="miniHeatCanvas" style="position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;opacity:0.58;border-radius:12px;"></canvas>
          <div class="mini-map-pins">${miniMapPinsHTML(displayPoiList)}</div>
        </div>
        <p class="muted" style="font-size:11px;margin-top:6px;">地图已按「${escapeHTML(activeSceneName)}」显示 ${escapeHTML(sceneSummary)}</p>
        <div class="circle-card-stats" style="margin-top:10px">
          <span><b>${effectiveShops}</b> 家店</span>
          <span><b>${effectiveBuddies}</b> 人想约</span>
          <span>约 ${appState.browseRadiusKm}km</span>
        </div>
      </section>

      <section class="card discover-filter-card">
        <div class="section-head"><h3>地图筛选</h3><button type="button" class="linkish" id="circleSeeMap">看地图</button></div>
        <p class="muted discover-filter-note">切换生活圈或类型后，地图上的商家点位和热力会同步更新。</p>

        <div class="discover-control-label">生活圈</div>
        <div class="circle-list discover-circle-list">
          ${lifeCircles.map((c) => {
            const s = circleStats(c);
            const active = c.id === appState.selectedCircleId;
            return `
              <button type="button" class="circle-card discover-circle-card ${active ? "is-active" : ""}" data-circle="${c.id}"
                style="--card-tint:${c.tint};--card-accent:${c.accent}">
                <div class="circle-card-head">
                  <span class="circle-card-icon">${escapeHTML(c.shortName[0])}</span>
                  <div>
                    <h3>${escapeHTML(c.name)}</h3>
                    <p class="circle-meta">${escapeHTML(c.vibe || "")} · ${s.shops} 店 · ${s.buddies} 人想约</p>
                  </div>
                </div>
              </button>
            `;
          }).join("")}
        </div>

        <div class="discover-control-label">浏览范围</div>
        <div class="radius-row" id="radiusRow">
          ${[2, 3, 5].map((km) => `
            <button type="button" class="radius-chip ${appState.browseRadiusKm === km ? "is-active" : ""}" data-radius="${km}">${km} km</button>
          `).join("")}
        </div>

        <div class="discover-control-label">组局类型</div>
        <div class="scene-group-grid discover-scene-grid" role="tablist">
          <button type="button" class="scene-group-tile ${appState.selectedCategory === "全部" ? "is-active" : ""}" data-discover-group="all" style="--accent:#FF6B35;--tint:#FFF4ED">
            ${sceneIcon("全", "#FF6B35", "#FFF4ED")}
            <span class="sg-label">全部</span>
            <span class="sg-meta">${circlePoiList.length} 店 · ${circleTotalStats.buddies} 人</span>
          </button>
          ${sceneGroups.map((group) => {
            const groupStats = groupDemandStats(group);
            const isActive = activeGroupId === group.id;
            return `
              <button type="button" class="scene-group-tile ${isActive ? "is-active" : ""}" data-discover-group="${group.id}"
                style="--accent:${group.accent};--tint:${group.tint}">
                ${sceneIcon(sceneGroupAbbr(group), group.accent, group.tint)}
                <span class="sg-label">${group.label}</span>
                <span class="sg-meta">${groupStats.shops} 店 · ${groupStats.people} 人</span>
              </button>
            `;
          }).join("")}
        </div>
        <div class="scene-sub-panel ${activeGroup ? "is-open" : ""}" ${activeGroup ? "" : 'aria-hidden="true"'}>
          ${activeGroup ? `
            <div class="scene-sub-track">
              ${activeGroup.scenes.map((scene) => {
                const meta = sceneCatalog[scene] || { abbr: scene[0], tagline: scene };
                const sceneStats = sceneDemandStats(scene);
                const isSceneActive = appState.selectedCategory === scene;
                return `
                  <button type="button" class="scene-sub-chip ${isSceneActive ? "is-active" : ""}" data-discover-scene="${scene}"
                    style="--accent:${activeGroup.accent}">
                    ${sceneIcon(sceneMetaAbbr(meta), activeGroup.accent, activeGroup.tint, "sm")}
                    <span class="ssc-text">
                      <b>${scene.replace("搭子", "")}</b>
                      <small>${sceneStats.shops} 店 · ${sceneStats.people} 人想约</small>
                    </span>
                  </button>
                `;
              }).join("")}
            </div>
          ` : ""}
        </div>
        ${appState.selectedCategory !== "全部" ? `
          <button type="button" class="scene-clear-filter" id="clearDiscoverFilter">清除类型筛选 · 看全部地点</button>
        ` : ""}
      </section>

      <div class="section-head" style="margin-top:14px"><h3>地图上的地点</h3><span class="muted" style="font-size:12px;">${escapeHTML(sceneSummary)}</span></div>
      <div class="discover-poi-list">
        ${mapPois.map((p) => `
          <button type="button" class="discover-poi-row" data-poi="${p.poi_id}">
            ${poiBadgeHTML(p)}
            <div>
              <b>${escapeHTML(p.name)}</b>
              <p>${escapeHTML(p.sub_category)} · ${p.distance_km}km · ${p.buddy_demand_count} 人想约</p>
            </div>
            <span>¥${p.avg_price}</span>
          </button>
        `).join("") || `<div class="empty-state">这个筛选下暂时没有地点，换个类型试试。</div>`}
      </div>

      <div class="section-head" style="margin-top:14px"><h3>圈子里正在发生</h3></div>
      <div class="circle-moment-list">
        ${moments.slice(0, 3).map((m) => `
          <button type="button" class="circle-moment" data-poi="${m.poi_id || ""}">
            <div class="circle-moment-head">
              <span class="circle-live-avatar">${escapeHTML(m.avatar)}</span>
              <div><b>${escapeHTML(m.user)}</b> <small>${escapeHTML(m.ago)} · ${escapeHTML(m.time)}</small></div>
            </div>
            <p>${escapeHTML(m.text)}</p>
          </button>
        `).join("")}
      </div>

      <section class="card circle-live" style="margin-top:12px">
        <p class="eyebrow">可加入的局</p>
        ${liveDemands.map((d) => `
          <div class="circle-live-item">
            <span class="circle-demand-icon">${escapeHTML((d.activity_type || "搭")[0])}</span>
            <div style="flex:1">
              <b>${escapeHTML(d.poi_name)}</b>
              <p class="muted" style="font-size:12px;">${escapeHTML(d.target_time)} · ¥${d.budget_min}–${d.budget_max} · ${d.distance_km}km</p>
            </div>
            <button type="button" class="text-button" data-join="${escapeHTML(d.demand_id)}">加入</button>
          </div>
        `).join("") || `<p class="muted" style="font-size:12px;margin-top:8px;">当前筛选下暂无可加入的局。</p>`}
        <button type="button" class="primary-button wide" id="circleGoMatch" style="margin-top:12px">用${escapeHTML(brand.name)}匹配一个搭子</button>
      </section>
    </div>
  `;
  document.body.appendChild(page);
  document.body.style.overflow = "hidden";
  syncMapRangeOverlay();

  // Render mini-map heat after layout
  const slotMultMini = appState.circleTimeSlot === "weekend" ? 0.45
                     : appState.circleTimeSlot === "tonight" ? 0.72 : 1.0;
  const miniList = displayPoiList;
  function tryMiniHeat(attempts) {
    const mc = document.getElementById("miniHeatCanvas");
    if (!mc) return;
    if (!drawHeatOnCanvas(mc, miniList, slotMultMini) && (attempts || 0) < 10) {
      setTimeout(() => tryMiniHeat((attempts || 0) + 1), 80);
    }
  }
  setTimeout(() => tryMiniHeat(0), 0);

  page.querySelector("#closeCirclePage").addEventListener("click", closeCirclePage);
  page.querySelectorAll("[data-circle]").forEach((btn) => {
    btn.addEventListener("click", () => selectLifeCircle(btn.dataset.circle));
  });
  page.querySelectorAll("[data-radius]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyBrowseRadius(btn.dataset.radius);
      renderCirclePage();
      showToast(`浏览范围已更新为 ${currentBrowseRadiusKm()}km`);
    });
  });
  page.querySelectorAll("[data-slot]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.circleTimeSlot = btn.dataset.slot;
      renderCirclePage();
      setTimeout(renderHeatCanvas, 0); // re-draw main map heat for new slot
    });
  });
  page.querySelectorAll("[data-discover-group]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.discoverGroup;
      if (id === "all") {
        applySceneFilter("全部", { expandNav: false });
      } else {
        applySceneFilter(`group:${id}`, { expandNav: true });
      }
      renderCirclePage();
    });
  });
  page.querySelectorAll("[data-discover-scene]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applySceneFilter(btn.dataset.discoverScene, { expandNav: true });
      renderCirclePage();
    });
  });
  page.querySelector("#clearDiscoverFilter")?.addEventListener("click", () => {
    applySceneFilter("全部", { expandNav: false });
    renderCirclePage();
  });
  page.querySelectorAll(".circle-moment[data-poi], .circle-hot-card[data-poi], .mini-merchant-pin[data-poi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poi = pois.find((p) => p.poi_id === btn.dataset.poi);
      if (!poi) return;
      appState.selectedPOI = poi;
      closeCirclePage();
      setPage("map");
      setTimeout(() => {
        updatePOISheet();
        const sheet = document.getElementById("poiSheet");
        if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    });
  });
  page.querySelectorAll(".discover-poi-row[data-poi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poi = pois.find((p) => p.poi_id === btn.dataset.poi);
      if (!poi) return;
      appState.selectedPOI = poi;
      closeCirclePage();
      setPage("map");
      setTimeout(updatePOISheet, 80);
    });
  });
  page.querySelector("#circleSeeMap").addEventListener("click", () => {
    closeCirclePage();
    setPage("map");
  });
  page.querySelectorAll("[data-join]").forEach((btn) => {
    btn.addEventListener("click", () => joinDemand(btn.dataset.join));
  });
  page.querySelector("#circleGoMatch").addEventListener("click", () => {
    closeCirclePage();
    setPage("ai");
  });
}

function updateChatNavBadge() {
  const btn = document.querySelector('.nav-item[data-page="chat"]');
  if (!btn) return;
  btn.querySelector(".nav-dot")?.remove();
  const n = appState.groupChats.length;
  if (n > 0) {
    const dot = document.createElement("em");
    dot.className = "nav-dot";
    dot.textContent = String(n);
    btn.appendChild(dot);
  }
}

function venueExtraModalRows(poi) {
  const ex = poi.venue_extra;
  if (!ex) return "";
  const row = (label, value) => `<div class="modal-info-row"><span>${label}</span><b>${value}</b></div>`;
  if (poi.category === "攀岩") {
    return [row("难度", ex.climb_grade), row("装备", ex.gear_rental), row("时长", ex.session_duration)].join("");
  }
  if (poi.category === "骑行") {
    return [row("路线", ex.route_length), row("租车", ex.bike_rental), row("集合", ex.meet_point)].join("");
  }
  if (poi.category === "桌游") {
    return [row("包厢", ex.private_room), row("时长", ex.avg_session_hours), row("类型", ex.game_focus)].join("");
  }
  return "";
}

function venueExtraChips(poi) {
  const ex = poi.venue_extra;
  if (!ex) return "";
  if (poi.category === "攀岩") {
    return `<span class="mchip">${ex.climb_grade}</span><span class="mchip">${ex.gear_rental}</span>`;
  }
  if (poi.category === "骑行") {
    return `<span class="mchip">${ex.route_length}</span><span class="mchip">${ex.bike_rental}</span>`;
  }
  if (poi.category === "桌游") {
    return `<span class="mchip">${ex.private_room}</span><span class="mchip">${ex.avg_session_hours}</span>`;
  }
  return "";
}

function merchantFitSummary(poi) {
  if (poi.category === "桌游") {
    return {
      title: "适合先定人数再到店",
      text: "2-6 人比较舒服，想轻松破冰可以选聚会桌游；跑团/RPG 建议预留更长时间。",
      chips: [poi.venue_extra?.private_room, poi.venue_extra?.avg_session_hours, poi.venue_extra?.game_focus].filter(Boolean)
    };
  }
  if (poi.category === "攀岩") {
    return {
      title: "适合低压力运动局",
      text: "新手可以从体验线开始，装备能租，约一个节奏接近的人会更舒服。",
      chips: [poi.venue_extra?.climb_grade, poi.venue_extra?.gear_rental, poi.venue_extra?.session_duration].filter(Boolean)
    };
  }
  if (poi.category === "骑行") {
    return {
      title: "适合提前约集合点",
      text: "路线和速度最好先说清楚，轻松骑比拼速度更适合第一次见面。",
      chips: [poi.venue_extra?.route_length, poi.venue_extra?.bike_rental, poi.venue_extra?.meet_point].filter(Boolean)
    };
  }
  if (poi.category === "KTV" || poi.category === "酒吧") {
    return {
      title: "适合小组热闹局",
      text: "更适合 3 人以上，先定预算和结束时间，现场会轻松很多。",
      chips: ["小组友好", "适合晚间", "预算先说清"]
    };
  }
  return {
    title: "适合边吃边聊",
    text: "第一次见面选这类店比较稳，排队不久、预算清楚，聊天压力低。",
    chips: [poi.sub_category, "轻松聊天", "预算清楚"].filter(Boolean)
  };
}

function merchantWaitLabel(poi) {
  const wait = Number(poi.wait_time_min || 0);
  if (wait <= 3) return "基本不用等";
  if (wait <= 12) return "排队可接受";
  if (wait <= 25) return "建议先约好时间";
  return "高峰期偏久";
}

function merchantDealShort(poi) {
  return String(poi.deal_text || "暂无团购").replace(/\s+/g, " ");
}

function defaultIntentTextForPoi(poi) {
  if (poi.category === "攀岩") {
    return `周末想去${poi.name}抱石，预算 ${poi.avg_price} 元以内，新手友好，离我不要太远。`;
  }
  if (poi.category === "骑行") {
    return `周末想${poi.sub_category || "休闲骑行"}，预算 ${poi.avg_price} 元以内，节奏别太快，3 公里内集合。`;
  }
  if (poi.category === "桌游") {
    return `今晚想玩${poi.sub_category || "桌游"}，${categoryToActivity(poi)}，预算 ${poi.avg_price} 元以内，轻松组局。`;
  }
  return `今晚想去${poi.name}，${poi.sub_category}，预算 ${poi.avg_price} 元以内，最好轻松聊聊，离我不要太远。`;
}

function renderMapPage() {
  if (!document.getElementById("mockMapCanvas")) {
    $("#mapPage").innerHTML = `
      <div class="map-page-layout">
        <div id="mapStatsBar" class="stat-strip card"></div>
        <section class="map-block card map-card">
          <div id="mockMapCanvas" class="${("AMap" in window) ? "real-map" : "fake-map"}" role="img" aria-label="${escapeHTML(getCurrentCircle().name)}地图">
            ${("AMap" in window) ? "" : `${flatMapZonesHTML()}
            <canvas id="heatCanvas" style="position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;opacity:0.58;border-radius:12px;"></canvas>
            <div id="mockMapPins" class="map-pins-layer"></div>`}
          </div>
          <p class="map-layout-legend">${escapeHTML(getCurrentCircle().shortName)} · ${("AMap" in window) ? "高德地图" : "街区热力 · 小点为商家"} · 点击气泡看店</p>
        </section>
        <section id="poiSheet" class="merchant-block poi-sheet card"></section>
      </div>
    `;
    initMockMap();
  }
  updateMapStats();
  updateSceneNavigator();
  syncMapRangeOverlay();
  if (mockMapReady) {
    if (amapInstance) {
      renderAmapPins();
    } else {
      renderMockMapPins();
      setTimeout(renderHeatCanvas, 0);
    }
    updatePOISheet();
  } else if (appState.selectedPOI) {
    updatePOISheet();
  }
}

/** 示意地图 pin 位置：mockData 里 POI 的 x/y（0–100 百分比），非经纬度 */
function poiMapPercent(poi) {
  return {
    x: Math.max(4, Math.min(96, Number(poi.x) || 50)),
    y: Math.max(8, Math.min(92, Number(poi.y) || 50))
  };
}

const POI_MAP_CACHE_VERSION = 2;
let _mockPoisWithCoords = null;
let _mockPoisCacheVersion = 0;
function getMockPoisWithCoords() {
  if (!_mockPoisWithCoords || _mockPoisCacheVersion !== POI_MAP_CACHE_VERSION) {
    _mockPoisCacheVersion = POI_MAP_CACHE_VERSION;
    _mockPoisWithCoords = pois.map((p) => {
      const pos = poiMapPercent(p);
      return { ...p, mapX: pos.x, mapY: pos.y };
    });
  }
  return _mockPoisWithCoords;
}

function filteredMockPois(category) {
  const circle = getCurrentCircle();
  const inCircle = poisInCircle(circle);
  const circleIds = new Set(inCircle.map((p) => p.poi_id));
  const all = getMockPoisWithCoords().filter((p) => circleIds.has(p.poi_id));
  if (category === "全部") return all;
  if (String(category).startsWith("group:")) {
    const group = sceneGroups.find((g) => g.id === category.slice(6));
    if (!group) return all;
    return all.filter((p) => group.scenes.includes(categoryToActivity(p)));
  }
  return all.filter((p) => categoryToActivity(p) === category);
}

function sceneDemandStats(activity) {
  const matched = poisInCircle(getCurrentCircle()).filter((p) => categoryToActivity(p) === activity);
  return {
    shops: matched.length,
    people: matched.reduce((sum, p) => sum + (p.buddy_demand_count || 0), 0)
  };
}

function groupDemandStats(group) {
  const inCircle = poisInCircle(getCurrentCircle());
  const matched = inCircle.filter((p) => group.scenes.includes(categoryToActivity(p)));
  return {
    shops: matched.length,
    people: matched.reduce((s, p) => s + (p.buddy_demand_count || 0), 0)
  };
}

function activeSceneGroupId() {
  if (appState.selectedCategory === "全部") return null;
  if (String(appState.selectedCategory).startsWith("group:")) return appState.selectedCategory.slice(6);
  const meta = sceneCatalog[appState.selectedCategory];
  return meta ? meta.groupId : null;
}

function applySceneFilter(category, options = {}) {
  const { expandNav = true } = options;
  appState.selectedCategory = category;
  if (category === "全部") {
    appState.selectedSceneGroup = null;
    appState.sceneNavExpanded = false;
  } else if (String(category).startsWith("group:")) {
    appState.selectedSceneGroup = category.slice(6);
    appState.sceneNavExpanded = expandNav;
  } else {
    const meta = sceneCatalog[category];
    appState.selectedSceneGroup = meta ? meta.groupId : null;
    appState.sceneNavExpanded = expandNav && !!meta;
  }
  refreshMapSupply();
}

function sceneFilterLabel() {
  if (appState.selectedCategory === "全部") return "全部地点";
  if (String(appState.selectedCategory).startsWith("group:")) {
    const g = sceneGroups.find((gr) => gr.id === appState.selectedCategory.slice(6));
    return g ? `${g.label} · 全部` : "筛选中";
  }
  return appState.selectedCategory;
}

function refreshMapSupply() {
  gaodePOIs = filteredMockPois(appState.selectedCategory);
  if (!gaodePOIs.some((p) => p.poi_id === appState.selectedPOI?.poi_id)) {
    appState.selectedPOI = gaodePOIs[0] || null;
  }
  syncMapRangeOverlay();
  if (mockMapReady) {
    if (amapInstance) {
      renderAmapPins();
    } else {
      renderMockMapPins();
      setTimeout(renderHeatCanvas, 0);
    }
    updatePOISheet();
    updateMapStats();
    updateSceneNavigator();
  }
}

function initMockMap() {
  if (!appState.selectedCircleId && lifeCircles[0]) appState.selectedCircleId = lifeCircles[0].id;
  gaodePOIs = filteredMockPois(appState.selectedCategory);
  const preSelected = appState.selectedPOI && gaodePOIs.some((p) => p.poi_id === appState.selectedPOI.poi_id);
  if (!preSelected) appState.selectedPOI = gaodePOIs[0] || null;
  if ("AMap" in window) {
    initRealMap();
  } else {
    initFakeMap();
  }
}

function initFakeMap() {
  mockMapReady = true;
  renderMockMapPins();
  setTimeout(renderHeatCanvas, 0);
  updateMapStats();
  updatePOISheet();
}

function initRealMap() {
  const circle = getCurrentCircle();
  const centerLng = circle.center_lng || -118.4452;
  const centerLat = circle.center_lat || 34.0629;
  const container = document.getElementById("mockMapCanvas");
  if (!container) { initFakeMap(); return; }
  try {
    // eslint-disable-next-line no-undef
    const AMap = /** @type {any} */ (window["AMap"]);
    amapInstance = new AMap.Map(container, {
      center: [centerLng, centerLat],
      zoom: 15,
      zooms: [14, 17],
      mapStyle: "amap://styles/whitesmoke"
    });
    amapInstance.on("complete", () => {
      try { amapInstance.setLimitBounds(amapInstance.getBounds()); } catch (_) {}
    });
    mockMapReady = true;
    renderAmapPins();
    updateMapStats();
    updatePOISheet();
  } catch (err) {
    console.warn("[AMap] 初始化失败，降级为平面示意地图", err);
    container.className = "fake-map";
    container.innerHTML = flatMapZonesHTML() +
      '<canvas id="heatCanvas" style="position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;opacity:0.58;border-radius:12px;"></canvas>' +
      '<div id="mockMapPins" class="map-pins-layer"></div>';
    amapInstance = null;
    initFakeMap();
  }
}

function renderAmapPins() {
  if (!amapInstance) return;
  amapInstance.clearMap();
  amapRangeCircle = null;
  const AMap = /** @type {any} */ (window["AMap"]);
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });

  renderAmapRangeCircle(AMap);

  gaodePOIs.forEach((poi, index) => {
    if (!poi.lng || !poi.lat) return;
    const isSelected = poi.poi_id === (appState.selectedPOI && appState.selectedPOI.poi_id);
    const matchScore = matchScoreMap[poi.poi_id];
    const isHot = poi.hot_score > 80;
    const sizeClass = poi.buddy_demand_count >= 7 ? "pin-lg" : poi.buddy_demand_count <= 3 ? "pin-sm" : "";
    const g = poiPhotoGradient(poi);
    const pinHTML = `
      <div class="map-pin pin-enter ${isHot ? "is-hot" : ""} ${isSelected ? "is-selected" : ""} ${sizeClass}"
           style="cursor:pointer;--pin-color:${g.accent};--pin-bg:${g.bg};--float-delay:${(index % 6) * 0.16}s"
           title="${escapeHTML(poi.name)}：${poi.buddy_demand_count} 人想约">
        ${sceneIcon(categoryAbbr(poi), g.accent, g.bg, "xs")}
        ${pinSummaryHTML(poi, matchScore)}
      </div>`;
    try {
      const marker = new AMap.Marker({
        position: new AMap.LngLat(poi.lng, poi.lat),
        content: pinHTML,
        anchor: "bottom-center",
        offset: new AMap.Pixel(0, 0),
        title: poi.name
      });
      marker.on("click", () => {
        appState.selectedPOI = poi;
        renderAmapPins();
        updatePOISheet();
        const sheet = document.getElementById("poiSheet");
        if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      amapInstance.add(marker);
    } catch (_) {}
  });
}

function renderAmapRangeCircle(AMap) {
  if (!amapInstance || !AMap) return;
  const circle = getCurrentCircle();
  const centerLng = circle.center_lng || -118.4452;
  const centerLat = circle.center_lat || 34.0629;
  const radiusKm = currentBrowseRadiusKm();
  try {
    const center = new AMap.LngLat(centerLng, centerLat);
    amapRangeCircle = new AMap.Circle({
      center,
      radius: radiusKm * 1000,
      strokeColor: "#2F7EF7",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      strokeStyle: "dashed",
      fillColor: "#2F7EF7",
      fillOpacity: 0.08,
      zIndex: 20
    });
    amapInstance.add(amapRangeCircle);
    amapInstance.add(new AMap.Marker({
      position: center,
      content: `<div class="amap-range-label">${radiusKm}km</div>`,
      anchor: "center",
      offset: new AMap.Pixel(0, -18)
    }));
  } catch (_) {}
}

function renderMockMapPins() {
  const layer = document.getElementById("mockMapPins");
  if (!layer) return;
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });
  const userPin = MAP_LAYOUT.user_pin || { x: 48, y: 54 };
  const selectedPoi = appState.selectedPOI;
  // SVG route connector from user pin to selected POI
  let routeSVG = "";
  if (selectedPoi) {
    const spx = selectedPoi.mapX != null ? selectedPoi.mapX : poiMapPercent(selectedPoi).x;
    const spy = selectedPoi.mapY != null ? selectedPoi.mapY : poiMapPercent(selectedPoi).y;
    const walkMin = Math.max(2, Math.round((selectedPoi.distance_km || 0.8) * 12));
    routeSVG = `
      <svg class="map-route-svg" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;">
        <line x1="${userPin.x}%" y1="${userPin.y}%" x2="${spx}%" y2="${spy}%"
          stroke="#FFE033" stroke-width="2.5" stroke-dasharray="6 4"
          stroke-linecap="round" opacity="0.85"/>
      </svg>
      <div class="map-route-dist" style="left:${(userPin.x + spx) / 2}%;top:${(userPin.y + spy) / 2}%;">步行约 ${walkMin} 分钟</div>
    `;
  }
  layer.innerHTML = routeSVG + gaodePOIs.map((poi, index) => {
    const isHot = isHotPoi(poi);
    const isSelected = poi.poi_id === (selectedPoi && selectedPoi.poi_id);
    const matchScore = matchScoreMap[poi.poi_id];
    const isAI = Boolean(matchScore);
    const sizeClass = isAI ? "pin-lg" : poi.buddy_demand_count >= 7 ? "pin-lg" : poi.buddy_demand_count <= 3 ? "pin-sm" : "";
    const x = poi.mapX != null ? poi.mapX : poiMapPercent(poi).x;
    const y = poi.mapY != null ? poi.mapY : poiMapPercent(poi).y;
    const g = poiPhotoGradient(poi);
    return `
      <button type="button" class="map-pin pin-enter ${isAI ? "is-ai" : isHot ? "is-hot" : ""} ${isSelected ? "is-selected" : ""} ${sizeClass}"
        data-poi-id="${poi.poi_id}" data-category="${poi.category}"
        style="left:${x}%;top:${y}%;--pin-color:${g.accent};--pin-bg:${g.bg};--float-delay:${(index % 6) * 0.16}s"
        title="${escapeHTML(poi.name)}：${poi.buddy_demand_count} 人想约${matchScore ? ` · AI ${matchScore}分` : ""}"
        aria-label="${escapeHTML(poi.name)}，${escapeHTML(poi.category)}，${poi.buddy_demand_count} 人想约">
        ${sceneIcon(categoryAbbr(poi), g.accent, g.bg, "xs")}
        ${pinSummaryHTML(poi, matchScore)}
      </button>
    `;
  }).join("");
  layer.querySelectorAll(".map-pin[data-poi-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poi = gaodePOIs.find((p) => p.poi_id === btn.dataset.poiId) || pois.find((p) => p.poi_id === btn.dataset.poiId);
      if (!poi) return;
      appState.selectedPOI = poi;
      renderMockMapPins();
      updatePOISheet();
      const sheet = document.getElementById("poiSheet");
      if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return [255, 107, 53];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

function heatWeightForPoi(poi) {
  const demand = Number(poi.buddy_demand_count || 0);
  const hot = Number(poi.hot_score || 0);
  const wait = Number(poi.wait_time_min || 0);
  const rating = Number(poi.rating || 4.4);
  const waitBonus = clampNumber(1 - wait / 38, 0, 1) * 2.4;
  const ratingBonus = clampNumber(rating - 4.2, 0, 0.8) * 2.2;
  return demand * 1.9 + hot / 12 + waitBonus + ratingBonus;
}

function poiDensityBoost(poi, poiList) {
  const a = poiMapPercent(poi);
  return poiList.reduce((sum, other) => {
    if (other.poi_id === poi.poi_id) return sum;
    const b = poiMapPercent(other);
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    return sum + clampNumber(1 - distance / 22, 0, 1);
  }, 0);
}

function drawHeatOnCanvas(canvasEl, poiList, slotMult) {
  const parent = canvasEl.parentElement;
  // offsetWidth/offsetHeight are reliable once the element is in the laid-out DOM
  const w = (parent && parent.offsetWidth > 0) ? parent.offsetWidth : canvasEl.offsetWidth;
  const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : canvasEl.offsetHeight;
  if (w < 10 || h < 10) return false; // not laid out yet

  const dpr = window.devicePixelRatio || 1;
  canvasEl.width = Math.round(w * dpr);
  canvasEl.height = Math.round(h * dpr);
  const ctx = canvasEl.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const weights = poiList.map((p) => heatWeightForPoi(p));
  const maxW = Math.max(...weights, 1);
  const isMini = h <= 150;

  poiList.forEach((poi, i) => {
    const density = poiDensityBoost(poi, poiList);
    const isHot = isHotPoi(poi);
    // Hot POIs get boosted intensity to create concentrated "hot zones"
    const hotBoost = isHot ? 1.32 : 0.72;
    const intensity = clampNumber((weights[i] / maxW) * (0.78 + density * 0.08) * slotMult * hotBoost, 0, 1);
    if (intensity < 0.08) return; // cut weak glows earlier so non-hot zones stay dim
    const x = (poiMapPercent(poi).x / 100) * w;
    const y = (poiMapPercent(poi).y / 100) * h;
    // Hot POIs have larger radius; normal POIs are smaller to avoid uniform glow
    const baseRadius = isMini ? 13 : (isHot ? 32 : 18);
    const radius = baseRadius + intensity * (isMini ? 28 : (isHot ? 72 : 44));
    const [r, g, b] = hexToRgb(poiPhotoGradient(poi).accent);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const a = (isMini ? 0.12 : 0.10) + intensity * (isMini ? 0.36 : (isHot ? 0.48 : 0.30));
    grad.addColorStop(0,    `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`);
    grad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${(a * 0.54).toFixed(3)})`);
    grad.addColorStop(0.70, `rgba(255, 190, 64, ${(a * 0.18).toFixed(3)})`);
    grad.addColorStop(1,    "rgba(255, 190, 64, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  return true;
}

function renderHeatCanvas(attempt) {
  const canvas = document.getElementById("heatCanvas");
  if (!canvas) return;
  const list = gaodePOIs.length ? gaodePOIs : pois;
  const slotMult = appState.circleTimeSlot === "weekend" ? 0.45
                 : appState.circleTimeSlot === "tonight" ? 0.72 : 1.0;
  const ok = drawHeatOnCanvas(canvas, list, slotMult);
  if (!ok && (attempt || 0) < 12) {
    setTimeout(() => renderHeatCanvas((attempt || 0) + 1), 100);
  }
}

function showPoiNavHint(poi) {
  showToast(`${poi.name} · 步行约 ${Math.round((poi.distance_km || 0.8) * 12)} 分钟`);
}


function updateMapStats() {
  const el = document.getElementById("mapStatsBar");
  if (!el) return;
  const list = gaodePOIs.length ? gaodePOIs : pois;
  const totalBuddy = list.reduce((sum, p) => sum + (p.buddy_demand_count || 0), 0);
  const formingCount = list.reduce((sum, p) => sum + Math.max(0, Math.round((p.buddy_demand_count || 0) / 4)), 0);
  const hotCount = list.filter((p) => isHotPoi(p)).length;
  const radiusKm = currentBrowseRadiusKm();
  el.innerHTML = `
    <div class="stat-pill is-brand"><b>${radiusKm}km</b><span>搜索范围</span></div>
    <div class="stat-pill"><b>${list.length}</b><span>附近地点</span></div>
    <div class="stat-pill is-hot"><b>${totalBuddy}</b><span>人今日想出门</span></div>
    <div class="stat-pill" style="background:#fffdf0;border:1px solid #ffe88a;"><b style="color:#92700a;">${formingCount}</b><span>个即将成局</span></div>
    <div class="stat-pill"><b>${hotCount}</b><span>热门地点</span></div>
  `;
  updateAreaPill();
}

function updateSceneNavigator() {
  const el = document.getElementById("filterTabsRow");
  if (!el) return;
  el.innerHTML = "";
  el.hidden = true;
}

function poiPhotoGradient(poi) {
  const palettes = {
    餐厅: ["#FFF4ED", "#FF6B35"],
    KTV: ["#F5F0FF", "#8B5CF6"],
    酒吧: ["#FFF0F0", "#FF2442"],
    咖啡: ["#FFF8ED", "#D97706"],
    夜宵: ["#EFF5FF", "#2F7EF7"],
    桌游: ["#ECFAF3", "#22A06B"],
    攀岩: ["#FFF4ED", "#EA580C"],
    骑行: ["#EFF5FF", "#2563EB"]
  };
  const [bg, accent] = palettes[poi.category] || palettes["餐厅"];
  return { bg, accent };
}

function updatePOISheet() {
  const el = document.getElementById("poiSheet");
  if (!el) return;
  if (!appState.selectedPOI) {
    el.innerHTML = `
      <div class="map-merchant-body">
        <section class="map-merchant-section">
          <div class="map-merchant-section-head">
            <h3>暂无匹配地点</h3>
            <span>${escapeHTML(sceneFilterLabel())}</span>
          </div>
          <p>当前生活圈和类型下没有可显示的商家，去发现里换个圈子或类型。</p>
        </section>
      </div>
    `;
    return;
  }
  const poi = appState.selectedPOI;
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });
  const matchScore = matchScoreMap[poi.poi_id];
  const demands = getFakeDemands(poi);
  const visibleDemands = demands.slice(0, 2);
  const fit = merchantFitSummary(poi);
  const walkMin = Math.max(3, Math.round(Number(poi.distance_km || 0.8) * 12));
  const dealText = merchantDealShort(poi);
  el.innerHTML = `
    <div class="merchant-hero" style="background-image:url('${poiCoverImage(poi)}')"></div>
    <div class="merchant-detail-body map-merchant-body">
      <div class="map-merchant-title">
        <div>
          <h2 class="merchant-name">${escapeHTML(poi.name)}</h2>
          <p>${poi.rating} ★ · ${escapeHTML(poi.sub_category)} · 人均 <b>¥${poi.avg_price}</b> · ${poi.distance_km}km</p>
        </div>
        <span class="open-badge">${escapeHTML(poi.open_status || "营业中")}</span>
      </div>
      <div class="map-merchant-meta">
        <span>等待 ${poi.wait_time_min} 分钟</span>
        <span>步行约 ${walkMin} 分钟</span>
        <span>${poi.business_hours ? `营业 ${escapeHTML(poi.business_hours)}` : "营业时间待确认"}</span>
      </div>

      <div class="map-merchant-brief-grid">
        <div><b>${poi.rating}</b><span>评分</span></div>
        <div><b>${poi.wait_time_min} 分钟</b><span>${merchantWaitLabel(poi)}</span></div>
        <div><b>${walkMin} 分钟</b><span>步行约</span></div>
        <div><b>${poi.buddy_demand_count} 人</b><span>最近想约</span></div>
      </div>

      ${(() => {
        const opp = opportunitySummaryForPoi(poi);
        const formingLabel = opp.formingCount >= 2 ? `${opp.formingCount} 个即将成局` : "随时可加入";
        return `
          <div class="map-opportunity-card">
            <p style="font-size:11px;font-weight:700;color:#92700a;margin-bottom:8px;">这里为什么容易成局</p>
            <div class="map-opportunity-grid">
              <div><b>${opp.demandCount}</b><span>人最近想约</span></div>
              <div><b>${formingLabel}</b><span>成局进度</span></div>
              <div><b>${opp.waitLabel}</b><span>当前等待</span></div>
              <div><b>${opp.savedLabel}</b><span>团购优惠</span></div>
            </div>
          </div>
        `;
      })()}

      <section class="map-merchant-section">
        <div class="map-merchant-section-head">
          <h3>适合这样约</h3>
          ${matchScore ? `<span class="sheet-match">AI ${matchScore}%</span>` : `<span>${escapeHTML(poi.category)}</span>`}
        </div>
        <b>${escapeHTML(fit.title)}</b>
        <p>${escapeHTML(fit.text)}</p>
        <div class="map-merchant-chip-row">
          ${fit.chips.slice(0, 3).map((chip) => `<span>${escapeHTML(chip)}</span>`).join("")}
        </div>
      </section>

      <section class="map-merchant-deal-card">
        <span class="deal-tag">团</span>
        <div>
          <b>${escapeHTML(dealText)}</b>
          <p>到店前先看券，预算更好对齐。</p>
        </div>
        <strong>看券</strong>
      </section>

      <section class="map-merchant-section map-merchant-live">
        <div class="map-merchant-section-head">
          <h3>现在有人想去</h3>
          <span>此刻</span>
        </div>
        ${visibleDemands.map((d) => demandCardHTML(d, appState.selectedDemandId === d.demand_id)).join("")
          || `<p class="empty">这个地点暂无等待中的局，可以直接发起一个。</p>`}
      </section>

      <div class="map-merchant-info-line">
        <span>${escapeHTML(poi.address || `${areaShort || area} · ${poi.sub_category}`)}</span>
      </div>

      <div class="map-merchant-actions">
        <button class="cta-match-btn map-agent-main" id="matchFromPoi">让 Agent 安排</button>
        <button type="button" class="cta-nav-btn" id="poiJoinBtn">加入这个局</button>
        <button type="button" class="cta-nav-btn" id="poiNavBtn">我也想去</button>
      </div>
    </div>
  `;
  document.getElementById("matchFromPoi").addEventListener("click", () => {
    appState.userInput = defaultIntentTextForPoi(poi);
    appState.poiConstraint = poi;
    appState.currentPage = "ai";
    appState.parsedIntent = null;
    appState.matchResults = [];
    appState.aiHasRun = false;
    showToast("已将该地点加入匹配条件");
    render();
    setTimeout(() => runAI(), 450);
  });
  document.getElementById("poiNavBtn")?.addEventListener("click", () => showPoiNavHint(poi));
  document.getElementById("poiJoinBtn")?.addEventListener("click", () => {
    const d = demands[0];
    if (d) joinDemandFromMapSheet(d.demand_id);
    else showToast("暂无等待中的局，已为你发起搭子匹配");
  });
  const joinDemandFromMapSheet = (demandId) => {
    const targetDemand = demands.find((d) => d.demand_id === demandId) || demands.find((d) => d.demand_id === appState.selectedDemandId) || demands[0];
    if (!targetDemand) return;
    const intent = {
      activity_type: categoryToActivity(poi),
      category_preference: poi.sub_category,
      budget_min: Math.floor(poi.avg_price * 0.8),
      budget_max: poi.avg_price,
      social_style: targetDemand.style,
      group_size: targetDemand.size,
      target_time: "今晚",
      distance_tolerance_km: 2
    };
    selectMatch({ match_id: `joined_${targetDemand.demand_id}`, user: targetDemand.demandUser, poi, total_score: 85, user_score: 83, place_score: 87, score_breakdown: {}, suggested_time: targetDemand.time, backup_poi: findDealBackup(poi), explanation: `你加入了 ${targetDemand.nickname} 在 ${poi.name} 发起的搭子局。`, intent });
  };
  el.querySelectorAll(".map-demand-row[data-demand]").forEach((card) => {
    card.addEventListener("click", () => {
      appState.selectedDemandId = card.dataset.demand;
      joinDemandFromMapSheet(card.dataset.demand);
    });
  });
}

function opportunitySummaryForPoi(poi) {
  const deal = getDeal(poi.poi_id);
  const saved = deal ? Math.max(0, deal.original_price - deal.discount_price) : 0;
  const formingCount = Math.max(1, Math.round((poi.buddy_demand_count || 0) / 4));
  return {
    demandCount: poi.buddy_demand_count || 0,
    formingCount,
    waitLabel: `${poi.wait_time_min} 分钟`,
    savedLabel: saved > 0 ? `省 ¥${saved}` : `¥${poi.avg_price} 均价`
  };
}

function demandCardHTML(demand, isSelected) {
  const user = demand.demandUser || {};
  const verified = user.verified_status;
  return `
    <button type="button" class="map-demand-row ${isSelected ? "is-selected" : ""}" data-demand="${demand.demand_id}">
      <div class="map-demand-avatar">${escapeHTML(String(demand.nickname || "搭")[0])}</div>
      <div class="map-demand-body">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          <b style="font-size:13px;">${escapeHTML(demand.time || "今晚")}</b>
          ${verified ? `<span class="verified-badge">已验证</span>` : ""}
          <span style="font-size:11px;color:#6b7280;">${escapeHTML(demand.size || "1v1")}</span>
        </div>
        <p style="font-size:12px;color:#6b7280;margin-top:1px;">${escapeHTML(demand.note || demand.style || "轻松组局")}</p>
      </div>
      <span class="map-demand-join">加入</span>
    </button>
  `;
}

function getFakeDemands(poi) {
  const real = buddyDemands
    .filter((d) => d.poi_id === poi.poi_id)
    .slice(0, 3)
    .map((d) => {
      const demandUser = users.find((u) => u.user_id === d.user_id) || users[0];
      return {
        demand_id: d.demand_id,
        poi_id: poi.poi_id,
        nickname: demandUser.nickname,
        demandUser,
        time: d.target_time,
        style: d.social_style,
        size: d.group_size,
        note: `${d.activity_type} · ¥${d.budget_max} 以内`
      };
    });
  if (real.length) return real;

  const count = Math.min(poi.buddy_demand_count, 3);
  const seed = parseInt(poi.poi_id.replace(/\D/g, "")) || 1;
  const activity = categoryToActivity(poi);
  const templates = activity === "攀岩搭子"
    ? [
        { time: "周末 10:30", style: "低压力社交", size: "1v1", note: "抱石新手，装备可租" },
        { time: "周六 14:00", style: "多人热闹", size: "小组", note: "顶绳区组队" }
      ]
    : activity === "骑行搭子"
      ? [
          { time: "周末 15:00", style: "轻松聊天", size: "小组", note: "休闲骑，节奏别太快" },
          { time: "今晚 21:00", style: "认识新朋友", size: "小组", note: "夜骑 8km" }
        ]
      : /桌游|跑团|RPG/.test(activity)
        ? [
            { time: "今晚 20:00", style: "轻松聊天", size: "小组", note: "桌游局，欢迎新手" },
            { time: "周六 19:00", style: "多人热闹", size: "小组", note: "跑团/RPG 缺 1 人" }
          ]
        : [
            { time: "今晚 18:30", style: "轻松聊天", size: "1v1", note: "聊聊天，别太社交" },
            { time: "今晚 19:00", style: "低压力社交", size: "1v1", note: "想试试这家，一起去吗" },
            { time: "今晚 20:00", style: "多人热闹", size: "3-5人", note: "找几个人一起，气氛好就行" }
          ];
  return templates.slice(0, count).map((t, i) => {
    const userIndex = (seed * 3 + i * 11) % users.length;
    const demandUser = users[userIndex];
    return {
      demand_id: `d_${poi.poi_id}_${i}`,
      poi_id: poi.poi_id,
      nickname: demandUser.nickname,
      demandUser,
      ...t
    };
  });
}

function categoryToScene(category, subCategory, tags) {
  return categoryToActivity({ category, sub_category: subCategory || "", tags: tags || [] });
}

function analyzeMoodNLP(input) {
  const text = String(input || "").trim();
  const lower = text.toLowerCase();
  const mood = {
    mood_label: "需求明确",
    user_state: "想把出门计划快速落地",
    energy: "中",
    social_style: "轻松聊天",
    activity_strategy: "优先选择近距离、低等待、预算明确的方案",
    recommended_activity: "",
    recommended_category: "",
    confidence: 0.62,
    score_basis: "预算、距离、时间、对方风格和商户等待综合评分"
  };

  if (/心情不好|不开心|难过|emo|烦|低落|有点崩|郁闷|失落|不顺|压力大|累|焦虑|烦躁/.test(text)) {
    mood.mood_label = /压力大|焦虑|烦躁|累/.test(text) ? "压力偏高" : "心情低落";
    mood.user_state = "需要低压力陪伴，不适合强社交和长等待";
    mood.energy = "低";
    mood.social_style = /不想说话|安静/.test(text) ? "安静陪伴" : "低压力社交";
    mood.activity_strategy = "安排近一点、能坐下、等待短的咖啡或轻食，先降低出门门槛";
    mood.recommended_activity = "咖啡搭子";
    mood.recommended_category = "咖啡";
    mood.confidence = 0.88;
    mood.score_basis = "情绪低落时降低社交强度，优先看距离、等待和对方是否愿意轻松陪伴";
  }

  if (/想发泄|释放|运动|出汗|憋|闷/.test(text)) {
    mood.mood_label = "想释放压力";
    mood.user_state = "需要有身体参与的活动，但节奏不能太硬";
    mood.energy = "中高";
    mood.social_style = "低压力社交";
    mood.activity_strategy = "优先推荐攀岩或休闲骑行，匹配新手友好和装备可租的地点";
    mood.recommended_activity = /骑/.test(text) ? "骑行搭子" : "攀岩搭子";
    mood.recommended_category = /骑/.test(text) ? "休闲骑行" : "抱石";
    mood.confidence = 0.84;
    mood.score_basis = "把负面情绪转成可执行活动，兼顾安全、距离和新手友好";
  }

  if (/孤单|一个人|没人陪|想找人|想有人/.test(text) && !mood.recommended_activity) {
    mood.mood_label = "想有人陪";
    mood.user_state = "需要自然见面，不想进入尴尬聊天";
    mood.social_style = "轻松聊天";
    mood.activity_strategy = "优先安排 1v1 饭搭子或咖啡搭子，选择可快速到店的地点";
    mood.recommended_activity = /吃|饭|饿/.test(text) ? "饭搭子" : "咖啡搭子";
    mood.recommended_category = /吃|饭|饿/.test(text) ? "韩餐" : "咖啡";
    mood.confidence = 0.78;
  }

  if (/热闹|多人|组局|嗨|唱歌|桌游/.test(text)) {
    mood.mood_label = "想热闹一点";
    mood.user_state = "可以接受多人互动";
    mood.energy = "高";
    mood.social_style = "多人热闹";
    mood.activity_strategy = "优先安排 KTV、桌游或夜宵小组，保证人数和时段明确";
    mood.recommended_activity = /唱|KTV|ktv/.test(lower) ? "KTV搭子" : /桌游|狼人|阿瓦隆/.test(text) ? "聚会桌游搭子" : "夜宵搭子";
    mood.recommended_category = /唱|KTV|ktv/.test(lower) ? "KTV" : /桌游|狼人|阿瓦隆/.test(text) ? "聚会桌游" : "夜宵";
    mood.confidence = 0.82;
  }

  return mood;
}

function inputHasExplicitActivity(input) {
  return /KTV|ktv|唱歌|K歌|酒吧|小酌|喝酒|咖啡|学习|夜宵|烧烤|跑团|TRPG|克苏鲁|桌游|狼人|阿瓦隆|攀岩|抱石|骑行|火锅|韩餐|韩国|日料|寿司|拉面|饭|吃/.test(String(input || ""));
}

function applyMoodIntentPatch(intent, mood, input) {
  const next = { ...(intent || {}) };
  if (!mood) return next;

  const shouldPatchActivity = mood.confidence >= 0.76 && !inputHasExplicitActivity(input);
  if (shouldPatchActivity && mood.recommended_activity) {
    next.activity_type = mood.recommended_activity;
    next.category_preference = mood.recommended_category;
    next.group_size = mood.energy === "高" ? "小组" : "1v1";
    next.social_style = mood.social_style;
    next.budget_min = Math.min(next.budget_min || 20, mood.recommended_category === "咖啡" ? 20 : 40);
    next.budget_max = mood.recommended_category === "咖啡" ? 45 : Math.max(next.budget_max || 80, 80);
    next.distance_tolerance_km = Math.min(next.distance_tolerance_km || 2, 2);
    next.target_time = /今天|现在|马上/.test(input) ? "现在" : next.target_time || "今晚";
    next.interest_labels = [...new Set([next.category_preference, next.social_style, next.activity_type, next.target_time].filter(Boolean))];
    next.parse_layer = "emotion_enriched";
    next.parse_confidence = Math.max(next.parse_confidence || 0.7, mood.confidence);
  } else if (mood.confidence >= 0.76) {
    next.social_style = /安静|不想说话/.test(input) ? "安静陪伴" : next.social_style;
    next.parse_layer = next.parse_layer === "agent_enriched" ? next.parse_layer : "emotion_aware";
    next.parse_confidence = Math.max(next.parse_confidence || 0.7, Math.min(0.92, mood.confidence));
  }
  return next;
}

async function runAI() {
  if (appState.aiLoading) return;
  if (!parseIntent || !runMatching) {
    showToast("匹配模块未加载，请刷新页面");
    return;
  }
  appState.aiLoading = true;
  appState.aiHasRun = true;
  appState.parsedIntent = null;
  appState.matchResults = [];
  appState.replanningNotice = "";
  appState.aiDirector = null;
  appState.aiMoodProfile = null;
  appState.aiAgentError = "";
  appState.aiRuleFallback = false;
  try {
    for (let step = 0; step < 4; step += 1) {
      appState.aiStep = step;
      render();
      await sleep(460 + step * 80);
    }
    appState.aiMoodProfile = analyzeMoodNLP(appState.userInput);
    appState.parsedIntent = applyMoodIntentPatch(parseIntent(appState.userInput), appState.aiMoodProfile, appState.userInput);
    rerunMatching();
    const { availablePOIs } = getMatchSupply();
    await enrichWithAIDirector(availablePOIs);
    if (!appState.matchResults.length) {
      showToast("暂无匹配结果，试试放宽预算或换场景");
    }
  } catch (error) {
    console.error("[runAI]", error);
    appState.aiAgentError = error.message || "匹配过程出错";
    appState.aiRuleFallback = true;
    if (!appState.aiMoodProfile) appState.aiMoodProfile = analyzeMoodNLP(appState.userInput || "");
    if (!appState.parsedIntent) {
      appState.parsedIntent = applyMoodIntentPatch(parseIntent(appState.userInput || ""), appState.aiMoodProfile, appState.userInput || "");
    }
    if (!appState.matchResults.length) rerunMatching();
    showToast("匹配遇到问题，请重试");
  } finally {
    appState.aiLoading = false;
    appState.aiStep = -1;
    render();
  }
}

function buildRuleOnlyDirectorFallback() {
  const intent = appState.parsedIntent || {};
  const mood = appState.aiMoodProfile || {};
  const top = appState.matchResults[0];
  return {
    director_brief: top
      ? `已为你找到 ${appState.matchResults.length} 个方案，首选「${top.poi.name}」，预计等待 ${top.poi.wait_time_min} 分钟，综合评分 ${top.total_score}%。`
      : "已分析你的需求，正在优化方案组合。",
    clarifying_questions: (intent.parse_confidence || 1) < 0.55
      ? ["预算大概多少？", "更想 1v1 还是小组？"]
      : [],
    plan_overrides: appState.matchResults.slice(0, 3).map((match, plan_index) => ({
      plan_index,
      match_id: match.match_id,
      headline: `与 ${match.user.nickname} · ${match.poi.name}`,
      explanation: match.explanation,
      closing_line: "推荐此方案",
      risk: "",
      conversion_prompt: match.poi.deal_text || "查看团购",
      score_reason: "综合评分"
    })),
    agent_profile: {
      mood_label: mood.mood_label || intent.social_style || "需求明确",
      user_state: mood.user_state || "已识别你的出行状态",
      activity_strategy: `优先匹配${intent.activity_type || "附近活动"}，结合预算与距离综合排序`,
      confidence: intent.parse_confidence || 0.84,
      score_basis: "已完成意图分析与搭子评分"
    },
    merchant_layer: {
      summary: top ? `找到 ${appState.matchResults.length} 个高匹配方案` : "方案生成中",
      freshness_label: "实时匹配"
    },
    demo_hooks: []
  };
}

function buildAIDirectorPayload(availablePOIs) {
  return {
    area,
    user_input: appState.userInput,
    parsed_intent: appState.parsedIntent,
    mood_profile: appState.aiMoodProfile,
    sparse_mode: appState.sparseMode,
    merchant_candidates: availablePOIs.slice(0, 12).map((poi) => ({
      poi_id: poi.poi_id,
      name: poi.name,
      category: poi.category,
      sub_category: poi.sub_category,
      avg_price: poi.avg_price,
      rating: poi.rating,
      wait_time_min: poi.wait_time_min,
      buddy_demand_count: poi.buddy_demand_count,
      hot_score: poi.hot_score,
      distance_km: poi.distance_km,
      tags: poi.tags,
      deal_text: poi.deal_text,
      venue_extra: poi.venue_extra || null
    })),
    local_plans: appState.matchResults.slice(0, 3).map((match, index) => ({
      plan_index: index,
      match_id: match.match_id,
      total_score: match.total_score,
      suggested_time: match.suggested_time,
      user: {
        user_id: match.user.user_id,
        nickname: match.user.nickname,
        social_style: match.user.social_style,
        budget_min: match.user.budget_min,
        budget_max: match.user.budget_max,
        distance_km: match.user.distance_km,
        interest_labels: match.user.interest_labels
      },
      poi: {
        poi_id: match.poi.poi_id,
        name: match.poi.name,
        category: match.poi.category,
        sub_category: match.poi.sub_category,
        avg_price: match.poi.avg_price,
        rating: match.poi.rating,
        wait_time_min: match.poi.wait_time_min,
        deal_text: match.poi.deal_text
      },
      backup_poi: match.backup_poi ? {
        poi_id: match.backup_poi.poi_id,
        name: match.backup_poi.name,
        wait_time_min: match.backup_poi.wait_time_min
      } : null,
      local_explanation: match.explanation,
      score_breakdown: match.score_breakdown
    }))
  };
}

async function requestAIDirector(payload) {
  const { response, data } = await postJSONWithFallback("/api/ai-match", payload, {
    timeoutMs: 12000,
    timeoutMessage: "AI 请求超时（12s），已切换规则层"
  });
  if (!response.ok || data.fallback) {
    throw new Error(data.error || `AI agent failed with ${response.status}`);
  }
  appState.aiProvider = data.provider || "";
  appState.aiRuleFallback = false;
  return data;
}

function applyDirectorPlanOverrides(director) {
  const overrides = Array.isArray(director?.plan_overrides) ? director.plan_overrides : [];
  if (!overrides.length || !appState.matchResults.length) return;

  const sortedOverrides = overrides.slice().sort((a, b) => (a.plan_index ?? 99) - (b.plan_index ?? 99));
  const ordered = [];
  const used = new Set();

  sortedOverrides.forEach((override) => {
    const match =
      appState.matchResults.find((item) => item.match_id === override.match_id) ||
      appState.matchResults[override.plan_index];
    if (!match || used.has(match.match_id)) return;
    used.add(match.match_id);
    ordered.push({
      ...match,
      ai_director: override,
      explanation: override.explanation || match.explanation
    });
  });

  appState.matchResults.forEach((match) => {
    if (!used.has(match.match_id)) ordered.push(match);
  });

  if (ordered.length) appState.matchResults = ordered.slice(0, 3);
  appState.generatedPlan = appState.matchResults[0] || null;
}

async function enrichWithAIDirector(availablePOIs, options = {}) {
  if (!appState.matchResults.length && !options.allowEmpty) return null;
  const payload = {
    ...buildAIDirectorPayload(availablePOIs),
    intervention: options.intervention || null,
    intervention_context: options.interventionContext || null
  };
  try {
    const director = await requestAIDirector(payload);
    appState.aiDirector = director;
    appState.aiProvider = director.provider || appState.aiProvider || "";
    if (director.agent_profile) {
      appState.aiMoodProfile = { ...(appState.aiMoodProfile || {}), ...director.agent_profile };
    }
    if (director.intent_patch && !options.skipIntentPatch) {
      appState.parsedIntent = {
        ...appState.parsedIntent,
        ...director.intent_patch,
        parse_layer: "agent_enriched",
        parse_confidence: director.intent_patch.confidence ?? appState.parsedIntent.parse_confidence
      };
      rerunMatching();
    }
    applyDirectorPlanOverrides(director);
    return director;
  } catch (error) {
    console.warn("[ai-agent-fallback]", error);
    appState.aiAgentError = error.message || "AI agent unavailable";
    appState.aiRuleFallback = true;
    appState.aiDirector = buildRuleOnlyDirectorFallback();
    applyDirectorPlanOverrides(appState.aiDirector);
    return appState.aiDirector;
  }
}

async function directorChatIntervention(intervention, interventionContext) {
  const { availablePOIs } = getMatchSupply();
  const director = await enrichWithAIDirector(availablePOIs, {
    intervention,
    interventionContext,
    skipIntentPatch: true,
    toastOnError: false
  });
  if (!director || !appState.chatThread) return null;
  const line = director.director_brief || (director.plan_overrides?.[0]?.explanation) || null;
  if (!line) return null;
  appState.chatThread.messages.push({
    sender: "ai",
    text: `AI 成局导演：${line}`,
    timestamp: nowTime()
  });
  return director;
}

function buildChatReplyPayload(messageText) {
  const match = appState.selectedMatch || {};
  return {
    message: messageText,
    mode: "matched_user_demo",
    plan_status: appState.planStatus,
    match: match.match_id ? {
      match_id: match.match_id,
      suggested_time: match.suggested_time,
      user: {
        nickname: match.user?.nickname,
        social_style: match.user?.social_style,
        budget_min: match.user?.budget_min,
        budget_max: match.user?.budget_max
      },
      poi: {
        name: match.poi?.name,
        category: match.poi?.category,
        sub_category: match.poi?.sub_category,
        avg_price: match.poi?.avg_price,
        wait_time_min: match.poi?.wait_time_min,
        distance_km: match.poi?.distance_km,
        deal_text: match.poi?.deal_text
      },
      intent: match.intent
    } : null,
    chat_history: (appState.chatThread?.messages || [])
      .slice(-8)
      .filter((item) => !item.pending)
      .map((item) => ({
        sender: item.sender,
        text: item.text,
        timestamp: item.timestamp
      }))
  };
}

async function requestAIChatReply(messageText) {
  const { response, data } = await postJSONWithFallback("/api/chat-reply", buildChatReplyPayload(messageText), {
    timeoutMs: 10000,
    timeoutMessage: "对方回复超时"
  });
  if (!response.ok || data.fallback) throw new Error(data.error || "对方回复接口不可用");
  appState.aiProvider = data.provider || appState.aiProvider || "";
  return String(data.reply || "").trim();
}

function buildLocalPeerReply(messageText) {
  const text = String(messageText || "");
  const match = appState.selectedMatch || {};
  const poiName = match.poi?.name || "这家店";
  if (/确认|可以|行|ok|OK|没问题|就这个|定/.test(text)) return `可以，就按 ${match.suggested_time || "这个时间"} 定吧。`;
  if (/换|别的|另一家|这家不/.test(text)) return "可以，你发候选我看一下。";
  if (/晚|迟|改时间|时间/.test(text)) return "可以，晚一点我也能到。";
  if (/预算|贵|便宜|钱|人均/.test(text)) return "可以，预算控制一下就行。";
  if (/排队|等|人多/.test(text)) return "那先看等待，太久就换附近的。";
  if (/到了|出发|路上/.test(text)) return "收到，我也准备出发。";
  return `${poiName} 我可以，时间你定。`;
}

async function appendAIPeerReply(messageText) {
  if (!appState.chatThread || !appState.selectedMatch || appState.chatReplyLoading) return;
  const pendingId = `pending_${Date.now()}`;
  appState.chatReplyLoading = true;
  appState.chatThread.messages.push({ id: pendingId, sender: "matched_user", text: "正在输入...", timestamp: nowTime(), pending: true });
  render();
  let reply = "";
  try {
    reply = await requestAIChatReply(messageText);
  } catch (error) {
    console.warn("[chat-reply-fallback]", error);
    reply = buildLocalPeerReply(messageText);
  }
  appState.chatThread.messages = appState.chatThread.messages.filter((item) => item.id !== pendingId);
  appState.chatThread.messages.push({ sender: "matched_user", text: reply || buildLocalPeerReply(messageText), timestamp: nowTime() });
  appState.chatReplyLoading = false;
  render();
}

function buildLocalGCReply(gc, messageText) {
  const text = String(messageText || "");
  const poiName = gc?.poi?.name || "这家";
  if (/到了|到门口|在外面/.test(text)) return "来了，稍等我一下。";
  if (/路上|出发|快到/.test(text)) return "好，我也快到了。";
  if (/等|排队|几号/.test(text)) return "叫的号，等一下吧。";
  if (/点什么|吃什么|推荐|菜/.test(text)) return `${poiName} 这里招牌不错，你看看。`;
  if (/收到|ok|好的|嗯/.test(text)) return "嗯，我看着呢。";
  if (/怎么走|导航|路线/.test(text)) return "直接导航过来就行，不远。";
  return "收到，马上过去！";
}

async function appendGCPeerReply(gc, messageText) {
  if (!gc || gc._replyLoading) return;
  const pendingId = `gcpending_${Date.now()}`;
  gc._replyLoading = true;
  const peerNickname = gc.members.find((m) => !m.isMe)?.nickname || "搭子";
  gc.messages.push({ id: pendingId, sender: "matched_user", text: "正在输入...", timestamp: nowTime(), pending: true, _peerName: peerNickname });
  render();
  let reply = "";
  try {
    const payload = {
      message: messageText,
      mode: "group_chat_post_success",
      gc_context: {
        name: gc.name,
        poi: { name: gc.poi?.name, category: gc.poi?.category, sub_category: gc.poi?.sub_category, avg_price: gc.poi?.avg_price },
        suggested_time: gc.suggested_time,
        peer_nickname: peerNickname
      },
      chat_history: gc.messages.slice(-8).filter((m) => !m.pending).map((m) => ({ sender: m.sender, text: m.text, timestamp: m.timestamp }))
    };
    const { response, data } = await postJSONWithFallback("/api/chat-reply", payload, { timeoutMs: 10000 });
    if (response.ok && !data.fallback && data.reply) {
      reply = String(data.reply).trim();
    } else {
      reply = buildLocalGCReply(gc, messageText);
    }
  } catch (_err) {
    reply = buildLocalGCReply(gc, messageText);
  }
  gc.messages = gc.messages.filter((m) => m.id !== pendingId);
  gc.messages.push({ sender: "matched_user", text: reply, timestamp: nowTime() });
  gc._replyLoading = false;
  render();
}

function renderAgentMemoryCard() {
  const mem = appState.agentMemory;
  if (!mem) return "";
  const notice = appState.agentMemoryNotice;
  const rows = [
    ["常去场景", mem.preferred_scenes.join(" / ")],
    ["默认预算", `¥${mem.default_budget_range[0]}–${mem.default_budget_range[1]}`],
    ["距离偏好", `${mem.distance_preference_km}km 内`],
    ["社交偏好", mem.social_preference],
    ["避开条件", mem.avoid_conditions.join("、")],
    ["团购偏好", mem.deal_preference]
  ];
  return `
    <section class="card agent-memory-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div>
          <p class="eyebrow">你的专属 Agent 记忆</p>
          <p style="font-size:12px;color:#6b7280;margin-top:2px;">从浏览、收藏、历史成局和反馈中学到</p>
        </div>
        <div class="agent-memory-dot"></div>
      </div>
      <div class="agent-memory-grid">
        ${rows.map(([label, val]) => `
          <div class="agent-memory-row">
            <span class="agent-memory-label">${label}</span>
            <span class="agent-memory-val">${escapeHTML(val)}</span>
          </div>
        `).join("")}
      </div>
      <div style="margin-top:10px;">
        <p style="font-size:11px;color:#9ca3af;margin-bottom:6px;">来自历史行为</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${(mem.learned_from.accepted_plans || []).map((p) => `<span class="memory-chip accepted">${escapeHTML(p)}</span>`).join("")}
          ${(mem.learned_from.rejected_reasons || []).map((r) => `<span class="memory-chip rejected">✗ ${escapeHTML(r)}</span>`).join("")}
        </div>
      </div>
      ${notice ? `<div class="agent-memory-notice result-fade">${escapeHTML(notice)}</div>` : ""}
    </section>
  `;
}

function personalizedReasonLines(match) {
  const mem = appState.agentMemory;
  if (!mem) return [];
  const lines = [];
  const dist = match.poi.distance_km;
  const wait = match.poi.wait_time_min;
  const cat = match.poi.sub_category || match.poi.category;
  const pricing = computeDealPricing(match);
  if (dist <= mem.distance_preference_km) {
    lines.push(`距离 ${dist}km，符合你常选的 ${mem.distance_preference_km}km 内偏好`);
  }
  const avoidWait = mem.avoid_conditions.find((c) => /等待/.test(c));
  const waitLimit = avoidWait ? parseInt(avoidWait) : 15;
  if (wait < waitLimit) {
    lines.push(`等待 ${wait} 分钟，低于你不喜欢的 ${waitLimit} 分钟门槛`);
  }
  if (mem.preferred_scenes.some((s) => cat.includes(s) || s.includes(cat))) {
    lines.push(`${cat} 是你常去的场景之一`);
  }
  if (pricing.fits) {
    lines.push(`券后约 ¥${pricing.perPerson}/人，在你的默认预算 ¥${mem.default_budget_range[0]}–${mem.default_budget_range[1]} 内`);
  }
  const avoidNoisy = mem.avoid_conditions.find((c) => /多人/.test(c));
  if (avoidNoisy && /1v1/.test(match.intent.group_size)) {
    lines.push("1v1 模式，避开了你不喜欢的多人拼桌场景");
  }
  return lines.slice(0, 4);
}

function applyAgentFeedback(type, match) {
  const mem = appState.agentMemory;
  if (!mem) return;
  const cat = match?.poi?.sub_category || match?.poi?.category || "";
  let notice = "";
  if (type === "like") {
    if (cat && !mem.preferred_scenes.includes(cat)) mem.preferred_scenes.push(cat);
    if (match?.poi?.name && !mem.learned_from.accepted_plans.includes(match.poi.name)) {
      mem.learned_from.accepted_plans.push(match.poi.name);
    }
    notice = `Agent 已记住：你喜欢这类 ${cat || "场景"}，以后会优先推荐。`;
  } else if (type === "too_far") {
    mem.distance_preference_km = Math.max(0.5, mem.distance_preference_km - 0.3);
    notice = `Agent 已更新：距离偏好缩小至 ${mem.distance_preference_km.toFixed(1)}km，下次会过滤更远的地点。`;
  } else if (type === "too_noisy") {
    if (!mem.avoid_conditions.includes("多人拼桌局")) mem.avoid_conditions.push("多人拼桌局");
    if (!mem.learned_from.rejected_reasons.includes("太嘈杂")) mem.learned_from.rejected_reasons.push("太嘈杂");
    notice = "Agent 已记住：你不喜欢嘈杂多人局，以后会优先推荐低打扰 1v1。";
  } else if (type === "too_expensive") {
    mem.default_budget_range[1] = Math.max(40, mem.default_budget_range[1] - 10);
    if (!mem.learned_from.rejected_reasons.includes("预算太高")) mem.learned_from.rejected_reasons.push("预算太高");
    notice = `Agent 已更新：默认预算上限降至 ¥${mem.default_budget_range[1]}，下次会过滤超预算方案。`;
  } else if (type === "less_like_this") {
    if (cat && !mem.learned_from.rejected_reasons.includes(cat)) mem.learned_from.rejected_reasons.push(cat);
    mem.preferred_scenes = mem.preferred_scenes.filter((s) => s !== cat);
    notice = `Agent 已记住：减少推荐「${cat || "这类"}」场景，以后会探索其他品类。`;
  }
  appState.agentMemoryNotice = notice;
  appState.agentFeedbackLog.push({ type, cat, timestamp: nowTime() });
  showToast(notice || "Agent 已更新记忆");
  render();
}

function renderAIPage() {
  const mood = appState.aiMoodProfile;
  const moodSignals = mood
    ? [mood.mood_label, mood.energy ? `${mood.energy}能量` : "", mood.social_style, mood.recommended_category || mood.activity_strategy].filter(Boolean)
    : ["自然语言", "情绪理解", "自动成局"];
  $("#aiPage").innerHTML = `
    <section class="card ai-card agent-console">
      <div class="agent-head">
        <div>
          <p class="eyebrow">我的专属 Agent</p>
          <h2>只说今天的状态，Agent 会结合你的记忆自动完成</h2>
          <p class="muted">你可以直接说状态、预算、距离或想避开的场景。</p>
        </div>
        <div class="agent-status ${appState.aiLoading ? "is-thinking" : appState.matchResults.length ? "is-ready" : ""}">
          <span></span>
          <b>${appState.aiLoading ? "思考中" : appState.matchResults.length ? "已安排" : "待命"}</b>
        </div>
      </div>
      <div class="agent-input-shell">
        <textarea id="intentInput" aria-label="告诉 AI 你的出门需求">${escapeHTML(appState.userInput)}</textarea>
        <div class="agent-signal-row">
          ${moodSignals.slice(0, 4).map((signal) => `<span>${escapeHTML(signal)}</span>`).join("")}
        </div>
      </div>
      <div class="prompt-row agent-prompts">
        <button data-prompt="今天心情不好，想找个人安静坐会儿，离我近一点，预算 50 以内。">心情不好</button>
        <button data-prompt="今晚想找一个人吃韩餐，预算 80 元以内，不想太尴尬，最好轻松聊聊，离我不要太远。">韩餐 1v1</button>
        <button data-prompt="压力有点大，想找个新手友好的攀岩搭子，预算 120 元以内。">释放压力</button>
        <button data-prompt="周末想找安静的人一起喝咖啡学习，预算 40 元以内。">咖啡学习</button>
        <button data-prompt="今晚想找几个人去 KTV，人均 100 元以内，气氛热闹一点。">KTV 多人</button>
        <button data-prompt="今晚狼人阿瓦隆桌游，3-4 人，预算 70 元以内，轻松破冰。">聚会桌游</button>
      </div>
      <div class="agent-actions">
        <button class="primary-button wide ${appState.aiLoading ? "is-loading" : ""}" id="runAIButton" ${appState.aiLoading ? "disabled" : ""}>${appState.aiLoading ? "Agent 正在安排" : "让 Agent 安排方案"}</button>
        <label class="agent-toggle">
          <input id="sparseModeToggle" type="checkbox" ${appState.sparseMode ? "checked" : ""} />
          <span>稀疏供给演示</span>
        </label>
      </div>
    </section>
    ${renderAgentMemoryCard()}
    ${renderAIProcess()}
    ${renderAIDirectorCard()}
    ${renderIntentCard()}
    ${renderMatchResults()}
  `;
  $("#intentInput").addEventListener("input", (event) => { appState.userInput = event.target.value; });
  $("#runAIButton").addEventListener("click", runAI);
  const sparseModeToggle = $("#sparseModeToggle");
  if (sparseModeToggle) {
    sparseModeToggle.addEventListener("change", (event) => {
      appState.sparseMode = event.target.checked;
      showToast(appState.sparseMode ? "已开启稀疏供给演示" : "已关闭稀疏供给演示");
    });
  }
  $$("#aiPage [data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.userInput = button.dataset.prompt;
      appState.poiConstraint = null;
      runAI();
    });
  });
  $$("#aiPage [data-invite-match]").forEach((button) => {
    button.addEventListener("click", () => {
      showGroupInviteModal(appState.matchResults[Number(button.dataset.inviteMatch)]);
    });
  });
  const replanButton = $("#simulateWaitFromResult");
  if (replanButton) replanButton.addEventListener("click", () => {
    openReplanChooser("waiting_time_change", appState.matchResults[0], { resultIndex: 0 });
  });
  const reshuffleButton = $("#reshuffleResult");
  if (reshuffleButton) reshuffleButton.addEventListener("click", () => {
    appState.matchResults = [];
    appState.aiHasRun = false;
    appState.replanningNotice = "";
    appState.parsedIntent = null;
    render();
    showToast("已清空，重新输入条件再匹配");
  });
  const changeTimeBtn = $("#changeTimeOnly");
  if (changeTimeBtn) changeTimeBtn.addEventListener("click", () => changeTopPlanTimeOnly());
  $$("#aiPage [data-clarify]").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.dataset.clarify);
      const q = appState.aiDirector?.clarifying_questions?.[idx];
      if (!q) return;
      appState.userInput = `${appState.userInput} ${q}`.trim();
      runAI();
    });
  });
  $$("#aiPage [data-clarify-text]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.userInput = `${appState.userInput} ${button.dataset.clarifyText}`.trim();
      runAI();
    });
  });
  $$("#aiPage [data-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      const planIndex = Number(button.dataset.adjust);
      const patch = button.dataset.patch;
      applyPlanAdjust(planIndex, patch);
    });
  });
  $$("#aiPage [data-agent-feedback]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.agentFeedback;
      const planIndex = Number(button.dataset.feedbackPlan || "0");
      applyAgentFeedback(type, appState.matchResults[planIndex]);
    });
  });
}

function applyPlanAdjust(planIndex, patch) {
  const match = appState.matchResults[planIndex];
  if (!match) return;
  const intent = appState.parsedIntent || {};
  if (patch === "cheaper") {
    appState.parsedIntent = { ...intent, budget_max: Math.max(20, (intent.budget_max || 80) - 15) };
    appState.replanningNotice = `已将预算上限调整为 ¥${appState.parsedIntent.budget_max}，重新为你匹配。`;
    rerunMatching();
    enrichWithAIDirector(getMatchSupply().availablePOIs, { skipIntentPatch: true });
    render();
    showToast("预算降低，重新匹配中");
  } else if (patch === "closer") {
    appState.parsedIntent = { ...intent, distance_tolerance_km: Math.max(0.5, (intent.distance_tolerance_km || 3) - 1) };
    appState.replanningNotice = `已缩小距离范围至 ${appState.parsedIntent.distance_tolerance_km}km。`;
    rerunMatching();
    render();
    showToast("已缩小范围，重新匹配");
  } else if (patch === "quieter") {
    appState.parsedIntent = { ...intent, social_style: "安静陪伴" };
    appState.replanningNotice = "已调整为「安静陪伴」模式，重新筛选。";
    rerunMatching();
    render();
    showToast("已调整社交模式");
  } else if (patch === "change_time") {
    changeTopPlanTimeOnly();
  } else if (patch === "verified_only") {
    const verifiedResults = appState.matchResults.filter((r) => r.user.verified_status);
    if (verifiedResults.length) {
      appState.matchResults = verifiedResults;
      appState.replanningNotice = "已过滤，仅显示已验证搭子。";
      render();
      showToast("已过滤为已验证搭子");
    } else {
      showToast("当前方案中暂无已验证搭子");
    }
  }
}

function changeTopPlanTimeOnly() {
  const top = appState.matchResults[0];
  if (!top) return;
  const slots = ["今晚 18:00", "今晚 19:30", "现在 + 15 分钟", "周末 15:30"];
  const current = top.suggested_time || slots[0];
  const nextSlot = slots[(slots.indexOf(current) + 1) % slots.length] || slots[1];
  appState.matchResults = appState.matchResults.map((item, index) => (
    index === 0 ? { ...item, suggested_time: nextSlot } : item
  ));
  appState.replanningNotice = `已保留 ${top.user.nickname} 与 ${top.poi.name}，仅将时间调整为 ${nextSlot}。`;
  render();
  showToast("已换一个时间");
}

function renderAIDirectorCard() {
  if (appState.aiLoading || !appState.aiDirector) return "";
  const layer = appState.aiDirector.merchant_layer || {};
  const profile = appState.aiDirector.agent_profile || appState.aiMoodProfile || {};
  return `
    <section class="card ai-state is-done agent-brief">
      <div class="analyzing-dot"></div>
      <div>
        <b>AI Agent 已自动安排</b>
        <p>${escapeHTML(appState.aiDirector.director_brief || layer.summary || "已生成可执行方案。")}</p>
        <div class="agent-brief-grid">
          <span><b>${escapeHTML(profile.mood_label || "意图明确")}</b><small>状态</small></span>
          <span><b>${Math.round((profile.confidence || 0.76) * 100)}%</b><small>理解置信度</small></span>
          <span><b>${escapeHTML(appState.matchResults[0]?.total_score ? `${appState.matchResults[0].total_score}分` : "已评分")}</b><small>首选方案</small></span>
        </div>
        ${profile.activity_strategy ? `<p style="margin-top:8px;font-size:12px;color:#4b5563;">${escapeHTML(profile.activity_strategy)}</p>` : ""}
        ${layer.freshness_label ? `<p style="margin-top:6px;font-size:12px;color:#6b7280;">${escapeHTML(layer.freshness_label)}</p>` : ""}
      </div>
    </section>
  `;
}

function renderIntentCard() {
  if (appState.aiLoading) return "";
  if (!appState.parsedIntent) {
    return `<section class="card ai-state"><div class="analyzing-dot"></div><div><b>Agent 正在等待输入</b><p>输入后会同时理解语义、情绪、预算、时间和距离。</p></div></section>`;
  }
  const i = appState.parsedIntent;
  const mood = appState.aiMoodProfile;
  const confidenceLow = i.parse_layer === "low_confidence";
  const mem = appState.agentMemory;
  const moodLabel = mood?.mood_label || mood?.user_state || "";
  const hardConditions = [
    i.distance_tolerance_km < 2 ? `近距离（${i.distance_tolerance_km}km）` : null,
    i.budget_max ? `预算 ¥${i.budget_max} 以内` : null,
    i.target_time !== "今晚" ? i.target_time : null
  ].filter(Boolean);
  const softPrefs = [
    i.social_style,
    i.group_size !== "1v1" ? i.group_size : "1v1 优先",
    i.category_explicit ? i.category_preference : null
  ].filter(Boolean);
  const agentJudgment = (() => {
    const avoid = [];
    if (mem?.avoid_conditions?.some((c) => /多人/.test(c))) avoid.push("排除多人拼桌局");
    if (mem?.avoid_conditions?.some((c) => /等待/.test(c))) avoid.push("过滤高等待商家");
    return avoid.length ? avoid.join("，") : "结合记忆综合匹配";
  })();
  return `
    <section class="card ai-state is-done agent-parse-card">
      <div class="analyzing-dot"></div>
      <div style="width:100%;">
        <b>Agent 理解结果</b>
        <div class="intent-analysis-grid">
          ${moodLabel ? `<div class="intent-row"><span class="intent-row-label">当前状态</span><span>${escapeHTML(moodLabel)}</span></div>` : ""}
          ${hardConditions.length ? `<div class="intent-row"><span class="intent-row-label">硬条件</span><span>${hardConditions.map(escapeHTML).join("、")}</span></div>` : ""}
          ${softPrefs.length ? `<div class="intent-row"><span class="intent-row-label">软偏好</span><span>${softPrefs.map(escapeHTML).join("、")}</span></div>` : ""}
          <div class="intent-row"><span class="intent-row-label">Agent 判断</span><span>${escapeHTML(agentJudgment)}</span></div>
        </div>
        <p style="margin-top:8px;font-size:12px;color:${confidenceLow ? "#b45309" : "#15803d"};">
          ${confidenceLow ? "低置信度待澄清" : "AI 分析完成"}（置信度 ${Math.round((i.parse_confidence || 0.8) * 100)}%）
        </p>
        ${renderClarifyingQuestions()}
      </div>
    </section>
  `;
}

function renderClarifyingQuestions() {
  const questions = appState.aiDirector?.clarifying_questions;
  if (!Array.isArray(questions) || !questions.length) return "";
  return `
    <div style="margin-top:8px;">
      <p style="font-size:12px;color:#6b7280;margin-bottom:6px;">可点选澄清：</p>
      <div class="prompt-row clarifying-row">
        ${questions.slice(0, 2).map((q, i) => `<button type="button" data-clarify="${i}">${escapeHTML(q)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderAgentClarifyCard() {
  const questions = appState.aiDirector?.clarifying_questions;
  const i = appState.parsedIntent;
  if (!i || !appState.aiHasRun) return "";
  // Detect missing key slots
  const missingSlots = [];
  if (!i.category_explicit) missingSlots.push("活动类型");
  if ((i.budget_max || 0) <= 5) missingSlots.push("预算");
  const confidenceLow = (i.parse_confidence || 1) < 0.62;
  if (!confidenceLow && missingSlots.length === 0) return "";
  const agentQ = confidenceLow
    ? "我可以帮你安排，但再确认一下：你更想放松，还是来点轻运动？"
    : `差一个判断：${missingSlots.join("或")}大概是什么范围？`;
  const chips = Array.isArray(questions) && questions.length
    ? questions.slice(0, 3).map((q, idx) => `<button class="clarify-chip" data-clarify="${idx}">${escapeHTML(q)}</button>`).join("")
    : ["随便逛逛", "吃顿饭就好", "预算 60 以内", "不要太远"].map((q) =>
        `<button class="clarify-chip" data-clarify-text="${escapeHTML(q)}">${q}</button>`
      ).join("");
  return `
    <div class="agent-clarify-card result-fade">
      <p class="agent-q">Agent：${escapeHTML(agentQ)}</p>
      <div class="clarify-chips">${chips}</div>
    </div>
  `;
}

function renderPlanCompareTable() {
  if (appState.matchResults.length < 2) return "";
  const plans = appState.matchResults.slice(0, 3);
  const planLabels = ["A", "B", "C"];
  const rows = [
    ["搭子", (m) => m.user.nickname],
    ["地点", (m) => m.poi.name],
    ["匹配度", (m) => `${m.total_score}%`],
    ["人均", (m) => `¥${m.poi.avg_price}`],
    ["等待", (m) => `${m.poi.wait_time_min}min`],
    ["时间", (m) => m.suggested_time]
  ];
  return `
    <div class="plan-compare-table card">
      <p class="eyebrow" style="margin-bottom:8px;">方案对比</p>
      <div class="pct-grid" style="grid-template-columns: 52px ${plans.map(() => "1fr").join(" ")}">
        <div class="pct-cell pct-header-cell"></div>
        ${plans.map((_, i) => `<div class="pct-cell pct-header-cell plan-label-${planLabels[i]}">${planLabels[i]}</div>`).join("")}
        ${rows.map(([label, fn]) => `
          <div class="pct-cell pct-row-label">${label}</div>
          ${plans.map((m) => `<div class="pct-cell">${escapeHTML(String(fn(m)))}</div>`).join("")}
        `).join("")}
      </div>
    </div>
  `;
}

function renderAIProcess() {
  if (!appState.aiLoading) return "";
  const intent = appState.parsedIntent;
  const steps = [
    { label: "理解语义和情绪", detail: intent ? `识别到「${intent.activity_type}」，置信度 ${Math.round((intent.parse_confidence || 0.7) * 100)}%` : "分析你的出门需求..." },
    { label: "排除不合适的商家", detail: `过滤等待超过 20 分钟或超预算的场所` },
    { label: "计算 AI 成局评分", detail: "综合距离、预算、社交风格、信誉三维匹配" },
    { label: "生成可执行方案", detail: "按「符合预算 · 距离近 · 已验证」优先排序" }
  ];
  return `
    <section class="card ai-steps">
      ${steps.map((step, index) => `
        <div class="ai-step ${index < appState.aiStep ? "is-done" : ""} ${index === appState.aiStep ? "is-active" : ""}">
          <span>${index + 1}</span>
          <div>
            <p style="font-weight:600;">${step.label}</p>
            ${index <= appState.aiStep ? `<p style="font-size:12px;color:#6b7280;margin-top:2px;">${step.detail}</p>` : ""}
          </div>
        </div>
      `).join("")}
    </section>
  `;
}

function renderMatchResults() {
  if (appState.aiLoading) return "";
  if (!appState.matchResults.length && appState.aiHasRun) {
    return `
      <section class="card empty-state result-fade">
        <h2>当前没有完全匹配的搭子</h2>
        <p>${appState.sparseMode ? "当前供给较低，已进入稀疏兜底。" : "AI 已为你推荐最接近的方案。"}</p>
      </section>
      ${appState.sparseMode ? `<section class="card" style="margin-top:8px;"><b>兜底建议</b><p style="margin-top:6px;color:#6b7280;">建议放宽时间或预算后重试，或切换到“今晚/周末”以扩大候选池。</p></section>` : ""}
    `;
  }
  if (!appState.matchResults.length) return "";
  const fallbackBanner = appState.aiRuleFallback
    ? `<div class="notice-card" style="background:#fffbeb;color:#92400e;">当前为 <b>规则层兜底</b>（L0），评分仍为本地真相源。</div>`
    : "";
  return `
    <section class="result-section result-fade">
      <div class="section-title">
        <h2>Agent 安排的方案</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="text-button" id="reshuffleResult">换一局</button>
          <button class="text-button" id="changeTimeOnly">换一个时间</button>
          <button class="text-button" id="simulateWaitFromResult">模拟排队变长</button>
        </div>
      </div>
      ${fallbackBanner}
      ${appState.replanningNotice ? `<div class="notice-card">${appState.replanningNotice}</div>` : ""}
      ${renderAgentClarifyCard()}
      ${renderPlanCompareTable()}
      ${appState.matchResults.map((match, index) => renderMatchCard(match, index)).join("")}
    </section>
  `;
}

function computeDealPricing(match) {
  const deal = getDeal(match.poi.poi_id);
  const groupCount = targetGroupCount(match.intent?.group_size || "1v1");
  const perPerson = Math.round(deal.discount_price / Math.max(1, groupCount));
  const saved = Math.max(0, deal.original_price - deal.discount_price);
  const budgetMax = match.intent?.budget_max || 80;
  const overBudget = perPerson - budgetMax;
  const fits = overBudget <= 0;
  return { deal, perPerson, saved, groupCount, fits, overBudget: Math.max(0, overBudget) };
}

function renderMatchCard(match, index) {
  const userLikesCat = match.user.preferred_categories && match.user.preferred_categories.includes(match.intent.category_preference);
  const rep = reputationBadge(match.user);
  const director = match.ai_director || {};
  const planTitle = director.headline || "AI 成局方案";
  const planCopy = director.explanation
    ? `${director.explanation}${director.closing_line ? ` ${director.closing_line}` : ""}`
    : `推荐你和 ${match.user.nickname} ${match.suggested_time} 去 ${match.poi.name}。${match.explanation} 备选地点：${match.backup_poi ? match.backup_poi.name : "附近同类商家"}。`;
  const pricing = computeDealPricing(match);
  const priceTag = pricing.fits
    ? `<span style="color:#15803d;font-size:11px;font-weight:700;">✓ 符合预算</span>`
    : `<span style="color:#b45309;font-size:11px;font-weight:700;">超预算 ¥${pricing.overBudget}</span>`;
  return `
    <article class="match-card card">
      <div class="match-top">
        <div class="score-circle"><span>AI评分</span>${match.total_score}</div>
        <div>
          <h3>${match.user.nickname}${match.user.verified_status ? ' <span class="verified-badge">已验证</span>' : ""}</h3>
          <p>${match.user.social_style} · ¥${match.user.budget_min}–${match.user.budget_max} · ${match.user.distance_km}km · <span class="rep-badge">信誉 ${rep.score}（${rep.tier}）</span></p>
          <div class="tag-row">${match.user.interest_labels.slice(0, 4).map((tag) => `<span>${tag}</span>`).join("")}</div>
        </div>
      </div>
      <div class="breakdown">
        ${Object.entries(match.score_breakdown).slice(0, 6).map(([key, value]) => `<div><span>${breakdownLabel(key)}</span><b>${value}</b></div>`).join("")}
      </div>
      <div class="place-mini">
        <b>${match.poi.name}</b>
        <p style="margin-top:4px;">${match.poi.sub_category} · 等待 ${match.poi.wait_time_min} 分钟 · ${match.poi.distance_km}km · ${match.poi.rating}分</p>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">
          <span style="font-size:12px;color:#6b7280;">门店均价 ¥${match.poi.avg_price}</span>
          <span style="font-size:12px;color:#6b7280;">→</span>
          <span style="font-size:14px;font-weight:700;">券后约 ¥${pricing.perPerson}/人</span>
          ${priceTag}
          ${pricing.saved > 0 ? `<span style="font-size:11px;color:#6b7280;">省 ¥${pricing.saved}</span>` : ""}
        </div>
      </div>
      <details class="why-details" ${index === 0 ? "open" : ""}>
        <summary>为什么是这家店 / 这个人 / 这个时间</summary>
        <ul>
          <li><b>地点</b>：${escapeHTML(match.poi.name)}，${escapeHTML(match.poi.sub_category)}，门店均价 ¥${match.poi.avg_price}，券后约 ¥${pricing.perPerson}/人，等待 ${match.poi.wait_time_min} 分钟${match.poi.hot_score > 80 ? "，当前热度高" : ""}</li>
          <li><b>搭子</b>：${escapeHTML(match.user.nickname)}，${escapeHTML(match.user.social_style)}，预算 ¥${match.user.budget_min}–${match.user.budget_max}，距你 ${match.user.distance_km}km</li>
          <li><b>时间</b>：${escapeHTML(match.suggested_time)}，${userLikesCat ? "对方偏爱" : "双方都对"} ${escapeHTML(match.intent.category_preference)}，社交风格契合度高</li>
          <li><b>判断</b>：${escapeHTML(match.explanation || "综合预算、距离、品类偏好三维匹配")}</li>
          ${director.score_reason ? `<li><b>评分依据</b>：${escapeHTML(director.score_reason)}</li>` : ""}
        </ul>
        ${personalizedReasonLines(match).length ? `
          <div style="margin-top:8px;padding:8px 10px;background:#fffdf0;border-radius:10px;border:1px solid #ffe88a;">
            <p style="font-size:11px;font-weight:700;color:#92700a;margin-bottom:4px;">基于你的记忆</p>
            <ul style="margin:0;padding-left:14px;">
              ${personalizedReasonLines(match).map((line) => `<li style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHTML(line)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </details>
      <div class="plan-copy">
        <b>${escapeHTML(planTitle)}</b>
        <p>${escapeHTML(planCopy)}</p>
        ${director.risk ? `<p style="margin-top:6px;color:#6b7280;">风险预判：${escapeHTML(director.risk)}</p>` : ""}
        ${director.conversion_prompt ? `<p style="margin-top:6px;color:#92400e;">${escapeHTML(director.conversion_prompt)}</p>` : ""}
      </div>
      <div class="adjust-row">
        <button class="text-button" data-adjust="${index}" data-patch="cheaper">更便宜</button>
        <button class="text-button" data-adjust="${index}" data-patch="closer">更近</button>
        <button class="text-button" data-adjust="${index}" data-patch="quieter">更安静</button>
        <button class="text-button" data-adjust="${index}" data-patch="change_time">换时间</button>
        <button class="text-button" data-adjust="${index}" data-patch="verified_only">只看已验证</button>
      </div>
      <div class="feedback-row">
        <span style="font-size:11px;color:#9ca3af;align-self:center;">告诉 Agent：</span>
        <button class="feedback-chip like" data-agent-feedback="like" data-feedback-plan="${index}">喜欢这个</button>
        <button class="feedback-chip" data-agent-feedback="too_far" data-feedback-plan="${index}">太远了</button>
        <button class="feedback-chip" data-agent-feedback="too_noisy" data-feedback-plan="${index}">太嘈杂</button>
        <button class="feedback-chip" data-agent-feedback="too_expensive" data-feedback-plan="${index}">预算太高</button>
        <button class="feedback-chip" data-agent-feedback="less_like_this" data-feedback-plan="${index}">少推这类</button>
      </div>
      <button class="primary-button wide" data-invite-match="${index}" style="margin-top:4px;">发出邀约</button>
    </article>
  `;
}

const TIME_SLOTS = ["今晚 18:00", "今晚 19:30", "今晚 21:00", "现在出发", "周末 15:30"];

function showGroupInviteModal(match) {
  if (!match) return;
  let currentTime = match.suggested_time || TIME_SLOTS[0];
  const deal = getDeal(match.poi.poi_id);

  function renderModal() {
    let overlay = document.getElementById("groupInviteModal");
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "groupInviteModal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-sheet" style="padding-bottom:32px;">
        <div class="modal-header">
          <h2 style="font-size:17px;">确认邀约</h2>
          <button class="modal-close" id="closeInviteModal">关闭</button>
        </div>
        <div style="padding:16px 18px 0;">
          <div style="background:#fff8e6;border:1.5px dashed #ffd100;border-radius:16px;padding:16px 18px;">
            <p style="font-size:13px;color:#999;margin-bottom:10px;font-weight:600;">邀 @${escapeHTML(match.user.nickname)} 一起去活动</p>
            <div style="display:grid;gap:8px;">
              <p style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;">
                🏠 ${escapeHTML(match.poi.name)}
              </p>
              <p style="display:flex;align-items:center;gap:8px;font-size:14px;">
                🕐 <span id="inviteTimeDisplay">${escapeHTML(currentTime)}</span>
              </p>
              <p style="display:flex;align-items:center;gap:8px;font-size:14px;">
                💰 ${escapeHTML(deal ? deal.title : match.poi.deal_text)}（团购）
              </p>
              <p style="display:flex;align-items:center;gap:8px;font-size:13px;color:#666;">
                💬 社交风格：${escapeHTML(match.intent.social_style)} · ${escapeHTML(match.intent.group_size)}
              </p>
            </div>
          </div>
          <p style="font-size:12px;color:#999;margin-top:10px;line-height:1.6;">
            对方收到的是一条<b>一键接受的约局邀请</b>，接受即进入活动页，不是自由聊天室。
          </p>
          <div class="modal-actions" style="padding:14px 0 0;">
            <button type="button" class="secondary-button" id="inviteChangeTime">换一个时间</button>
            <button type="button" class="primary-button" id="inviteSend">发出邀约 →</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById("closeInviteModal").addEventListener("click", () => overlay.remove());
    document.getElementById("inviteSend").addEventListener("click", () => {
      overlay.remove();
      const matchWithTime = { ...match, suggested_time: currentTime };
      selectMatch(matchWithTime);
    });
    document.getElementById("inviteChangeTime").addEventListener("click", () => {
      const idx = TIME_SLOTS.indexOf(currentTime);
      currentTime = TIME_SLOTS[(idx + 1) % TIME_SLOTS.length];
      renderModal();
    });
  }

  renderModal();
}

function selectMatch(match) {
  appState.selectedMatch = { ...match };
  appState.depositSheetVisible = false;
  appState.depositAgreementChecked = false;
  appState.depositLocked = false;
  appState.selectedDeal = null;
  appState.fallbackSuggestion = "";
  appState.debugMeta = appState.selectedMatch.concurrency || appState.debugMeta;
  setPlanStatus(PLAN_STATUS.MATCHED);
  appState.pendingSuccess = false;
  appState.replanningNotice = "";
  appState.chatThread = buildChatThread(appState.selectedMatch);
  appState.viewingGroupChatId = "__active__";
  setPage("chat");
}

function buildChatThread(match) {
  return {
    chat_id: `chat_${match.match_id}`,
    match_id: match.match_id,
    messages: [
      { sender: "ai", text: openingMessage(match), timestamp: "18:05" },
      ...scenarioMessages(match)
    ],
    plan_status: PLAN_STATUS.MATCHED,
    current_user_confirmed: false,
    matched_user_confirmed: false
  };
}

function openingMessage(match) {
  return `哈喽，我看到我们都想${match.intent.target_time}去${match.intent.category_preference}，AI 推荐 ${match.suggested_time} 去 ${match.poi.name}，你觉得可以吗？`;
}

function scenarioMessages(match) {
  if (match.intent.activity_type === "KTV搭子") return [{ sender: "matched_user", text: "可以，我想唱几首中文歌，包厢别太贵就行。", timestamp: "18:07" }];
  if (match.intent.activity_type === "咖啡搭子") return [{ sender: "matched_user", text: "可以，我也想找个安静点的位置学习。", timestamp: "14:08" }];
  if (match.intent.activity_type === "夜宵搭子") return [{ sender: "matched_user", text: "可以，夜宵我比较想吃烧烤，别排太久就好。", timestamp: "22:05" }];
  if (match.intent.activity_type === "攀岩搭子") return [{ sender: "matched_user", text: "可以，我 V3 左右，装备可以现场租。", timestamp: "10:12" }];
  if (match.intent.activity_type === "骑行搭子") return [{ sender: "matched_user", text: "可以，休闲骑就行，别拉太快。", timestamp: "15:06" }];
  if (match.intent.activity_type === "跑团搭子") return [{ sender: "matched_user", text: "可以，我带角色卡，缺 DM 吗？", timestamp: "19:02" }];
  if (match.intent.activity_type === "RPG桌游搭子") return [{ sender: "matched_user", text: "可以，美式 RPG 我熟，新手也能带。", timestamp: "19:05" }];
  if (/桌游/.test(match.intent.activity_type)) return [{ sender: "matched_user", text: "可以，狼人/阿瓦隆都行，人齐就开。", timestamp: "20:03" }];
  return [{ sender: "matched_user", text: "可以，这家我也想试试，轻松聊聊就好。", timestamp: "18:07" }];
}

function renderCoordinatorSummaryCard(match) {
  const pricing = computeDealPricing(match);
  return `
    <section class="card result-fade" style="background:#fffdf0;border:2px dashed #FFE033;padding:14px 16px;margin-bottom:0;">
      <p class="eyebrow" style="margin-bottom:8px;">AI 已帮你们对齐</p>
      <div style="display:grid;gap:6px;font-size:14px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">时间</span><b>${escapeHTML(match.suggested_time)}</b>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">地点</span><b>${escapeHTML(match.poi.name)}</b>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">预算</span>
          <b>券后约 ¥${pricing.perPerson}/人${pricing.fits ? " ✓" : ""}</b>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">社交方式</span><b>${escapeHTML(match.intent.social_style)} · ${escapeHTML(match.intent.group_size)}</b>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">保障</span><b style="color:#15803d;">诚意金已冻结，到店核销自动解冻</b>
        </div>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:10px;">等待对方确认中... 你可以下方模拟对方操作。</p>
    </section>
  `;
}

function renderChatPage() {
  const backToList = () => { appState.viewingGroupChatId = null; render(); };

  // Case 1: viewing a specific completed group chat
  if (appState.viewingGroupChatId !== null && appState.viewingGroupChatId !== "__active__") {
    const gc = appState.groupChats.find((g) => g.group_id === appState.viewingGroupChatId);
    if (!gc) { backToList(); return; }
    $("#chatPage").innerHTML = `
      <section class="card gc-header-card">
        <button type="button" class="back-text-btn" id="backToList">← 消息</button>
        <div class="gc-header-info">
          <div class="gc-avatar">${poiBadgeHTML(gc.poi)}</div>
          <div>
            <h2 style="font-size:16px;">${gc.name}</h2>
            <p class="muted">${gc.members.map((m) => m.nickname).join(" · ")}</p>
          </div>
        </div>
      </section>
      <section class="card" style="padding:10px 14px;margin-bottom:8px;">
        <p class="eyebrow" style="margin-bottom:4px;">约定详情</p>
        <p><b>${gc.poi.name}</b> · ${gc.suggested_time} · 人均 ¥${gc.poi.avg_price}</p>
      </section>
      <section class="messages-card card">
        ${gc.messages.map((m) => {
          if (m.sender === "system") return `<div class="message system-msg"><span>${m.text}</span></div>`;
          return renderMessage(m);
        }).join("")}
        <div class="quick-replies">
          ${["收到！", "我在路上", "稍等一下", "已到门口"].map((t) => `<button data-gcquick="${t}">${t}</button>`).join("")}
        </div>
        <div class="chat-composer">
          <input id="gcInput" placeholder="输入群消息" />
          <button class="primary-button" id="gcSend">发送</button>
        </div>
      </section>
    `;
    $("#backToList").addEventListener("click", backToList);
    $$("#chatPage [data-gcquick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.dataset.gcquick;
        gc.messages.push({ sender: "user_current", text, timestamp: nowTime() });
        render();
        appendGCPeerReply(gc, text);
      });
    });
    const gcInput = $("#gcInput");
    const doGCSend = () => {
      const text = gcInput.value.trim();
      if (!text) return;
      gc.messages.push({ sender: "user_current", text, timestamp: nowTime() });
      gcInput.value = "";
      render();
      appendGCPeerReply(gc, text);
    };
    $("#gcSend").addEventListener("click", doGCSend);
    gcInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doGCSend(); });
    // Scroll messages to bottom
    const msgCard = $("#chatPage .messages-card");
    if (msgCard) msgCard.scrollTop = msgCard.scrollHeight;
    return;
  }

  // Case 2: viewing active match chat (in-progress match)
  if (appState.viewingGroupChatId === "__active__" && appState.selectedMatch) {
    const match = appState.selectedMatch;
    const deal = getDeal(match.poi.poi_id);
    const planMeta = currentPlanStatusMeta();
    $("#chatPage").innerHTML = `
      <section class="card gc-header-card">
        <button type="button" class="back-text-btn" id="backFromActive">← 消息</button>
        <div class="gc-header-info">
          <div class="gc-avatar" style="font-size:22px;font-weight:700;">${match.user.nickname[0]}</div>
          <div style="flex:1;min-width:0;">
            <h2 style="font-size:16px;">${match.user.nickname}${match.user.verified_status ? ' <span class="verified-badge">已验证</span>' : ""}</h2>
            <p class="muted" style="font-size:12px;">${match.total_score}% 匹配 · ${match.user.social_style} · ${match.user.distance_km}km</p>
          </div>
          <span class="active-match-badge">进行中</span>
        </div>
      </section>
      <section class="intent-summary-card card">
        <p class="eyebrow" style="margin-bottom:6px;">此次出行</p>
        <div class="intent-tags">
          <span class="intent-tag">${match.intent.activity_type}</span>
          <span class="intent-tag">¥${match.intent.budget_min}–${match.intent.budget_max}</span>
          <span class="intent-tag">${match.intent.social_style}</span>
          <span class="intent-tag">${match.intent.group_size}</span>
          <span class="intent-tag">${match.intent.target_time}</span>
        </div>
        <button class="safety-button" id="safetyOptions">安全选项</button>
      </section>
      ${appState.replanningNotice ? `<div class="notice-card">${appState.replanningNotice}</div>` : ""}
      <section class="card" style="padding:10px 14px;">
        <p class="eyebrow" style="margin-bottom:6px;">当前局态</p>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
          <b>${planMeta.label}</b>
          <span style="color:#6b7280;">${planMeta.progress}%</span>
        </div>
        <div class="progress-track" style="margin-top:8px;">
          <div class="progress-fill" style="width:${planMeta.progress}%;"></div>
        </div>
      </section>
      ${appState.planStatus === PLAN_STATUS.LOCKED_WAITING_PEER ? renderCoordinatorSummaryCard(match) : ""}
      <section class="plan-card card">
        <p class="eyebrow">方案确认</p>
        <h2>${match.poi.name}</h2>
        <p>${match.suggested_time} · ${match.intent.group_size} · 预算 ¥${match.intent.budget_min}–${match.intent.budget_max}</p>
        <p class="muted">${match.poi.sub_category} · 人均 ¥${match.poi.avg_price} · 等待 ${match.poi.wait_time_min} 分钟 · 备选 ${match.backup_poi ? match.backup_poi.name : "同类附近地点"}</p>
        <div class="deal-strip">${deal.title}</div>
        <p class="wait-status">${planMeta.label}</p>
        <div class="confirm-row">
          <span class="${appState.currentUserConfirmed ? "ok" : ""}">我 ${appState.currentUserConfirmed ? "已确认" : "待确认"}</span>
          <span class="${appState.matchedUserConfirmed ? "ok" : ""}">对方 ${appState.matchedUserConfirmed ? "已确认" : "待确认"}</span>
        </div>
        <div class="action-grid">
          ${appState.planStatus === PLAN_STATUS.LOCKED_WAITING_PEER ? `
            <button class="primary-button" id="simPeerConfirm">✓ 模拟对方确认</button>
            <button class="secondary-button" id="simPeerReject">✗ 模拟对方拒绝</button>
            <button class="secondary-button" id="simTimeout">⏱ 模拟等待超时</button>
          ` : appState.planStatus === PLAN_STATUS.CONFIRMED ? `
            <button class="primary-button wide" id="goToSuccess">查看成局详情 →</button>
          ` : `
            <button class="primary-button" id="confirmMatch" ${appState.currentUserConfirmed ? "disabled" : ""}>我确认</button>
            <button class="secondary-button" id="changePlace">换地点</button>
            <button class="secondary-button" id="simulateWait">模拟排队变长</button>
            <button class="secondary-button" id="simulateReject">模拟对方拒绝</button>
          `}
        </div>
        ${appState.fallbackSuggestion ? `<p style="margin-top:8px;color:#92400e;background:#fffbeb;border-radius:10px;padding:8px 10px;">${appState.fallbackSuggestion}</p>` : ""}
        ${renderRejectRematchCard()}
        ${appState.planStatus === PLAN_STATUS.FALLBACK_READY ? `<button class="primary-button wide" id="acceptFallback" style="margin-top:8px;">接受候补方案</button>` : ""}
        ${appState.debugMeta ? `<details style="margin-top:8px;"><summary style="cursor:pointer;color:#6b7280;">调试字段（并发叙事）</summary><p style="margin-top:6px;font-size:12px;color:#6b7280;">match_version: ${appState.debugMeta.match_version}<br/>reservation_ttl: ${appState.debugMeta.reservation_ttl}<br/>idempotency_key: ${appState.debugMeta.idempotency_key}</p></details>` : ""}
      </section>
      <section class="messages-card card">
        ${appState.chatThread.messages.map(renderMessage).join("")}
        ${appState.pendingSuccess ? `<div class="confirming-banner">双方已确认，正在生成成局卡片...</div>` : ""}
        <div class="quick-replies">
          ${["可以", "想换一家", "时间短一点", "时间晚一点", "预算有点高", "直接确认"].map((text) => `<button data-quick="${text}">${text}</button>`).join("")}
        </div>
        <div class="chat-composer">
          <input id="chatInput" placeholder="输入消息" />
          <button class="primary-button" id="sendMessage">发送</button>
        </div>
      </section>
    `;
    $("#backFromActive").addEventListener("click", backToList);
    const confirmMatchBtn = $("#confirmMatch");
    if (confirmMatchBtn) confirmMatchBtn.addEventListener("click", confirmMatch);
    const changePlaceBtn = $("#changePlace");
    if (changePlaceBtn) changePlaceBtn.addEventListener("click", () => openReplanChooser("change_place"));
    const simulateWaitBtn = $("#simulateWait");
    if (simulateWaitBtn) simulateWaitBtn.addEventListener("click", () => openReplanChooser("waiting_time_change"));
    const simulateRejectBtn = $("#simulateReject");
    if (simulateRejectBtn) simulateRejectBtn.addEventListener("click", simulateMatchReject);
    const simPeerConfirmBtn = $("#simPeerConfirm");
    if (simPeerConfirmBtn) simPeerConfirmBtn.addEventListener("click", simulatePeerConfirm);
    const simPeerRejectBtn = $("#simPeerReject");
    if (simPeerRejectBtn) simPeerRejectBtn.addEventListener("click", simulatePeerReject);
    const simTimeoutBtn = $("#simTimeout");
    if (simTimeoutBtn) simTimeoutBtn.addEventListener("click", simulatePeerTimeout);
    const goToSuccessBtn = $("#goToSuccess");
    if (goToSuccessBtn) goToSuccessBtn.addEventListener("click", () => { appState.currentPage = "success"; render(); });
    const acceptFallbackBtn = $("#acceptFallback");
    if (acceptFallbackBtn) acceptFallbackBtn.addEventListener("click", acceptFallbackMatch);
    $("#safetyOptions").addEventListener("click", showSafetyPanel);
    $("#sendMessage").addEventListener("click", sendChatMessage);
    $("#chatInput").addEventListener("keydown", (event) => { if (event.key === "Enter") sendChatMessage(); });
    $$("#chatPage [data-quick]").forEach((button) => {
      button.addEventListener("click", () => handleQuickReply(button.dataset.quick));
    });
    // Scroll to bottom
    const activeMsg = $("#chatPage .messages-card");
    if (activeMsg) activeMsg.scrollTop = activeMsg.scrollHeight;
    return;
  }

  // Case 3: chat list (WeChat-style, always the default)
  const activeMatch = appState.selectedMatch;
  const allChats = appState.groupChats;
  const lastMsg = (msgs) => msgs[msgs.length - 1]?.text || "";

  if (!activeMatch && allChats.length === 0) {
    $("#chatPage").innerHTML = `
      <header class="chat-page-header"><h1>消息</h1></header>
      <section class="card empty-state">
        <h2>还没有消息</h2>
        <p>从地图加入一个局，或让 AI 帮你匹配。</p>
        <button class="primary-button wide" id="goAI">去 AI 匹配</button>
      </section>`;
    $("#goAI").addEventListener("click", () => setPage("ai"));
    return;
  }

  $("#chatPage").innerHTML = `
    <header class="chat-page-header"><h1>消息</h1></header>
    ${activeMatch ? `
      <article class="group-list-item card active-chat-item" id="openActiveMatch">
        <div class="gc-list-icon active-chat-icon">${activeMatch.user.nickname[0]}</div>
        <div class="gc-list-body">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <h3 style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${activeMatch.user.nickname} · ${activeMatch.poi.name}</h3>
            <span class="active-match-badge">进行中</span>
          </div>
          <p>${activeMatch.suggested_time} · ${activeMatch.intent.activity_type}</p>
          <small class="muted">${lastMsg(appState.chatThread?.messages || [])}</small>
        </div>
      </article>
    ` : ""}
    ${allChats.map((gc) => `
      <article class="group-list-item card" data-gcid="${gc.group_id}">
        <div class="gc-list-icon">${poiBadgeHTML(gc.poi)}</div>
        <div class="gc-list-body">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <h3 style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${gc.name}</h3>
            <span class="gc-list-time">${gc.createdAt}</span>
          </div>
          <p>${gc.suggested_time} · ${gc.members.map((m) => m.nickname).join("、")}</p>
          <small class="muted">${lastMsg(gc.messages)}</small>
        </div>
      </article>
    `).join("")}
  `;
  if (activeMatch) {
    $("#openActiveMatch").addEventListener("click", () => { appState.viewingGroupChatId = "__active__"; render(); });
  }
  $$("#chatPage [data-gcid]").forEach((item) => {
    item.addEventListener("click", () => { appState.viewingGroupChatId = item.dataset.gcid; render(); });
  });
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activityFitsPoi(activity, poi) {
  if (window.MatchingUtils && typeof window.MatchingUtils.activityMatchesPoi === "function") {
    return window.MatchingUtils.activityMatchesPoi(activity, poi);
  }
  if (activity === "KTV搭子") return poi.category === "KTV";
  if (activity === "酒吧搭子") return poi.category === "酒吧";
  if (activity === "咖啡搭子") return poi.category === "咖啡";
  if (activity === "夜宵搭子") return poi.category === "夜宵";
  if (activity === "攀岩搭子") return poi.category === "攀岩";
  if (activity === "骑行搭子") return poi.category === "骑行";
  if (/桌游|跑团|RPG/.test(activity)) return poi.category === "桌游";
  return poi.category === "餐厅";
}

function rankReplanCandidates(match, eventType) {
  const source = gaodePOIs.length ? gaodePOIs : pois;
  const currentPoi = match.poi;
  const intent = match.intent || parseIntent(appState.userInput);
  const peer = match.user || {};
  return source
    .filter((poi) => poi.poi_id !== currentPoi.poi_id)
    .map((poi) => {
      const sameSubCategory = poi.sub_category === currentPoi.sub_category || poi.sub_category === intent.category_preference;
      const sameCategory = poi.category === currentPoi.category || activityFitsPoi(intent.activity_type, poi);
      const tagOverlap = (poi.tags || []).filter((tag) => [intent.category_preference, intent.social_style, ...(peer.interest_labels || [])].includes(tag)).length;
      const categoryScore = sameSubCategory ? 100 : sameCategory ? 82 : localClamp(42 + tagOverlap * 14, 35, 76);
      const priceScore = localClamp(100 - Math.abs((poi.avg_price || 0) - (currentPoi.avg_price || 0)) * 3, 25, 100);
      const waitScore = localClamp(100 - (poi.wait_time_min || 0) * (eventType === "waiting_time_change" ? 4.5 : 3), 20, 100);
      const distanceScore = localClamp(100 - Number(poi.distance_km || 0) * 24, 35, 100);
      const ratingScore = localClamp((Number(poi.rating) || 4) / 5 * 100, 60, 100);
      const peerScore = (peer.preferred_categories || []).includes(poi.sub_category) || (peer.preferred_categories || []).includes(poi.category)
        ? 100
        : localClamp(54 + tagOverlap * 12, 45, 86);
      const rankScore = Math.round(
        categoryScore * 0.26 +
        priceScore * 0.17 +
        waitScore * 0.22 +
        distanceScore * 0.13 +
        ratingScore * 0.10 +
        peerScore * 0.12
      );
      const reasons = [
        sameSubCategory ? "品类高度相似" : sameCategory ? "场景一致" : "兴趣标签接近",
        `等待 ${poi.wait_time_min} 分钟`,
        `人均 ¥${poi.avg_price}`,
        peerScore >= 90 ? "对方偏好也匹配" : "双方条件可接受"
      ];
      return { poi, rankScore, categoryScore, priceScore, waitScore, distanceScore, ratingScore, peerScore, reasons };
    })
    .filter((item) => item.rankScore >= 48)
    .sort((a, b) => b.rankScore - a.rankScore || a.poi.wait_time_min - b.poi.wait_time_min)
    .slice(0, 5);
}

function replanModalCopy(eventType, match) {
  if (eventType === "waiting_time_change") {
    const nextWait = Math.max((match.poi.wait_time_min || 0) + 22, 35);
    return {
      title: "排队变长，先让双方选",
      brief: `检测到 ${match.poi.name} 等待时间可能升至 ${nextWait} 分钟。AI 先按相似度筛选候选店，你可以换店，也可以继续等原店。`,
      modeLabel: "低等待优先",
      nextWait
    };
  }
  return {
    title: "换地点候选",
    brief: `AI 根据 ${match.intent.category_preference}、预算、距离、等待时间和对方偏好，筛出更接近当前方案的餐厅。`,
    modeLabel: "相似餐厅排序",
    nextWait: match.poi.wait_time_min
  };
}

function openReplanChooser(eventType, match = appState.selectedMatch, options = {}) {
  if (!match) return;
  const existing = document.getElementById("replanChoiceModal");
  if (existing) existing.remove();
  const copy = replanModalCopy(eventType, match);
  const candidates = rankReplanCandidates(match, eventType);
  const overlay = document.createElement("div");
  overlay.id = "replanChoiceModal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <div>
          <p class="eyebrow">${copy.modeLabel}</p>
          <h2>${copy.title}</h2>
        </div>
        <button class="modal-close" id="closeReplanModal" aria-label="关闭">关闭</button>
      </div>
      <div class="replan-body">
        <div class="replan-context">
          <b>当前方案：${match.poi.name}</b>
          <p>${copy.brief}</p>
          <p class="score-formula">综合分 = 品类相似 26% + 等待友好 22% + 人均相近 17% + 距离 13% + 评分 10% + 对方偏好 12%</p>
          <div class="candidate-metrics">
            <span>当前等待 ${match.poi.wait_time_min}min</span>
            <span>人均 ¥${match.poi.avg_price}</span>
            <span>${match.intent.social_style}</span>
          </div>
        </div>
        <div class="replan-candidate-list">
          ${candidates.map((item, index) => `
            <article class="replan-candidate">
              <div class="candidate-head">
                <span class="rank-badge">#${index + 1}</span>
                <div>
	                  <b>${item.poi.name}</b>
	                  <p>${item.poi.sub_category} · ${item.poi.distance_km}km · ${item.poi.rating}分</p>
	                </div>
	                <strong><span>综合</span>${item.rankScore}<small>分</small></strong>
	              </div>
	              <div class="candidate-metrics">
	                <span>品类相似 ${item.categoryScore}</span>
	                <span>等待友好 ${item.waitScore}</span>
	                <span>人均相近 ${item.priceScore}</span>
	                <span>对方偏好 ${item.peerScore}</span>
	              </div>
              <p class="candidate-reason">${item.reasons.join(" · ")}</p>
              <button class="primary-button wide" data-choose-replan="${index}">选择并发给对方确认</button>
            </article>
          `).join("") || `<p class="empty">当前没有足够接近的候选店，可以继续保留原方案。</p>`}
        </div>
        ${eventType === "waiting_time_change" ? `
          <div class="wait-choice-row">
            <button class="secondary-button wide" id="keepWaitingBtn">继续等原店</button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("closeReplanModal").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  overlay.querySelectorAll("[data-choose-replan]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = candidates[Number(button.dataset.chooseReplan)];
      if (!item) return;
      overlay.remove();
      commitReplanChoice(match, item, eventType, options);
    });
  });
  const keepWaitingBtn = document.getElementById("keepWaitingBtn");
  if (keepWaitingBtn) {
    keepWaitingBtn.addEventListener("click", () => {
      overlay.remove();
      keepOriginalPlanAfterWait(match, copy.nextWait, options);
    });
  }
}

function commitReplanChoice(match, item, eventType, options = {}) {
  const nextMatch = {
    ...match,
    poi: item.poi,
    backup_poi: findDealBackup(item.poi),
    suggested_time: eventType === "waiting_time_change" ? match.suggested_time : match.suggested_time,
    replanning_notice: `AI 相似度排序 #${options.resultIndex !== undefined ? "A" : "1"}：已选择 ${item.poi.name}（${item.rankScore}分）。${item.reasons.join("，")}。`
  };
  if (options.resultIndex !== undefined) {
    appState.matchResults[options.resultIndex] = nextMatch;
    appState.replanningNotice = nextMatch.replanning_notice;
    render();
    return;
  }
  appState.selectedMatch = nextMatch;
  appState.depositLocked = false;
  appState.depositAgreementChecked = false;
  appState.fallbackSuggestion = "";
  appState.replanningNotice = nextMatch.replanning_notice;
  setPlanStatus(PLAN_STATUS.NEGOTIATING);
  appState.chatThread.messages.push({ sender: "user_current", text: `我想换到 ${item.poi.name}，发给你确认一下。`, timestamp: nowTime() });
  appState.chatThread.messages.push({ sender: "ai", text: nextMatch.replanning_notice, timestamp: nowTime() });
  appState.chatThread.messages.push({ sender: "matched_user", text: "这个候选我也可以，价格和距离都还行。", timestamp: nowTime() });
  render();
}

function keepOriginalPlanAfterWait(match, nextWait, options = {}) {
  const updatedPoi = { ...match.poi, wait_time_min: nextWait };
  const nextMatch = {
    ...match,
    poi: updatedPoi,
    replanning_notice: `已保留 ${match.poi.name}，预计等待 ${nextWait} 分钟。AI 未替你换店，只记录双方选择继续等待。`
  };
  if (options.resultIndex !== undefined) {
    appState.matchResults[options.resultIndex] = nextMatch;
    appState.replanningNotice = nextMatch.replanning_notice;
    render();
    return;
  }
  appState.selectedMatch = nextMatch;
  appState.depositLocked = false;
  appState.depositAgreementChecked = false;
  appState.replanningNotice = nextMatch.replanning_notice;
  setPlanStatus(PLAN_STATUS.NEGOTIATING);
  appState.chatThread.messages.push({ sender: "user_current", text: `我们先继续等 ${match.poi.name}。`, timestamp: nowTime() });
  appState.chatThread.messages.push({ sender: "ai", text: nextMatch.replanning_notice, timestamp: nowTime() });
  render();
}

function joinDemand(demandId) {
  const demand = buddyDemands.find((d) => d.demand_id === demandId);
  if (!demand) { showToast("找不到这一局"); return; }
  const poi = pois.find((p) => p.poi_id === demand.poi_id);
  const allUsers = [...users, ...backgroundUsers];
  const user = allUsers.find((u) => u.user_id === demand.user_id);
  if (!poi || !user) { showToast("局信息获取失败"); return; }
  const t = nowTime();
  const gc = {
    group_id: `gc_join_${Date.now()}`,
    name: `${poi.name} · ${demand.activity_type}`,
    members: [
      { nickname: "我", isMe: true },
      { nickname: user.nickname, verified: user.verified_status }
    ],
    poi,
    suggested_time: demand.target_time,
    createdAt: t,
    messages: [
      { sender: "system", text: `成局：${demand.target_time} 一起去 ${poi.name}`, timestamp: t },
      { sender: "matched_user", text: "好的，到时候见！", timestamp: t },
      { sender: "ai", text: `已为你们确认约局，记得准时出发！`, timestamp: t }
    ]
  };
  appState.groupChats.push(gc);
  appState.viewingGroupChatId = gc.group_id;
  closeCirclePage();
  setPage("chat");
}

function buildGroupChat(match) {
  const t = nowTime();
  return {
    group_id: `gc_${Date.now()}`,
    name: `${match.poi.name} · ${match.intent.activity_type}`,
    members: [
      { nickname: "我", isMe: true },
      { nickname: match.user.nickname, verified: match.user.verified_status }
    ],
    poi: match.poi,
    suggested_time: match.suggested_time,
    createdAt: t,
    messages: [
      { sender: "system", text: `成局：${match.suggested_time} 一起去 ${match.poi.name}`, timestamp: t },
      { sender: "matched_user", text: "太好了，待会见", timestamp: t },
      { sender: "ai", text: `已为你们确认约局，记得准时出发！导航和团购券在成功页。`, timestamp: t }
    ]
  };
}

function renderMessage(message) {
  const cls = message.sender === "user_current" ? "me" : message.sender === "ai" ? "ai" : "other";
  const meta = message.ai_generated ? "AI 模拟对方" : message.timestamp;
  return `<div class="message ${cls} ${message.pending ? "is-pending" : ""}"><span>${escapeHTML(message.text)}</span><small>${escapeHTML(meta || "")}</small></div>`;
}

function confirmMatch() {
  if (appState.pendingSuccess || appState.planStatus === PLAN_STATUS.CONFIRMED) return;
  if (!appState.depositLocked) {
    appState.depositSheetVisible = true;
    setPlanStatus(PLAN_STATUS.PENDING_LOCK);
    render();
    return;
  }
  setPlanStatus(PLAN_STATUS.LOCKED_WAITING_PEER);
  appState.currentUserConfirmed = true;
  appState.chatThread.current_user_confirmed = true;
  appState.chatThread.messages.push({ sender: "user_current", text: "我确认这个方案，等你的回复～", timestamp: nowTime() });
  render();
}

function simulatePeerConfirm() {
  if (appState.planStatus !== PLAN_STATUS.LOCKED_WAITING_PEER) return;
  setPlanStatus(PLAN_STATUS.CONFIRMED);
  appState.matchedUserConfirmed = true;
  appState.pendingSuccess = true;
  appState.chatThread.matched_user_confirmed = true;
  appState.chatThread.messages.push({ sender: "matched_user", text: "我也确认，待会见！", timestamp: nowTime() });
  const gc = buildGroupChat(appState.selectedMatch);
  appState.groupChats.push(gc);
  render();
  setTimeout(() => {
    appState.pendingSuccess = false;
    appState.currentPage = "success";
    render();
  }, 800);
}

function simulatePeerReject() {
  if (appState.planStatus !== PLAN_STATUS.LOCKED_WAITING_PEER) return;
  appState.chatThread.messages.push({ sender: "matched_user", text: "抱歉，我临时有事来不了了。", timestamp: nowTime() });
  rematchAfterReject();
}

function simulatePeerTimeout() {
  if (appState.planStatus !== PLAN_STATUS.LOCKED_WAITING_PEER) return;
  appState.chatThread.messages.push({ sender: "ai", text: "对方超过 10 分钟未确认，系统已自动为你查找候补搭子。", timestamp: nowTime() });
  rematchAfterReject();
}

function showSafetyPanel() {
  let overlay = document.getElementById("safetyPanelOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "safetyPanelOverlay";
    document.body.appendChild(overlay);
  }
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-sheet" style="border-radius:18px 18px 0 0;align-self:flex-end;max-width:460px;">
      <h3 style="margin:4px 0 12px;">安全选项</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button class="secondary-button" id="safetyShare" style="text-align:left;padding:12px 14px;">
          <b>📍 开启行程共享</b><br/>
          <span style="font-size:12px;color:#6b7280;">将本次出行位置实时分享给紧急联系人</span>
        </button>
        <button class="secondary-button" id="safetyContact" style="text-align:left;padding:12px 14px;">
          <b>📞 通知紧急联系人</b><br/>
          <span style="font-size:12px;color:#6b7280;">发送一键提醒消息，告知今晚行程安排</span>
        </button>
        <button class="secondary-button" id="safetyReport" style="text-align:left;padding:12px 14px;">
          <b>🚨 举报 / 求助</b><br/>
          <span style="font-size:12px;color:#6b7280;">遇到异常情况可一键联系美团安全团队</span>
        </button>
      </div>
      <button class="secondary-button" id="closeSafetyPanel" style="margin-top:14px;width:100%;">关闭</button>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.getElementById("safetyShare").onclick = () => { showToast("行程共享已开启，紧急联系人将实时收到位置"); overlay.remove(); };
  document.getElementById("safetyContact").onclick = () => { showToast("已发送提醒消息给紧急联系人"); overlay.remove(); };
  document.getElementById("safetyReport").onclick = () => { showToast("已连接美团安全支持团队"); overlay.remove(); };
  document.getElementById("closeSafetyPanel").onclick = () => overlay.remove();
}

function applyReplan(eventType) {
  openReplanChooser(eventType);
}

function renderRejectRematchCard() {
  const r = appState.lastRejectRematch;
  if (!r || appState.planStatus !== PLAN_STATUS.FALLBACK_READY) return "";
  const bd = r.next?.score_breakdown || {};
  return `
    <section class="card" style="margin-top:8px;background:#f8fafc;">
      <p class="eyebrow">拒人重算（B → 候补）</p>
      <p style="margin:6px 0;font-size:13px;">排除 <b>${escapeHTML(r.prevNickname)}</b>（${r.prevScore}%）→ 推荐 <b>${escapeHTML(r.next.user.nickname)}</b> @ ${escapeHTML(r.next.poi.name)}（${r.next.total_score}%）</p>
      <div class="breakdown" style="margin-top:8px;">
        ${Object.entries(bd).slice(0, 6).map(([key, value]) => `<div><span>${breakdownLabel(key)}</span><b>${value}</b></div>`).join("")}
      </div>
    </section>
  `;
}

function formatBreakdownLine(breakdown) {
  if (!breakdown) return "";
  return Object.entries(breakdown)
    .slice(0, 6)
    .map(([key, value]) => `${breakdownLabel(key)} ${value}`)
    .join(" · ");
}

async function rematchAfterReject() {
  if (!appState.selectedMatch || !appState.chatThread) return;
  const rejectedUserId = appState.selectedMatch.user.user_id;
  const prevNickname = appState.selectedMatch.user.nickname;
  const prevScore = appState.selectedMatch.total_score;
  if (!appState.excludedUserIds.includes(rejectedUserId)) appState.excludedUserIds.push(rejectedUserId);

  setPlanStatus(PLAN_STATUS.REJECTED);
  appState.depositLocked = false;
  appState.chatThread.messages.push({ sender: "matched_user", text: "我这边临时有事，这局先不过去了。", timestamp: nowTime() });

  rerunMatching({ excludeUserIds: [rejectedUserId] });
  const next = appState.matchResults[0];
  if (next) {
    appState.pendingFallbackMatch = { ...next, intent: appState.parsedIntent };
    appState.lastRematchNote = formatBreakdownLine(next.score_breakdown);
    appState.lastRejectRematch = { prevNickname, prevScore, next };
    appState.fallbackSuggestion = `AI 已排除 ${prevNickname}，重算推荐 ${next.user.nickname} @ ${next.poi.name}：${prevScore}% → ${next.total_score}%。`;
    appState.chatThread.messages.push({
      sender: "ai",
      text: `${appState.fallbackSuggestion} 重算维度：${appState.lastRematchNote}`,
      timestamp: nowTime()
    });
    setPlanStatus(PLAN_STATUS.FALLBACK_READY);
  } else {
    appState.pendingFallbackMatch = null;
    appState.lastRejectRematch = null;
    appState.fallbackSuggestion = "暂无候补，建议放宽时间或预算后重新匹配。";
    appState.chatThread.messages.push({ sender: "ai", text: appState.fallbackSuggestion, timestamp: nowTime() });
  }
  render();
  if (next) {
    await directorChatIntervention("reject_rematch", {
      rejected_nickname: prevNickname,
      from_score: prevScore,
      to_score: next.total_score,
      to_user: next.user.nickname,
      to_poi: next.poi.name
    });
    render();
  }
}

function simulateMatchReject() {
  rematchAfterReject();
}

function acceptFallbackMatch() {
  const next = appState.pendingFallbackMatch || appState.matchResults[0];
  if (!next) {
    showToast("暂无候补方案");
    return;
  }
  appState.selectedMatch = { ...next, intent: appState.parsedIntent };
  appState.debugMeta = appState.selectedMatch.concurrency || appState.debugMeta;
  appState.chatThread = buildChatThread(appState.selectedMatch);
  appState.fallbackSuggestion = "";
  appState.pendingFallbackMatch = null;
  appState.lastRejectRematch = null;
  appState.replanningNotice = "";
  setPlanStatus(PLAN_STATUS.NEGOTIATING);
  showToast(`已接受候补：${next.user.nickname}`);
  render();
}

async function handleNegotiationRematch(kind) {
  if (!appState.selectedMatch || !appState.chatThread) return;
  const labels = { budget: "预算有点高", time: "时间短一点" };
  appState.chatThread.messages.push({ sender: "user_current", text: labels[kind], timestamp: nowTime() });
  setPlanStatus(PLAN_STATUS.NEGOTIATING);
  render();

  await sleep(1100);
  appState.chatThread.messages.push({
    sender: "matched_user",
    text: kind === "budget" ? "可以，那我们都控一下人均，别太贵就行。" : "可以，我们早点见，别排太久。",
    timestamp: nowTime()
  });
  render();

  if (kind === "budget") {
    appState.parsedIntent = {
      ...appState.parsedIntent,
      budget_max: Math.max(15, Math.round(appState.parsedIntent.budget_max * 0.85)),
      budget_min: Math.max(5, Math.round((appState.parsedIntent.budget_min || 10) * 0.85))
    };
  } else {
    appState.parsedIntent = {
      ...appState.parsedIntent,
      target_time: "现在",
      distance_tolerance_km: Math.min(appState.parsedIntent.distance_tolerance_km || 3, 1.5)
    };
  }

  const prevUserId = appState.selectedMatch.user.user_id;
  const baseMatch = { ...appState.selectedMatch, intent: appState.parsedIntent };
  rerunMatching();

  let next = appState.matchResults.find((m) => m.user.user_id !== prevUserId) || appState.matchResults[0];
  if (kind === "budget" && baseMatch) {
    const ranked = rankReplanCandidates(baseMatch, "change_place");
    if (ranked[0]) {
      next = {
        ...baseMatch,
        poi: ranked[0].poi,
        place_score: ranked[0].rankScore,
        backup_poi: findDealBackup(ranked[0].poi),
        total_score: Math.max(baseMatch.total_score - 4, 62),
        explanation: `双方同意降低预算，AI 换到人均更低、等待 ${ranked[0].poi.wait_time_min} 分钟的 ${ranked[0].poi.name}。`
      };
    }
  } else if (kind === "time" && appState.matchResults.length) {
    next = [...appState.matchResults].sort((a, b) => a.poi.wait_time_min - b.poi.wait_time_min)[0];
    next = { ...next, intent: appState.parsedIntent, explanation: `双方同意提早见面，优先推荐等待 ${next.poi.wait_time_min} 分钟的 ${next.poi.name}。` };
  }

  if (next) {
    appState.selectedMatch = { ...next, intent: appState.parsedIntent };
    appState.debugMeta = appState.selectedMatch.concurrency || appState.debugMeta;
    appState.replanningNotice = kind === "budget"
      ? `已按更低预算重排，推荐 ${next.poi.name}（¥${next.poi.avg_price}）。`
      : `已按更早时段重排，推荐等待 ${next.poi.wait_time_min} 分钟的 ${next.poi.name}。`;
    appState.chatThread.messages.push({
      sender: "ai",
      text: `规则层已重算：推荐 ${next.user.nickname} @ ${next.poi.name}（${next.total_score}%）。${next.explanation}`,
      timestamp: nowTime()
    });
  }
  render();
  await directorChatIntervention(kind === "budget" ? "budget_rematch" : "time_rematch", {
    kind,
    budget_max: appState.parsedIntent?.budget_max,
    target_time: appState.parsedIntent?.target_time
  });
  render();
}

function sendChatMessage() {
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text || !appState.chatThread) return;
  appState.chatThread.messages.push({ sender: "user_current", text, timestamp: nowTime() });
  if (appState.planStatus === PLAN_STATUS.MATCHED) setPlanStatus(PLAN_STATUS.NEGOTIATING);
  input.value = "";
  render();
  appendAIPeerReply(text);
}

function handleQuickReply(text) {
  if (text === "想换一家") {
    applyReplan("change_place");
    return;
  }
  if (text === "预算有点高") {
    handleNegotiationRematch("budget");
    return;
  }
  if (text === "时间短一点") {
    handleNegotiationRematch("time");
    return;
  }
  if (text === "直接确认") {
    confirmMatch();
    return;
  }
  appState.chatThread.messages.push({ sender: "user_current", text, timestamp: nowTime() });
  render();
  appendAIPeerReply(text);
}

function renderSuccessPage() {
  if (!appState.selectedMatch) return;
  const deal = appState.selectedDeal || getDeal(appState.selectedMatch.poi.poi_id);
  const dealRank = rankDealCandidates(appState.selectedMatch)[0];
  const selectedDealText = appState.selectedDeal
    ? `双方已选择：${appState.selectedDeal.title}`
    : `待选择，AI 当前推荐：${dealRank ? dealRank.deal.title : deal.title}`;
  $("#successPage").innerHTML = `
    <section class="success-card card">
      <div class="success-mark">✓</div>
      <h1>成局成功</h1>
      <div class="final-plan-card">
        <p><b>搭子昵称</b><span>${appState.selectedMatch.user.nickname}</span></p>
        <p><b>地点名称</b><span>${appState.selectedMatch.poi.name}</span></p>
        <p><b>时间</b><span>${appState.selectedMatch.suggested_time}</span></p>
        <p><b>人数</b><span>${appState.selectedMatch.intent.group_size}</span></p>
        <p><b>预算</b><span>¥${appState.selectedMatch.intent.budget_min}–${appState.selectedMatch.intent.budget_max}</span></p>
        <p><b>距离</b><span>${appState.selectedMatch.poi.distance_km}km</span></p>
      </div>
      <p style="margin-top:8px;font-size:13px;color:${appState.depositLocked ? "#15803d" : "#6b7280"};">
        诚意金状态：${appState.depositLocked ? "已锁定（满足成局前置条件）" : "已解锁（发生改约/拒绝后释放）"}
      </p>
      <div class="fulfillment-timeline card" style="margin-top:10px;padding:12px;">
        <p class="eyebrow" style="margin-bottom:8px;">成局履约时间线</p>
        <ol class="timeline-list">
          <li class="${appState.depositLocked ? "done" : ""}">锁定诚意金 / 支付意愿</li>
          <li class="done">双方确认方案</li>
          <li>选择并购买团购券</li>
          <li>导航到店 · 核销</li>
          <li>解冻诚意金 · 信誉 +2</li>
        </ol>
      </div>
      <div class="deal-box">
        <b>${selectedDealText}</b>
        <p>${deal.deal_type} · 原价 ¥${deal.original_price} · 优惠价 ¥${deal.discount_price} · 省 ¥${Math.max(0, deal.original_price - deal.discount_price)}</p>
        <p>适合 ${deal.suitable_group_size} · ${deal.valid_time}</p>
      </div>
      <button class="primary-button wide" id="enterGroupChat">进入群聊</button>
      <button class="primary-button wide" id="chooseDeal">AI 排序选择团购券</button>
      <button class="primary-button wide" id="buyDeal">${appState.selectedDeal ? "购买已选团购券" : "先选择团购券"}</button>
      <div class="success-secondary-row">
        <button class="secondary-button" id="viewRoute">导航出发</button>
        <button class="secondary-button" id="addCalendar">加入日历</button>
        <button class="secondary-button" id="shareBuddy">分享</button>
      </div>
      <p class="platform-value">从搭子匹配到到店转化，完成 Local Life Coordination 闭环。</p>
    </section>
  `;
  const lastGC = appState.groupChats[appState.groupChats.length - 1];
  $("#enterGroupChat").addEventListener("click", () => {
    if (lastGC) {
      appState.selectedMatch = null;
      appState.viewingGroupChatId = lastGC.group_id;
    }
    setPage("chat");
  });
  $("#chooseDeal").addEventListener("click", () => openDealRankChooser());
  $("#buyDeal").addEventListener("click", () => {
    if (!appState.selectedDeal) {
      openDealRankChooser();
      return;
    }
    showToast(`模拟购买成功：${appState.selectedDeal.title}`);
  });
  $("#viewRoute").addEventListener("click", () => {
    showPoiNavHint(appState.selectedMatch.poi);
  });
  $("#addCalendar").addEventListener("click", () => showToast("已模拟加入日历"));
  $("#shareBuddy").addEventListener("click", () => showToast("已模拟分享给搭子"));
}

function renderProfilePage() {
  const me = currentUser || { nickname: "小团", reputation_score: 85, completed_plans: 10 };
  const rep = me.reputation_score != null ? me.reputation_score : reputationBadge(me).score;
  const tier = rep >= 85 ? "靠谱搭子" : rep >= 70 ? "良好" : "一般";
  $("#profilePage").innerHTML = `
    <section class="card profile-hero-card">
      <div class="profile-hero-row">
        <div class="profile-avatar-lg">${me.avatar_url ? `<img src="${me.avatar_url}" alt="" />` : me.nickname[0]}</div>
        <div>
          <h2>${me.nickname}</h2>
          <p class="muted">美团已验证 · ${area}</p>
          <p style="margin-top:6px;"><span class="rep-badge rep-lg">信誉 ${rep} · ${tier}</span></p>
        </div>
      </div>
      <div class="profile-stats-row">
        <div><b>${me.completed_plans || 0}</b><span>完成成局</span></div>
        <div><b>${Math.round((1 - (me.no_show_rate || 0.05)) * 100)}%</b><span>准时率</span></div>
        <div><b>${me.peer_rating || 4.8}</b><span>搭子评价</span></div>
      </div>
      <div class="tag-row" style="margin-top:10px;">${(me.interest_labels || []).map((t) => `<span>${t}</span>`).join("")}</div>
    </section>
    <section class="card">
      <p class="eyebrow">信誉分说明</p>
      <p class="muted" style="margin-top:6px;">综合完成率 40% + 准时 35% + 搭子评价 25%，匹配权重约占 5%。</p>
    </section>
    <details class="card">
      <summary style="cursor:pointer;font-weight:600;">开发者：数据健康度</summary>
      <div class="health-list" style="margin-top:10px;">
        <div><span>POI</span><b>${pois.length}</b></div>
        <div><span>核心用户</span><b>${users.length}</b></div>
        <div><span>搭子需求</span><b>${buddyDemands.length}</b></div>
        <div><span>聊天线程</span><b>${chatThreads.length}</b></div>
        <div><span>优惠券</span><b>${deals.length}</b></div>
        <div><span>重规划事件</span><b>${replanningEvents.length}</b></div>
      </div>
    </details>
  `;
}

function getDeal(poiId) {
  const anyPoi = pois.find((p) => p.poi_id === poiId) || gaodePOIs.find((p) => p.poi_id === poiId);
  return deals.find((deal) => deal.poi_id === poiId) || {
    deal_id: `fallback_${poiId}`,
    poi_id: poiId,
    deal_type: anyPoi && anyPoi.category === "KTV" ? "多人套餐" : "双人套餐",
    title: anyPoi ? anyPoi.deal_text : "到店享优惠",
    original_price: Math.round((anyPoi ? anyPoi.avg_price : 80) * 2.4),
    discount_price: Math.round((anyPoi ? anyPoi.avg_price : 80) * 1.9),
    suitable_group_size: "2人",
    valid_time: "本日可用",
    conversion_cta: "购买团购券"
  };
}

function targetGroupCount(groupSize) {
  if (/多人|小组|3|4|5/.test(String(groupSize))) return 4;
  return 2;
}

function groupFitScore(deal, groupCount) {
  const text = String(deal.suitable_group_size || "");
  if (groupCount >= 3 && /3|4|多人/.test(text)) return 100;
  if (groupCount <= 2 && /2|双人|1-2/.test(text)) return 100;
  if (/本日|通用|不限/.test(text)) return 82;
  return groupCount >= 3 ? 58 : 68;
}

function buildDealCandidates(match) {
  const poi = match.poi;
  const base = getDeal(poi.poi_id);
  const avg = Number(poi.avg_price) || 80;
  const category = poi.category || "餐厅";
  const variants = [
    base,
    {
      ...base,
      deal_id: `${base.deal_id}_pair`,
      deal_type: "双人套餐",
      title: `${poi.name} 双人到店套餐`,
      original_price: Math.round(avg * 2.4),
      discount_price: Math.round(avg * 1.75),
      suitable_group_size: "2人",
      valid_time: "本日可用",
      conversion_cta: "购买双人券"
    },
    {
      ...base,
      deal_id: `${base.deal_id}_value`,
      deal_type: "低价券",
      title: `${poi.name} 低门槛团购券`,
      original_price: Math.round(avg * 1.35),
      discount_price: Math.round(avg * 0.95),
      suitable_group_size: "1-2人",
      valid_time: "本周可用",
      conversion_cta: "购买低价券"
    },
    {
      ...base,
      deal_id: `${base.deal_id}_group`,
      deal_type: category === "KTV" ? "欢唱多人套餐" : "多人套餐",
      title: `${poi.name} ${category === "KTV" ? "欢唱" : "多人"}成局套餐`,
      original_price: Math.round(avg * 4.2),
      discount_price: Math.round(avg * 3.15),
      suitable_group_size: "3-4人",
      valid_time: "本日可用",
      conversion_cta: category === "KTV" ? "购买欢唱券" : "购买多人券"
    }
  ];
  const seen = new Set();
  return variants.filter((deal) => {
    if (seen.has(deal.deal_id)) return false;
    seen.add(deal.deal_id);
    return true;
  });
}

function rankDealCandidates(match) {
  const groupCount = targetGroupCount(match.intent.group_size);
  const budgetMax = Number(match.intent.budget_max) || Number(match.poi.avg_price) || 80;
  const peerPreference = String(match.user.mock_meituan_behavior?.deal_preference || "");
  return buildDealCandidates(match).map((deal) => {
    const saved = Math.max(0, deal.original_price - deal.discount_price);
    const discountRate = deal.original_price ? saved / deal.original_price : 0;
    const perPerson = Math.round(deal.discount_price / Math.max(1, groupCount));
    const groupScore = groupFitScore(deal, groupCount);
    const saveScore = localClamp(Math.round(discountRate * 240), 35, 100);
    const budgetScore = perPerson <= budgetMax ? 100 : localClamp(100 - (perPerson - budgetMax) * 3, 20, 88);
    const timeScore = /本日|今晚/.test(deal.valid_time) ? 100 : 78;
    const poiScore = deal.poi_id === match.poi.poi_id ? 100 : 70;
    const preferenceScore = /低价/.test(peerPreference) && /低价|双人/.test(deal.deal_type)
      ? 100
      : /套餐|团购/.test(peerPreference) && /套餐|团购/.test(deal.deal_type)
        ? 94
        : 78;
    const rankScore = Math.round(
      groupScore * 0.25 +
      saveScore * 0.25 +
      budgetScore * 0.20 +
      timeScore * 0.12 +
      preferenceScore * 0.10 +
      poiScore * 0.08
    );
    return {
      deal,
      rankScore,
      groupScore,
      saveScore,
      budgetScore,
      timeScore,
      preferenceScore,
      poiScore,
      saved,
      perPerson,
      reasons: [
        `适合 ${deal.suitable_group_size}`,
        `预计人均 ¥${perPerson}`,
        `立省 ¥${saved}`,
        preferenceScore >= 90 ? "命中对方券偏好" : "双方可接受"
      ]
    };
  }).sort((a, b) => b.rankScore - a.rankScore || b.saved - a.saved);
}

function openDealRankChooser() {
  if (!appState.selectedMatch) return;
  const existing = document.getElementById("dealRankModal");
  if (existing) existing.remove();
  const ranked = rankDealCandidates(appState.selectedMatch);
  const overlay = document.createElement("div");
  overlay.id = "dealRankModal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <div>
          <p class="eyebrow">团购券 AI Rank</p>
          <h2>锁定后选择团购券</h2>
        </div>
        <button class="modal-close" id="closeDealRankModal" aria-label="关闭">关闭</button>
      </div>
      <div class="replan-body">
        <div class="replan-context">
          <b>${appState.selectedMatch.poi.name} · ${appState.selectedMatch.intent.group_size}</b>
          <p>成局锁定后，AI 按双方人数、预算、节省金额、有效期和对方券偏好排序，先让双方选券，再进入购买。</p>
          <p class="score-formula">综合分 = 人数适配 25% + 节省力度 25% + 人均预算 20% + 有效时间 12% + 对方偏好 10% + 地点匹配 8%</p>
        </div>
        <div class="replan-candidate-list">
          ${ranked.map((item, index) => `
            <article class="replan-candidate deal-rank-card ${appState.selectedDeal && appState.selectedDeal.deal_id === item.deal.deal_id ? "is-selected" : ""}">
              <div class="candidate-head">
                <span class="rank-badge">#${index + 1}</span>
                <div>
                  <b>${item.deal.title}</b>
                  <p>${item.deal.deal_type} · ${item.deal.valid_time} · ${item.deal.suitable_group_size}</p>
                </div>
                <strong><span>综合</span>${item.rankScore}<small>分</small></strong>
              </div>
              <div class="candidate-metrics">
                <span>人数 ${item.groupScore}</span>
                <span>节省 ${item.saveScore}</span>
                <span>预算 ${item.budgetScore}</span>
                <span>偏好 ${item.preferenceScore}</span>
              </div>
              <p class="candidate-reason">原价 ¥${item.deal.original_price} · 券后 ¥${item.deal.discount_price} · 省 ¥${item.saved} · ${item.reasons.join(" · ")}</p>
              <button class="primary-button wide" data-choose-deal="${index}">${appState.selectedDeal && appState.selectedDeal.deal_id === item.deal.deal_id ? "已选这张券" : "选择并发给对方确认"}</button>
            </article>
          `).join("")}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("closeDealRankModal").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  overlay.querySelectorAll("[data-choose-deal]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = ranked[Number(button.dataset.chooseDeal)];
      if (!item) return;
      appState.selectedDeal = item.deal;
      if (appState.chatThread) {
        appState.chatThread.messages.push({ sender: "user_current", text: `我选 ${item.deal.title}，券后 ¥${item.deal.discount_price}。`, timestamp: nowTime() });
        appState.chatThread.messages.push({ sender: "ai", text: `团购券 Rank #${ranked.indexOf(item) + 1}：综合 ${item.rankScore} 分。${item.reasons.join("，")}。`, timestamp: nowTime() });
        appState.chatThread.messages.push({ sender: "matched_user", text: "这张可以，人数和价格都合适。", timestamp: nowTime() });
      }
      overlay.remove();
      showToast("已发送团购券给对方确认");
      render();
    });
  });
}

function findDealBackup(poi) {
  const allPOIs = gaodePOIs.length ? gaodePOIs : pois;
  return allPOIs.filter((c) => c.poi_id !== poi.poi_id && c.category === poi.category).sort((a, b) => a.wait_time_min - b.wait_time_min)[0];
}

function isPoiCompatible(intent, poi) {
  if (!poi) return false;
  return activityFitsPoi(intent.activity_type, poi);
}

function breakdownLabel(key) {
  return ({
    time: "时间",
    distance: "距离",
    budget: "预算",
    category: "品类",
    social_style: "社交",
    interest: "兴趣",
    place: "地点",
    reputation: "信誉",
    time_feasibility: "成局可行",
    wait: "等待",
    price: "人均",
    rating: "评分",
    heat: "热度"
  })[key] || key;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function showToast(message) {
  appState.toast = message;
  renderToast();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    appState.toast = "";
    renderToast();
  }, 1800);
}

function renderDepositSheet() {
  let sheet = document.getElementById("depositSheetOverlay");
  if (!appState.depositSheetVisible) {
    if (sheet) sheet.remove();
    return;
  }
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "depositSheetOverlay";
    document.body.appendChild(sheet);
  }
  sheet.className = "modal-overlay";
  const poi = appState.selectedMatch?.poi;
  const depositAmt = 9.9;
  sheet.innerHTML = `
    <div class="modal-sheet" style="border-radius:18px 18px 0 0;align-self:flex-end;max-width:460px;">
      <h3 style="margin:4px 0 4px;">支付意愿锁定</h3>
      <p style="font-size:12px;color:#9ca3af;margin-bottom:12px;">本次成局的诚意担保（演示）</p>
      <div style="background:#f8fafc;border-radius:12px;padding:12px 14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;">
          <span>诚意金金额</span><b>¥${depositAmt.toFixed(1)}</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;">
          <span>目标地点</span><span>${poi ? poi.name : "待定"}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;">
          <span>冻结方式</span><span>美团钱包预授权</span>
        </div>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px;line-height:1.7;">
        <b>退款规则（模拟）</b><br/>
        · 双方到店核销后：诚意金全额解冻退回<br/>
        · 约定 T-30 分钟前取消：全额退回，无责任<br/>
        · T-30 分钟内单方取消：扣除 50%（¥${(depositAmt * 0.5).toFixed(1)})，对方获得补偿券<br/>
        · 爽约方承担全额扣除，另收 10 分信誉扣分
      </div>
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-bottom:12px;">
        <input type="checkbox" id="depositAgreement" ${appState.depositAgreementChecked ? "checked" : ""} style="margin-top:2px;" />
        我已阅读并同意冻结 ¥${depositAmt.toFixed(1)} 诚意金，用于锁定本次成局意愿
      </label>
      <div style="display:flex;gap:8px;">
        <button class="secondary-button" id="cancelDepositSheet" style="flex:1;">再想想</button>
        <button class="primary-button" id="confirmDepositSheet" style="flex:1;" ${appState.depositAgreementChecked ? "" : "disabled"}>锁定并继续</button>
      </div>
    </div>
  `;
  sheet.onclick = (event) => {
    if (event.target === sheet) {
      appState.depositSheetVisible = false;
      if (appState.planStatus === PLAN_STATUS.PENDING_LOCK) setPlanStatus(PLAN_STATUS.MATCHED);
      render();
    }
  };
  const agreement = document.getElementById("depositAgreement");
  agreement.onchange = (event) => {
    appState.depositAgreementChecked = event.target.checked;
    renderDepositSheet();
  };
  document.getElementById("cancelDepositSheet").onclick = () => {
    appState.depositSheetVisible = false;
    if (appState.planStatus === PLAN_STATUS.PENDING_LOCK) setPlanStatus(PLAN_STATUS.MATCHED);
    render();
  };
  document.getElementById("confirmDepositSheet").onclick = () => {
    if (!appState.depositAgreementChecked) return;
    appState.depositLocked = true;
    appState.depositSheetVisible = false;
    showToast("诚意金意愿已锁定（演示态）");
    confirmMatch();
  };
}

function renderToast() {
  let toast = $("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = appState.toast;
  toast.className = appState.toast ? "toast is-show" : "toast";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

init();
