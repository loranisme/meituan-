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
  lastRejectRematch: null,
  selectedCircleId: lifeCircles[0]?.id || "near",
  circlePageOpen: false,
  browseRadiusKm: 2,
  circleTimeSlot: "now"
};

window.appState = appState;

let gaodePOIs = [];
let mockMapReady = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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

function selectLifeCircle(circleId) {
  appState.selectedCircleId = circleId;
  const circle = getCurrentCircle();
  appState.browseRadiusKm = circle.radius_km || 2;
  gaodePOIs = filteredMockPois(appState.selectedCategory);
  appState.selectedPOI = gaodePOIs[0] || pois[0] || null;
  closeCirclePage();
  updateAreaPill();
  if (appState.currentPage === "map") {
    refreshMapSupply();
  } else {
    render();
  }
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
  results = applyPoiConstraintToResults(results).map((result, index) => {
    const concurrency = buildConcurrencyMeta(index);
    logConcurrencyMeta(concurrency);
    return { ...result, intent: appState.parsedIntent, concurrency };
  });
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
  if (page === "chat" && !appState.selectedMatch) {
    appState.currentPage = "ai";
  } else {
    appState.currentPage = page;
  }
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

function flatMapZonesHTML(classPrefix = "", options = {}) {
  const p = classPrefix ? `${classPrefix} ` : "";
  const z = MAP_LAYOUT.zones || {};
  const eatPulse = options.pulseEat ? " map-zone-pulse" : "";
  return `
    <div class="${p}map-zone map-zone-eat${eatPulse}"><span>${escapeHTML(z.eat?.label || "餐饮")}</span></div>
    <div class="${p}map-zone map-zone-sport"><span>${escapeHTML(z.sport?.label || "运动")}</span></div>
    <div class="${p}map-zone map-zone-board"><span>${escapeHTML(z.board?.label || "桌游")}</span></div>
    <div class="${p}map-zone map-zone-play"><span>${escapeHTML(z.play?.label || "文娱")}</span></div>
    <div class="${p}map-road road-main" aria-hidden="true"></div>
    <div class="${p}map-road road-cross" aria-hidden="true"></div>
    <div class="user-location-pin map-user-pin" style="left:${MAP_LAYOUT.user_pin.x}%;top:${MAP_LAYOUT.user_pin.y}%"></div>
    <div class="user-radius" style="left:${MAP_LAYOUT.user_pin.x}%;top:${MAP_LAYOUT.user_pin.y}%;width:28%;height:28%"></div>
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

function renderCirclePage() {
  let page = document.getElementById("circlePage");
  if (page) page.remove();
  const current = getCurrentCircle();
  const stats = circleStats(current);
  const livePeople = [...users, ...backgroundUsers].slice(0, 5);
  const moments = circleMoments(current);
  const hotPois = circleHotPois(current);
  const inspires = circleInspirePrompts(current);
  const browsing = stats.active + stats.buddies + 12;
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
      <h1>我的生活圈</h1>
    </header>
    <div class="circle-page-body">
      <section class="circle-hero" style="--circle-tint:${current.tint}">
        <div class="circle-pulse-bar">
          <span><span class="live-dot"></span> ${browsing} 人正逛这个圈</span>
          <span class="circle-weather">${circleWeather.temp}° ${escapeHTML(circleWeather.label)}</span>
        </div>
        <b>${escapeHTML(current.name)}</b>
        <p>${escapeHTML(current.tagline)}</p>
        <p class="circle-ad-line">「${escapeHTML(brandSloganLine())}」</p>
        <div class="circle-vibe-row">
          <span>氛围 · ${escapeHTML(current.vibe || "随性")}</span>
          <div class="circle-vibe-bar"><div class="circle-vibe-fill" style="width:${Math.min(95, 40 + stats.buddies * 4)}%"></div></div>
        </div>
        <div class="circle-time-row" id="circleTimeRow">
          ${timeSlots.map((t) => `
            <button type="button" class="circle-time-chip ${appState.circleTimeSlot === t.id ? "is-active" : ""}" data-slot="${t.id}">${t.label}</button>
          `).join("")}
        </div>
        <div class="circle-mini-map">${flatMapZonesHTML("", { pulseEat: true })}</div>
        <p class="muted" style="font-size:11px;margin-top:6px;">${escapeHTML(circleWeather.tip)}</p>
        <div class="circle-card-stats" style="margin-top:10px">
          <span><b>${stats.shops}</b> 家店</span>
          <span><b>${stats.buddies}</b> 人想约</span>
          <span>约 ${appState.browseRadiusKm}km</span>
        </div>
      </section>

      <div class="section-head"><h3>圈子里正在发生</h3></div>
      <div class="circle-moment-list">
        ${moments.map((m) => `
          <button type="button" class="circle-moment" data-poi="${m.poi_id || ""}">
            <div class="circle-moment-head">
              <span class="circle-live-avatar">${escapeHTML(m.avatar)}</span>
              <div><b>${escapeHTML(m.user)}</b> <small>${escapeHTML(m.ago)} · ${escapeHTML(m.time)}</small></div>
            </div>
            <p>${escapeHTML(m.text)}</p>
          </button>
        `).join("")}
      </div>

      <div class="section-head" style="margin-top:14px"><h3>大家在搜什么</h3></div>
      <div class="circle-trend-scroll">
        ${(current.trends || []).map((t) => `<button type="button" class="circle-trend-bubble" data-trend="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join("")}
      </div>

      <div class="section-head" style="margin-top:14px"><h3>常去角落</h3><button type="button" class="linkish" id="circleSeeMap">看地图</button></div>
      <div class="circle-hot-scroll">
        ${hotPois.map((p) => `
          <button type="button" class="circle-hot-card" data-poi="${p.poi_id}">
            <div class="circle-hot-cover" style="background-image:url('${poiCoverImage(p)}')"></div>
            <div class="circle-hot-body">
              <b>${escapeHTML(p.name)}</b>
              <span>${p.buddy_demand_count} 人想找 · ¥${p.avg_price}</span>
            </div>
          </button>
        `).join("")}
      </div>

      <div class="section-head" style="margin-top:14px"><h3>成局灵感</h3><span class="muted" style="font-size:12px;">点一下去匹配</span></div>
      <div class="circle-inspire-grid">
        ${inspires.map((item, i) => `
          <button type="button" class="circle-inspire" data-inspire="${i}">
            <b>${escapeHTML(item.title)}</b>
            <span>${escapeHTML(item.text)}</span>
          </button>
        `).join("")}
      </div>

      <div class="section-head" style="margin-top:14px"><h3>浏览范围</h3></div>
      <div class="radius-row" id="radiusRow">
        ${[2, 3, 5].map((km) => `
          <button type="button" class="radius-chip ${appState.browseRadiusKm === km ? "is-active" : ""}" data-radius="${km}">${km} km</button>
        `).join("")}
      </div>

      <div class="section-head" style="margin-top:14px"><h3>换个生活圈</h3></div>
      <div class="circle-list">
        ${lifeCircles.map((c) => {
          const s = circleStats(c);
          const active = c.id === appState.selectedCircleId;
          return `
            <button type="button" class="circle-card ${active ? "is-active" : ""}" data-circle="${c.id}"
              style="--card-tint:${c.tint};--card-accent:${c.accent}">
              <div class="circle-card-head">
                <span class="circle-card-icon">${escapeHTML(c.shortName[0])}</span>
                <div>
                  <h3>${escapeHTML(c.name)}</h3>
                  <p class="circle-meta">${escapeHTML(c.vibe || "")} · ${escapeHTML(c.tagline)}</p>
                </div>
              </div>
              <div class="circle-card-stats">
                <span><b>${s.shops}</b> 店</span>
                <span><b>${s.buddies}</b> 人想约</span>
              </div>
            </button>
          `;
        }).join("")}
      </div>

      <div class="circle-invite">
        <p style="font-size:14px;font-weight:700;margin-bottom:6px;">把生活圈告诉朋友</p>
        <p class="muted" style="font-size:12px;line-height:1.5;">演示：邀请后可见同一批店与动态，适合线下活动传播。</p>
        <button type="button" class="secondary-button wide" id="circleShare" style="margin-top:10px;min-height:44px">生成邀请卡片</button>
      </div>

      <section class="card circle-live" style="margin-top:12px">
        <p class="eyebrow">可以打个招呼的人</p>
        ${livePeople.map((u) => `
          <div class="circle-live-item">
            <span class="circle-live-avatar">${escapeHTML(u.nickname[0])}</span>
            <div style="flex:1">
              <b>${escapeHTML(u.nickname)}</b>
              <p class="muted" style="font-size:12px;">${escapeHTML(u.social_style || "随性")} · ${u.distance_km || "1.2"}km</p>
            </div>
            <button type="button" class="text-button" data-wave="${escapeHTML(u.user_id || u.nickname)}">打招呼</button>
          </div>
        `).join("")}
        <button type="button" class="primary-button wide" id="circleGoMatch" style="margin-top:12px">用${escapeHTML(brand.name)}匹配一个搭子</button>
      </section>
    </div>
  `;
  document.body.appendChild(page);
  document.body.style.overflow = "hidden";

  page.querySelector("#closeCirclePage").addEventListener("click", closeCirclePage);
  page.querySelectorAll("[data-circle]").forEach((btn) => {
    btn.addEventListener("click", () => selectLifeCircle(btn.dataset.circle));
  });
  page.querySelectorAll("[data-radius]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.browseRadiusKm = Number(btn.dataset.radius);
      gaodePOIs = filteredMockPois(appState.selectedCategory);
      appState.selectedPOI = gaodePOIs[0] || pois[0] || null;
      renderCirclePage();
    });
  });
  page.querySelectorAll("[data-slot]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.circleTimeSlot = btn.dataset.slot;
      renderCirclePage();
    });
  });
  page.querySelectorAll("[data-trend]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.userInput = `想在${getCurrentCircle().shortName}：${btn.dataset.trend}，轻松组局。`;
      closeCirclePage();
      setPage("ai");
      showToast("已填入匹配条件");
    });
  });
  page.querySelectorAll("[data-inspire]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = inspires[Number(btn.dataset.inspire)];
      if (!item) return;
      appState.userInput = item.prompt;
      closeCirclePage();
      setPage("ai");
    });
  });
  page.querySelectorAll(".circle-moment[data-poi], .circle-hot-card[data-poi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poi = pois.find((p) => p.poi_id === btn.dataset.poi);
      if (!poi) return;
      appState.selectedPOI = poi;
      closeCirclePage();
      setPage("map");
    });
  });
  page.querySelector("#circleSeeMap").addEventListener("click", () => {
    closeCirclePage();
    setPage("map");
  });
  page.querySelector("#circleShare").addEventListener("click", () => {
    showToast(`「${brand.name}」${getCurrentCircle().shortName} · ${brand.tagline}（演示分享）`);
  });
  page.querySelectorAll("[data-wave]").forEach((btn) => {
    btn.addEventListener("click", () => showToast("已发送打招呼（演示）"));
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
        <div id="filterTabsRow" class="scene-filter-host"></div>
        <section class="map-block card map-card">
          <div id="mockMapCanvas" class="fake-map" role="img" aria-label="${escapeHTML(getCurrentCircle().name)}平面地图">
            ${flatMapZonesHTML()}
            <div id="mockMapPins" class="map-pins-layer"></div>
          </div>
          <p class="map-layout-legend">${escapeHTML(getCurrentCircle().shortName)} · 平面示意 · 蓝点为你 · 点击气泡看店</p>
        </section>
        <section id="poiSheet" class="merchant-block poi-sheet card"></section>
      </div>
    `;
    initMockMap();
  }
  updateMapStats();
  updateSceneNavigator();
  if (mockMapReady) {
    renderMockMapPins();
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
    appState.selectedPOI = gaodePOIs[0] || pois[0] || null;
  }
  if (mockMapReady) {
    renderMockMapPins();
    updatePOISheet();
    updateMapStats();
    updateSceneNavigator();
  }
}

function initMockMap() {
  if (!appState.selectedCircleId && lifeCircles[0]) appState.selectedCircleId = lifeCircles[0].id;
  gaodePOIs = filteredMockPois(appState.selectedCategory);
  appState.selectedPOI = gaodePOIs[0] || pois[0] || null;
  mockMapReady = true;
  renderMockMapPins();
  updateMapStats();
  updatePOISheet();
}

function renderMockMapPins() {
  const layer = document.getElementById("mockMapPins");
  if (!layer) return;
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });
  layer.innerHTML = gaodePOIs.map((poi) => {
    const isHot = poi.hot_score > 80;
    const isSelected = poi.poi_id === (appState.selectedPOI && appState.selectedPOI.poi_id);
    const matchScore = matchScoreMap[poi.poi_id];
    const sizeClass = poi.buddy_demand_count >= 7 ? "pin-lg" : poi.buddy_demand_count <= 3 ? "pin-sm" : "";
    const x = poi.mapX != null ? poi.mapX : poiMapPercent(poi).x;
    const y = poi.mapY != null ? poi.mapY : poiMapPercent(poi).y;
    return `
      <button type="button" class="map-pin pin-enter ${isHot ? "is-hot" : ""} ${isSelected ? "is-selected" : ""} ${sizeClass}"
        data-poi-id="${poi.poi_id}" data-category="${poi.category}"
        style="left:${x}%;top:${y}%"
        title="${escapeHTML(poi.name)}：${poi.buddy_demand_count} 人想去">
        ${(() => { const g = poiPhotoGradient(poi); return sceneIcon(categoryAbbr(poi), g.accent, g.bg, "xs"); })()}
        <span class="pin-count"><b>${poi.buddy_demand_count}</b><small>人</small></span>
        ${isHot ? "<em>热门</em>" : ""}
        ${matchScore ? `<span class="pin-match">${matchScore}%</span>` : ""}
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

function showPoiNavHint(poi) {
  showToast(`${poi.name} · 步行约 ${Math.round((poi.distance_km || 0.8) * 12)} 分钟`);
}


function updateMapStats() {
  const el = document.getElementById("mapStatsBar");
  if (!el) return;
  const list = gaodePOIs.length ? gaodePOIs : pois;
  const totalBuddy = list.reduce((sum, p) => sum + (p.buddy_demand_count || 0), 0);
  const circle = getCurrentCircle();
  el.innerHTML = `
    <div class="stat-pill is-brand"><b>${escapeHTML(circle.shortName)}</b><span>当前生活圈</span></div>
    <div class="stat-pill is-hot"><b>${totalBuddy}</b><span>人想找搭子</span></div>
    <div class="stat-pill"><b>${users.length + backgroundUsers.length}</b><span>今日活跃</span></div>
    <div class="stat-pill"><b>${list.length}</b><span>圈内地点</span></div>
  `;
  updateAreaPill();
}

function updateSceneNavigator() {
  const el = document.getElementById("filterTabsRow");
  if (!el) return;
  const activeGroupId = activeSceneGroupId();
  const expanded = appState.sceneNavExpanded && activeGroupId;
  const activeGroup = sceneGroups.find((g) => g.id === activeGroupId);
  const totalPeople = poisInCircle(getCurrentCircle()).reduce((s, p) => s + (p.buddy_demand_count || 0), 0);
  el.innerHTML = `
    <section class="scene-nav card">
      <div class="scene-nav-head">
        <div class="scene-nav-copy">
          <p class="eyebrow">附近可组局</p>
          <h3>${escapeHTML(sceneFilterLabel())}</h3>
        </div>
        <button type="button" class="scene-explore-btn" id="openSceneExplorer" aria-label="浏览全部场景">
          <span>全部</span><small>${scenes.length - 1}类</small>
        </button>
      </div>
      <div class="scene-group-grid" role="tablist">
        <button type="button" class="scene-group-tile ${appState.selectedCategory === "全部" ? "is-active" : ""}" data-scene-group="all" style="--accent:#FF6B35;--tint:#FFF4ED">
          ${sceneIcon("全", "#FF6B35", "#FFF4ED")}
          <span class="sg-label">全部</span>
          <span class="sg-meta">${poisInCircle(getCurrentCircle()).length} 店 · ${totalPeople} 人</span>
        </button>
        ${sceneGroups.map((group) => {
          const stats = groupDemandStats(group);
          const isActive = activeGroupId === group.id;
          return `
            <button type="button" class="scene-group-tile ${isActive ? "is-active" : ""}" data-scene-group="${group.id}"
              style="--accent:${group.accent};--tint:${group.tint}">
              ${sceneIcon(sceneGroupAbbr(group), group.accent, group.tint)}
              <span class="sg-label">${group.label}</span>
              <span class="sg-meta">${stats.shops} 店 · ${stats.people} 人</span>
            </button>
          `;
        }).join("")}
      </div>
      <div class="scene-sub-panel ${expanded ? "is-open" : ""}" ${expanded ? "" : 'aria-hidden="true"'}>
        ${activeGroup ? `
          <div class="scene-sub-track">
            ${activeGroup.scenes.map((scene) => {
              const meta = sceneCatalog[scene] || { abbr: scene[0], tagline: scene };
              const stats = sceneDemandStats(scene);
              const isSceneActive = appState.selectedCategory === scene;
              return `
                <button type="button" class="scene-sub-chip ${isSceneActive ? "is-active" : ""}" data-scene="${scene}"
                  style="--accent:${activeGroup.accent}">
                  ${sceneIcon(sceneMetaAbbr(meta), activeGroup.accent, activeGroup.tint, "sm")}
                  <span class="ssc-text">
                    <b>${scene.replace("搭子", "")}</b>
                    <small>${stats.shops} 店 · ${stats.people} 人想找</small>
                  </span>
                </button>
              `;
            }).join("")}
          </div>
        ` : ""}
      </div>
      ${appState.selectedCategory !== "全部" ? `
        <button type="button" class="scene-clear-filter" id="clearSceneFilter">清除筛选 · 看全部 ${poisInCircle(getCurrentCircle()).length} 店</button>
      ` : ""}
    </section>
  `;
  el.querySelector("#openSceneExplorer")?.addEventListener("click", openSceneExplorer);
  el.querySelector("#clearSceneFilter")?.addEventListener("click", () => applySceneFilter("全部"));
  el.querySelectorAll("[data-scene-group]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.sceneGroup;
      if (id === "all") {
        applySceneFilter("全部");
        return;
      }
      if (activeGroupId === id && String(appState.selectedCategory).startsWith("group:")) {
        const group = sceneGroups.find((g) => g.id === id);
        if (group?.scenes[0]) applySceneFilter(group.scenes[0], { expandNav: true });
        return;
      }
      applySceneFilter(`group:${id}`, { expandNav: true });
    });
  });
  el.querySelectorAll("[data-scene]").forEach((btn) => {
    btn.addEventListener("click", () => applySceneFilter(btn.dataset.scene, { expandNav: true }));
  });
}

function openSceneExplorer() {
  let overlay = document.getElementById("sceneExplorer");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "sceneExplorer";
  overlay.className = "scene-explorer-overlay";
  overlay.innerHTML = `
    <div class="scene-explorer-sheet">
      <div class="scene-explorer-grabber" aria-hidden="true"></div>
      <header class="scene-explorer-header">
        <div>
          <p class="eyebrow">本地生活 · 成局场景</p>
          <h2>你想组什么局？</h2>
          <p class="muted">点选后地图只显示相关地点与搭子需求</p>
        </div>
        <button type="button" class="modal-close" id="closeSceneExplorer" aria-label="关闭">关闭</button>
      </header>
      ${sceneGroups.map((group) => `
        <section class="scene-explorer-section">
          <div class="ses-head" style="--accent:${group.accent}">
            ${sceneIcon(sceneGroupAbbr(group), group.accent, group.tint)}
            <div><b>${group.label}</b><small>${group.subtitle}</small></div>
          </div>
          <div class="scene-explorer-grid">
            ${group.scenes.map((scene) => {
              const meta = sceneCatalog[scene] || { abbr: scene[0], tagline: scene };
              const stats = sceneDemandStats(scene);
              const active = appState.selectedCategory === scene;
              return `
                <button type="button" class="scene-explorer-card ${active ? "is-active" : ""}" data-scene="${scene}"
                  style="--accent:${group.accent};--tint:${group.tint}">
                  ${sceneIcon(sceneMetaAbbr(meta), group.accent, group.tint)}
                  <span class="sec-title">${scene.replace("搭子", "")}</span>
                  <span class="sec-tagline">${meta.tagline}</span>
                  <span class="sec-stats"><b>${stats.shops}</b> 店 · <b>${stats.people}</b> 人想找</span>
                </button>
              `;
            }).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
  overlay.querySelector("#closeSceneExplorer").addEventListener("click", closeSceneExplorer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSceneExplorer(); });
  overlay.querySelectorAll("[data-scene]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applySceneFilter(btn.dataset.scene, { expandNav: true });
      closeSceneExplorer();
    });
  });
}

function closeSceneExplorer() {
  const overlay = document.getElementById("sceneExplorer");
  if (!overlay) return;
  overlay.classList.remove("is-visible");
  setTimeout(() => overlay.remove(), 280);
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
  if (!el || !appState.selectedPOI) return;
  const poi = appState.selectedPOI;
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });
  const matchScore = matchScoreMap[poi.poi_id];
  const demands = getFakeDemands(poi);
  const { accent } = poiPhotoGradient(poi);
  el.innerHTML = `
    <div class="merchant-hero" style="background-image:url('${poiCoverImage(poi)}')"></div>
    <div class="merchant-detail-body">
      <div class="sheet-title-row">
        <h2 class="merchant-name">${poi.name}</h2>
        <span class="open-badge">${poi.open_status}</span>
        ${matchScore ? `<span class="sheet-match">${matchScore}% 匹配</span>` : ""}
      </div>
      <div class="merchant-rating-row">
        <span class="rating-num">${poi.rating}</span>
        <span class="rating-star">★</span>
        <span class="muted">· ${poi.sub_category} · 人均 <b style="color:#FF2442">¥${poi.avg_price}</b> · ${poi.distance_km}km</span>
      </div>
      ${poi.address ? `<p class="merchant-address">${poi.address}</p>` : `<p class="merchant-address">${areaShort || area} · 步行约 ${Math.round(poi.distance_km * 12)} 分钟</p>`}
      <p class="merchant-address muted">示意 ${poi.map_zone || areaShort || "商圈"} · ${poi.distance_km}km</p>
      ${poi.business_hours ? `<p class="merchant-address">营业 ${poi.business_hours}</p>` : ""}
      <div class="merchant-chips">
        <span class="mchip wait-chip">等待 ${poi.wait_time_min} 分钟</span>
        ${venueExtraChips(poi)}
        ${poi.tags.slice(0, 2).map((t) => `<span class="mchip">${t}</span>`).join("")}
      </div>
      <div class="deal-bar">
        <span class="deal-tag">团</span>
        <span>${poi.deal_text}</span>
        <span class="deal-off">立省</span>
      </div>
      <div class="merchant-cta-row">
        <button type="button" class="cta-nav-btn" id="poiNavBtn">导航</button>
        <button class="cta-detail-btn" id="viewMerchantDetail">商家详情</button>
      </div>
      <button class="cta-match-btn wide" id="matchFromPoi">找搭子去这里</button>
      <div class="sheet-buddy-row">
        <h3>当前 <span id="buddyCountDisplay">${poi.buddy_demand_count}</span> 人找搭子中</h3>
        <button class="want-go-button" id="wantGoBtn">我也想去 +1</button>
      </div>
      <div class="demand-carousel">
        ${demands.map((d) => `
          <article class="demand-card ${appState.selectedDemandId === d.demand_id ? "is-selected" : ""}" data-demand="${d.demand_id}">
            <div class="dc-avatar">${d.nickname[0]}</div>
            <div>
              <b>${d.nickname}</b>
              <p>${d.time} · ${d.size}</p>
              <small>${d.style} · ${d.note}</small>
            </div>
          </article>
        `).join("") || `<p class="empty" style="padding:8px 0;">这个地点暂无等待中的局，AI 可以帮你发起一个。</p>`}
      </div>
      <button class="secondary-button wide" id="joinFirstDemand" style="margin-top:8px;" ${demands.length ? "" : "disabled"}>加入已有的局</button>
    </div>
  `;
  document.getElementById("matchFromPoi").addEventListener("click", () => {
    appState.userInput = defaultIntentTextForPoi(poi);
    appState.poiConstraint = poi;
    appState.currentPage = "ai";
    appState.parsedIntent = null;
    appState.matchResults = [];
    appState.aiHasRun = false;
    showToast("已将该地点加入 AI 匹配条件");
    render();
    setTimeout(() => runAI(), 450);
  });
  document.getElementById("viewMerchantDetail").addEventListener("click", () => showMerchantModal(poi));
  document.getElementById("poiNavBtn")?.addEventListener("click", () => showPoiNavHint(poi));
  document.getElementById("wantGoBtn").addEventListener("click", () => {
    poi.buddy_demand_count = (poi.buddy_demand_count || 0) + 1;
    const display = document.getElementById("buddyCountDisplay");
    if (display) display.textContent = poi.buddy_demand_count;
    const btn = document.getElementById("wantGoBtn");
    if (btn) { btn.textContent = "已标记"; btn.disabled = true; btn.style.opacity = ".6"; }
    showToast("已加入「想去」，等 AI 帮你找搭子");
  });
  document.getElementById("joinFirstDemand").addEventListener("click", () => {
    const targetDemand = demands.find((d) => d.demand_id === appState.selectedDemandId) || demands[0];
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
  });
  el.querySelectorAll(".demand-card[data-demand]").forEach((card) => {
    card.addEventListener("click", () => {
      appState.selectedDemandId = card.dataset.demand;
      updatePOISheet();
    });
  });
}

function showMerchantModal(poi) {
  let overlay = document.getElementById("merchantModal");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "merchantModal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-hero" style="background-image:url('${poiCoverImage(poi)}')"></div>
      <div class="modal-header">
        <h2>${poi.name}</h2>
        <button class="modal-close" id="closeModal" aria-label="关闭">关闭</button>
      </div>
      <div class="modal-info">
        <div class="modal-info-row"><span>评分</span><b>${poi.rating} / 5.0</b></div>
        <div class="modal-info-row"><span>人均消费</span><b>¥${poi.avg_price}</b></div>
        <div class="modal-info-row"><span>品类</span><b>${poi.sub_category}</b></div>
        <div class="modal-info-row"><span>营业状态</span><b>${poi.open_status}</b></div>
        ${poi.business_hours ? `<div class="modal-info-row"><span>营业时间</span><b>${poi.business_hours}</b></div>` : ""}
        <div class="modal-info-row"><span>当前等待</span><b>${poi.wait_time_min} 分钟</b></div>
        <div class="modal-info-row"><span>距离</span><b>${poi.distance_km}km</b></div>
        ${poi.address ? `<div class="modal-info-row"><span>地址</span><b style="font-size:12px;">${poi.address}</b></div>` : ""}
        ${poi.tel ? `<div class="modal-info-row"><span>电话</span><b>${poi.tel}</b></div>` : ""}
        <div class="modal-info-row"><span>团购优惠</span><b>${poi.deal_text}</b></div>
        ${venueExtraModalRows(poi)}
      </div>
      <div class="modal-actions">
        <button type="button" class="cta-nav-btn" style="flex:1;" id="modalNavBtn">路线示意</button>
        <button class="cta-match-btn" style="flex:1;" id="modalMatchBtn">匹配搭子</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("closeModal").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("modalNavBtn")?.addEventListener("click", () => showPoiNavHint(poi));
  document.getElementById("modalMatchBtn").addEventListener("click", () => {
    overlay.remove();
    appState.userInput = defaultIntentTextForPoi(poi);
    appState.poiConstraint = poi;
    appState.currentPage = "ai";
    appState.parsedIntent = null;
    appState.matchResults = [];
    appState.aiHasRun = false;
    render();
    setTimeout(() => runAI(), 450);
  });
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
  appState.aiAgentError = "";
  appState.aiRuleFallback = false;
  try {
    for (let step = 0; step < 3; step += 1) {
      appState.aiStep = step;
      render();
      await sleep(560 + step * 90);
    }
    appState.parsedIntent = parseIntent(appState.userInput);
    rerunMatching();
    const { availablePOIs } = getMatchSupply();
    await enrichWithAIDirector(availablePOIs);
    if (!appState.matchResults.length) {
      showToast("暂无匹配结果，试试放宽预算或换场景");
    } else if (appState.aiRuleFallback) {
      showToast(`规则层已出 ${appState.matchResults.length} 个方案（未配置 LLM Key 时正常）`);
    }
  } catch (error) {
    console.error("[runAI]", error);
    appState.aiAgentError = error.message || "匹配过程出错";
    appState.aiRuleFallback = true;
    if (!appState.parsedIntent) appState.parsedIntent = parseIntent(appState.userInput || "");
    if (!appState.matchResults.length) rerunMatching();
    showToast("匹配遇到问题，已用规则层重试");
  } finally {
    appState.aiLoading = false;
    appState.aiStep = -1;
    render();
  }
}

function buildRuleOnlyDirectorFallback() {
  return {
    director_brief: "未连接 LLM（请在项目根目录 .env 配置 DEEPSEEK_API_KEY 或 GEMINI_API_KEY）。下方方案由本地规则引擎生成，评分可演示。",
    clarifying_questions: appState.parsedIntent?.parse_confidence < 0.55
      ? ["预算大概多少？", "更想 1v1 还是小组？"]
      : [],
    plan_overrides: appState.matchResults.slice(0, 3).map((match, plan_index) => ({
      plan_index,
      match_id: match.match_id,
      headline: `与 ${match.user.nickname} · ${match.poi.name}`,
      explanation: match.explanation,
      closing_line: "规则层推荐，配置 Key 后可由 Agent 润色",
      risk: "Demo 数据",
      conversion_prompt: match.poi.deal_text || "查看团购",
      score_reason: "本地加权评分"
    })),
    merchant_layer: {
      summary: "Mock 商户字段",
      real_fields: ["name", "rating", "avg_price"],
      simulated_fields: ["buddy_demand_count", "wait_time_min"],
      generated_fields: ["ai_explanation"],
      freshness_label: "规则层 · 无 LLM"
    },
    demo_hooks: ["规则匹配可用", "配置 .env 启用 Agent"]
  };
}

function buildAIDirectorPayload(availablePOIs) {
  return {
    area,
    user_input: appState.userInput,
    parsed_intent: appState.parsedIntent,
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch("/api/ai-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI 请求超时（12s），已切换规则层");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
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
    if (options.toastOnError !== false) showToast("已切换规则层匹配（AI 不可用）");
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

function renderAIPage() {
  $("#aiPage").innerHTML = `
    <section class="card ai-card">
      <p class="eyebrow">智能匹配</p>
      <h2>说说你想怎么玩</h2>
      <textarea id="intentInput">${escapeHTML(appState.userInput)}</textarea>
      <div class="prompt-row">
        <button data-prompt="今晚想找一个人吃韩餐，预算 80 元以内，不想太尴尬，最好轻松聊聊，离我不要太远。">韩餐 1v1</button>
        <button data-prompt="今晚想找几个人去 KTV，人均 100 元以内，气氛热闹一点。">KTV 多人</button>
        <button data-prompt="周末想找安静的人一起喝咖啡学习，预算 40 元以内。">咖啡学习</button>
        <button data-prompt="今晚想吃夜宵烧烤，预算 60 元以内，小组轻松聊天。">夜宵烧烤</button>
        <button data-prompt="周末想找抱石搭子，新手 V3，预算 120 元以内，装备可租。">攀岩抱石</button>
        <button data-prompt="周末沿河休闲骑行 15km，预算 60 元以内，节奏别太快。">休闲骑行</button>
        <button data-prompt="周六晚上跑团局，克苏鲁模组，缺 1 人，预算 100 元以内。">跑团</button>
        <button data-prompt="今晚狼人阿瓦隆桌游，3-4 人，预算 70 元以内，轻松破冰。">聚会桌游</button>
      </div>
      <button class="primary-button wide ${appState.aiLoading ? "is-loading" : ""}" id="runAIButton" ${appState.aiLoading ? "disabled" : ""}>${appState.aiLoading ? "匹配中..." : "开始匹配"}</button>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:#6b7280;">
        <input id="sparseModeToggle" type="checkbox" ${appState.sparseMode ? "checked" : ""} />
        稀疏模式（低供给演示）
      </label>
    </section>
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
  $$("#aiPage [data-select-match]").forEach((button) => {
    button.addEventListener("click", () => {
      selectMatch(appState.matchResults[Number(button.dataset.selectMatch)]);
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
  if (appState.aiLoading || (!appState.aiDirector && !appState.aiAgentError)) return "";
  if (appState.aiAgentError) {
    return `<section class="card ai-state"><div class="analyzing-dot"></div><div><b>规则层匹配（本地兜底）</b><p>${escapeHTML(appState.aiAgentError)}</p>${appState.aiDirector?.director_brief ? `<p style="margin-top:8px;">${escapeHTML(appState.aiDirector.director_brief)}</p>` : ""}<p style="margin-top:6px;font-size:12px;color:#6b7280;">未配置 .env 的 API Key 时属正常；Top3 方案仍可点选成局。</p></div></section>`;
  }
  const layer = appState.aiDirector.merchant_layer || {};
  return `
    <section class="card ai-state is-done">
      <div class="analyzing-dot"></div>
      <div>
        <b>${appState.aiProvider === "deepseek" ? "DeepSeek" : appState.aiProvider === "gemini" ? "Gemini" : "AI"} 成局导演已生成建议</b>
        <p>${escapeHTML(appState.aiDirector.director_brief || layer.summary || "已增强方案解释与履约风险。")}</p>
        ${layer.freshness_label ? `<p style="margin-top:6px;font-size:12px;color:#6b7280;">${escapeHTML(layer.freshness_label)}</p>` : ""}
      </div>
    </section>
  `;
}

function renderIntentCard() {
  if (appState.aiLoading) return "";
  if (!appState.parsedIntent) {
    return `<section class="card ai-state"><div class="analyzing-dot"></div><div><b>AI 正在等待输入</b><p>输入需求后会解析预算、时间、品类、社交风格和距离。</p></div></section>`;
  }
  const i = appState.parsedIntent;
  const confidenceLow = i.parse_layer === "low_confidence";
  const isAgent = i.parse_layer === "agent_enriched";
  const ruleTags = [i.activity_type, i.category_preference, `¥${i.budget_max}以内`, i.social_style, i.group_size, i.target_time].join(" · ");
  return `
    <section class="card ai-state is-done">
      <div class="analyzing-dot"></div>
      <div>
        <b>成局条件（双轨解析）</b>
        <p style="margin-top:6px;"><span class="parse-layer-tag l0">L0 规则</span> ${ruleTags}</p>
        ${isAgent ? `<p style="margin-top:6px;"><span class="parse-layer-tag l2">L2 Agent</span> 已校准意图并触发重匹配</p>` : ""}
        <p style="margin-top:6px;font-size:12px;color:${confidenceLow ? "#b45309" : "#15803d"};">
          ${confidenceLow ? "低置信度待澄清" : isAgent ? "Agent 增强完成" : "规则解析成功"}（置信度 ${Math.round((i.parse_confidence || 0.8) * 100)}%）
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
  const steps = ["正在解析你的需求", "正在匹配附近搭子", "正在生成成局方案"];
  return `
    <section class="card ai-steps">
      ${steps.map((step, index) => `<div class="ai-step ${index < appState.aiStep ? "is-done" : ""} ${index === appState.aiStep ? "is-active" : ""}"><span>${index + 1}</span><p>${step}</p></div>`).join("")}
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
        <h2>AI 匹配结果</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="text-button" id="reshuffleResult">换一局</button>
          <button class="text-button" id="changeTimeOnly">换一个时间</button>
          <button class="text-button" id="simulateWaitFromResult">模拟排队变长</button>
        </div>
      </div>
      ${fallbackBanner}
      ${appState.replanningNotice ? `<div class="notice-card">${appState.replanningNotice}</div>` : ""}
      ${renderPlanCompareTable()}
      ${appState.matchResults.map((match, index) => renderMatchCard(match, index)).join("")}
    </section>
  `;
}

function renderMatchCard(match, index) {
  const userLikesCat = match.user.preferred_categories && match.user.preferred_categories.includes(match.intent.category_preference);
  const rep = reputationBadge(match.user);
  const director = match.ai_director || {};
  const planTitle = director.headline || "AI 成局方案";
  const planCopy = director.explanation
    ? `${director.explanation}${director.closing_line ? ` ${director.closing_line}` : ""}`
    : `推荐你和 ${match.user.nickname} ${match.suggested_time} 去 ${match.poi.name}。${match.explanation} 备选地点：${match.backup_poi ? match.backup_poi.name : "附近同类商家"}。`;
  return `
    <article class="match-card card">
      <div class="match-top">
        <div class="score-circle">${match.total_score}%</div>
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
        <p>${match.poi.sub_category} · 人均 ¥${match.poi.avg_price} · ${match.poi.rating}分 · 等待 ${match.poi.wait_time_min} 分钟 · ${match.poi.deal_text}</p>
      </div>
      <details class="why-details">
        <summary>为什么推荐</summary>
        <ul>
          <li>预算重合：你的预算 ¥${match.intent.budget_max}，对方偏好 ¥${match.user.budget_min}–${match.user.budget_max}</li>
          <li>品类偏好：${userLikesCat ? "对方偏爱" : "感兴趣"} ${match.intent.category_preference}</li>
          <li>社交风格：${match.user.social_style} ↔ ${match.intent.social_style}</li>
          <li>位置距离：${match.user.distance_km}km，等待 ${match.poi.wait_time_min} 分钟，备选 ${match.backup_poi ? match.backup_poi.name : "同类地点"}</li>
        </ul>
      </details>
      <div class="plan-copy">
        <b>${escapeHTML(planTitle)}</b>
        <p>${escapeHTML(planCopy)}</p>
        ${director.risk ? `<p style="margin-top:6px;color:#6b7280;">风险预判：${escapeHTML(director.risk)}</p>` : ""}
        ${director.conversion_prompt ? `<p style="margin-top:6px;color:#92400e;">${escapeHTML(director.conversion_prompt)}</p>` : ""}
      </div>
      <button class="primary-button wide" data-select-match="${index}">选择这个搭子</button>
    </article>
  `;
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

function renderChatPage() {
  // Viewing a specific group chat
  if (appState.viewingGroupChatId !== null) {
    const gc = appState.groupChats.find((g) => g.group_id === appState.viewingGroupChatId);
    if (!gc) { appState.viewingGroupChatId = null; render(); return; }
    $("#chatPage").innerHTML = `
      <section class="card gc-header-card">
        <button class="back-text-btn" id="backToList">← 消息</button>
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
    $("#backToList").addEventListener("click", () => { appState.viewingGroupChatId = null; render(); });
    $$("#chatPage [data-gcquick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        gc.messages.push({ sender: "user_current", text: btn.dataset.gcquick, timestamp: nowTime() });
        render();
      });
    });
    const gcInput = $("#gcInput");
    $("#gcSend").addEventListener("click", () => {
      if (!gcInput.value.trim()) return;
      gc.messages.push({ sender: "user_current", text: gcInput.value.trim(), timestamp: nowTime() });
      gcInput.value = "";
      render();
    });
    gcInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#gcSend").click(); });
    return;
  }

  // Group chat list
  if (!appState.selectedMatch && appState.groupChats.length > 0) {
    $("#chatPage").innerHTML = `
      <section class="card"><p class="eyebrow">我的成局群组</p></section>
      ${appState.groupChats.map((gc) => `
        <article class="group-list-item card" data-gcid="${gc.group_id}">
          <div class="gc-list-icon">${poiBadgeHTML(gc.poi)}</div>
          <div class="gc-list-body">
            <h3>${gc.name}</h3>
            <p>${gc.suggested_time} · ${gc.members.map((m) => m.nickname).join("、")}</p>
            <small class="muted">${gc.messages[gc.messages.length - 1].text}</small>
          </div>
          <span class="gc-list-time">${gc.createdAt}</span>
        </article>
      `).join("")}
      <section class="card" style="text-align:center;padding:14px;">
        <button class="text-button" id="goAIFromChat">+ 发起新的搭子局</button>
      </section>
    `;
    $$("#chatPage [data-gcid]").forEach((item) => {
      item.addEventListener("click", () => { appState.viewingGroupChatId = item.dataset.gcid; render(); });
    });
    $("#goAIFromChat").addEventListener("click", () => setPage("ai"));
    return;
  }

  // Empty state
  if (!appState.selectedMatch) {
    $("#chatPage").innerHTML = `<section class="card empty-state"><h2>还没有 Match</h2><p>从地图加入一个局，或让 AI 帮你匹配。</p><button class="primary-button wide" id="goAI">去 AI 匹配</button></section>`;
    $("#goAI").addEventListener("click", () => setPage("ai"));
    return;
  }

  const match = appState.selectedMatch;
  const deal = getDeal(match.poi.poi_id);
  const planMeta = currentPlanStatusMeta();
  const rep = reputationBadge(match.user);
  $("#chatPage").innerHTML = `
    <section class="chat-profile card">
      <div class="avatar">${match.user.avatar_url ? `<img src="${match.user.avatar_url}" alt="" />` : match.user.nickname[0]}</div>
      <div>
        <h2>${match.user.nickname}${match.user.verified_status ? ' <span class="verified-badge">已验证</span>' : ""}</h2>
        <p>${match.total_score}% 匹配 · 信誉 ${rep.score} · ${match.user.social_style} · ${match.user.distance_km}km</p>
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
        <button class="primary-button" id="confirmMatch">我确认</button>
        <button class="secondary-button" id="changePlace">换地点</button>
        <button class="secondary-button" id="simulateWait">模拟餐厅排队变长</button>
        <button class="secondary-button" id="simulateReject">模拟对方拒绝</button>
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
  $("#confirmMatch").addEventListener("click", confirmMatch);
  $("#changePlace").addEventListener("click", () => openReplanChooser("change_place"));
  $("#simulateWait").addEventListener("click", () => openReplanChooser("waiting_time_change"));
  $("#simulateReject").addEventListener("click", simulateMatchReject);
  const acceptFallbackBtn = $("#acceptFallback");
  if (acceptFallbackBtn) acceptFallbackBtn.addEventListener("click", acceptFallbackMatch);
  $("#safetyOptions").addEventListener("click", () => showToast("已开启行程共享 · 紧急联系人已通知"));
  $("#sendMessage").addEventListener("click", sendChatMessage);
  $("#chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChatMessage();
  });
  $$("#chatPage [data-quick]").forEach((button) => {
    button.addEventListener("click", () => handleQuickReply(button.dataset.quick));
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
  return `<div class="message ${cls}"><span>${message.text}</span><small>${message.timestamp}</small></div>`;
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
  appState.chatThread.current_user_confirmed = true;
  appState.chatThread.messages.push({ sender: "user_current", text: "我确认这个方案。", timestamp: nowTime() });
  render();
  setTimeout(() => {
    setPlanStatus(PLAN_STATUS.CONFIRMED);
    appState.pendingSuccess = true;
    appState.chatThread.matched_user_confirmed = true;
    appState.chatThread.messages.push({ sender: "matched_user", text: "我也确认，待会见", timestamp: nowTime() });
    // Create group chat
    const gc = buildGroupChat(appState.selectedMatch);
    appState.groupChats.push(gc);
    render();
    setTimeout(() => {
      appState.pendingSuccess = false;
      appState.currentPage = "success";
      render();
    }, 800);
  }, 450);
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
  appState.chatThread.messages.push({ sender: "user_current", text, timestamp: "18:13" });
  if (appState.planStatus === PLAN_STATUS.MATCHED) setPlanStatus(PLAN_STATUS.NEGOTIATING);
  input.value = "";
  render();
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
  sheet.innerHTML = `
    <div class="modal-sheet" style="border-radius:18px 18px 0 0;align-self:flex-end;max-width:460px;">
        <h3 style="margin:4px 0 10px;">支付意愿锁定</h3>
      <p style="font-size:13px;color:#6b7280;margin-bottom:10px;">规则摘要：T-30 退出扣 50% 作为演示（非真实支付流程）。</p>
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;">
        <input type="checkbox" id="depositAgreement" ${appState.depositAgreementChecked ? "checked" : ""} />
        我同意冻结诚意金用于锁定本次成局意愿
      </label>
      <div style="display:flex;gap:8px;margin-top:12px;">
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
