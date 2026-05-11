const { pois, users, backgroundUsers, buddyDemands, matchPlans, chatThreads, deals, replanningEvents, scenes, area } = window.mockData;
const { parseIntent, runMatching, replanMatch } = window.MatchingUtils;

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
  fallbackSuggestion: "",
  sparseMode: false,
  debugMeta: null,
  replanningNotice: "",
  aiLoading: false,
  aiStep: -1,
  aiHasRun: false,
  pendingSuccess: false,
  toast: "",
  selectedTime: "今晚",
  groupChats: [],
  viewingGroupChatId: null
};

window.appState = appState;

let gaodeMap = null;
let gaodeMarkers = [];
let gaodePOIs = [];

const AMAP_TYPE_MAP = {
  "全部": "餐饮服务",
  "饭搭子": "餐饮服务",
  "KTV搭子": "KTV",
  "酒吧搭子": "酒吧",
  "咖啡搭子": "咖啡厅|奶茶店",
  "夜宵搭子": "烧烤|夜宵"
};

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

function init() {
  $("#areaLabel").textContent = `${area} · ${users.length + backgroundUsers.length} 人活跃`;
  $("#resetDemo").addEventListener("click", () => location.reload());
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => navigate(item.dataset.page)));
  render();
}

function navigate(page) {
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
  const chatNavBtn = document.querySelector('.nav-item[data-page="chat"]');
  if (chatNavBtn) {
    const badge = appState.groupChats.length;
    chatNavBtn.innerHTML = badge > 0 ? `消息<em class="nav-dot">${badge}</em>` : "消息";
  }
  renderMapPage();
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
  return "饭搭子";
}

function iconForPoi(poi) {
  if (poi.category === "KTV") return "🎤";
  if (poi.category === "酒吧") return "🍸";
  if (poi.category === "咖啡") return "☕";
  if (poi.category === "夜宵") return "🌙";
  if (poi.category === "桌游") return "🎲";
  return "🍜";
}

function renderMapPage() {
  if (!document.getElementById("amapContainer")) {
    $("#mapPage").innerHTML = `
      <div id="mapStatsBar" class="map-stats card"></div>
      <div id="filterTabsRow" class="tabs-row"></div>
      <section class="map-card" style="padding:0;overflow:hidden;">
        <div id="amapContainer"></div>
      </section>
      <section id="poiSheet" class="poi-sheet card">
        <div class="sheet-grip"></div>
      </section>
    `;
    loadAmapSDK();
  } else if (gaodeMap) {
    const mapPageEl = document.getElementById("mapPage");
    if (mapPageEl && mapPageEl.classList.contains("is-active")) {
      gaodeMap.resize();
    }
  }
  updateMapStats();
  updateFilterTabs();
  if (gaodePOIs.length) {
    renderGaodeMarkers();
    updatePOISheet();
  } else if (appState.selectedPOI) {
    updatePOISheet();
  }
}

function loadAmapSDK() {
  if (typeof AMap !== "undefined") { initAMap(); return; }
  const script = document.createElement("script");
  script.src = "https://webapi.amap.com/maps?v=1.4.15&key=20cade8c838f519cf6b734b7e4ab762d&plugin=AMap.PlaceSearch,AMap.Scale";
  script.onload = initAMap;
  script.onerror = () => showToast("地图加载失败，请在 app.js 中填入真实的高德 API Key");
  document.head.appendChild(script);
}

function mockPoiLngLat(poi) {
  const num = parseInt(poi.poi_id.replace(/\D/g, "")) || 1;
  const angle = num * 2.399;
  const d = Number(poi.distance_km) || 0.8;
  return [
    parseFloat((116.4551 + d * 0.0118 * Math.cos(angle)).toFixed(5)),
    parseFloat((39.9042 + d * 0.009 * Math.sin(angle)).toFixed(5))
  ];
}

let _mockPoisWithCoords = null;
function getMockPoisWithCoords() {
  if (!_mockPoisWithCoords) _mockPoisWithCoords = pois.map((p) => ({ ...p, location: mockPoiLngLat(p) }));
  return _mockPoisWithCoords;
}

function filteredMockPois(category) {
  return getMockPoisWithCoords().filter((p) => category === "全部" || categoryToActivity(p) === category);
}

function initAMap() {
  gaodeMap = new AMap.Map("amapContainer", {
    zoom: 17,
    center: [116.4551, 39.9042],
    mapStyle: "amap://styles/normal",
    resizeEnable: true
  });
  gaodeMap.addControl(new AMap.Scale());
  const userMarker = new AMap.Marker({
    position: new AMap.LngLat(116.4551, 39.9042),
    content: '<div class="user-location-pin" title="你在这里"></div>',
    zIndex: 200
  });
  userMarker.setMap(gaodeMap);
  // Immediately show mock POIs so the map isn't empty while PlaceSearch loads
  gaodePOIs = filteredMockPois(appState.selectedCategory);
  appState.selectedPOI = gaodePOIs[0];
  renderGaodeMarkers();
  updateMapStats();
  updatePOISheet();
  // Try to load real Gaode POIs; replace mock ones if successful
  searchAndRenderPOIs(appState.selectedCategory);
}

function searchAndRenderPOIs(category) {
  if (!gaodeMap || typeof AMap === "undefined") return;
  const type = AMAP_TYPE_MAP[category] || "餐饮服务";
  const center = gaodeMap.getCenter();
  const placeSearch = new AMap.PlaceSearch({ type, pageSize: 15, city: "北京", citylimit: true });
  placeSearch.searchNearBy("", [center.getLng(), center.getLat()], 1200, (status, result) => {
    if (status === "complete" && result.poiList && result.poiList.pois && result.poiList.pois.length) {
      gaodePOIs = result.poiList.pois.map((p, i) => enrichGaodePOI(p, category, i));
      if (!gaodePOIs.find((p) => p.poi_id === (appState.selectedPOI && appState.selectedPOI.poi_id))) {
        appState.selectedPOI = gaodePOIs[0];
      }
      renderGaodeMarkers();
      updateMapStats();
      updatePOISheet();
    } else {
      // PlaceSearch not authorized — mock data already displayed, no toast needed
    }
  });
}

function enrichGaodePOI(gp, category) {
  const budgets = { "KTV搭子": 80, "酒吧搭子": 100, "咖啡搭子": 35, "夜宵搭子": 60, "饭搭子": 80, "全部": 80 };
  const price = parseInt(gp.biz_ext && gp.biz_ext.cost) || budgets[category] || 80;
  const rating = parseFloat(gp.biz_ext && gp.biz_ext.rating) || parseFloat((4.0 + Math.random() * 0.9).toFixed(1));
  const buddyCount = Math.floor(Math.random() * 8) + 1;
  const hotScore = rating > 4.6 ? Math.floor(Math.random() * 15) + 85 : Math.floor(Math.random() * 30) + 60;
  const cat = gaodeCategoryToApp(gp.type, category);
  return {
    poi_id: gp.id,
    name: gp.name,
    category: cat,
    sub_category: (gp.type || "").split(";")[0] || "餐饮",
    address: typeof gp.address === "string" ? gp.address : "",
    location: [gp.location.getLng(), gp.location.getLat()],
    avg_price: price,
    rating: Math.round(rating * 10) / 10,
    wait_time_min: Math.floor(Math.random() * 20),
    open_status: "营业中",
    tel: typeof gp.tel === "string" ? gp.tel : "",
    tags: generateTagsFromType(gp.type, category),
    deal_text: "到店享优惠",
    buddy_demand_count: buddyCount,
    hot_score: hotScore,
    deal_available: true,
    distance_km: gp.distance ? (gp.distance / 1000).toFixed(1) : (Math.random() * 1.5 + 0.3).toFixed(1)
  };
}

function gaodeCategoryToApp(type, fallback) {
  if (!type) return categoryFromScene(fallback);
  if (type.includes("KTV") || type.includes("歌舞")) return "KTV";
  if (type.includes("酒吧") || type.includes("酒廊") || type.toLowerCase().includes("bar")) return "酒吧";
  if (type.includes("咖啡") || type.includes("奶茶") || type.includes("茶饮")) return "咖啡";
  if (type.includes("烧烤") || type.includes("夜宵") || type.includes("炸串")) return "夜宵";
  if (type.includes("桌游") || type.includes("密室")) return "桌游";
  return "餐厅";
}

function categoryFromScene(scene) {
  return { "KTV搭子": "KTV", "酒吧搭子": "酒吧", "咖啡搭子": "咖啡", "夜宵搭子": "夜宵" }[scene] || "餐厅";
}

function generateTagsFromType(_type, category) {
  const base = {
    "KTV搭子": ["KTV", "唱歌", "多人热闹", "学生"],
    "酒吧搭子": ["小酌", "认识新朋友", "轻松聊天", "下班后"],
    "咖啡搭子": ["咖啡", "学习", "安静陪伴", "轻社交"],
    "夜宵搭子": ["夜宵", "烧烤", "深夜", "小组"],
    "饭搭子": ["聊天", "轻松", "1v1", "探店"],
    "全部": ["聊天", "探店", "轻松"]
  };
  return (base[category] || base["全部"]).slice();
}

function renderGaodeMarkers() {
  gaodeMarkers.forEach((m) => m.setMap(null));
  gaodeMarkers = [];
  if (!gaodeMap) return;
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });
  gaodePOIs.forEach((poi) => {
    const isHot = poi.hot_score > 80;
    const isSelected = poi.poi_id === (appState.selectedPOI && appState.selectedPOI.poi_id);
    const matchScore = matchScoreMap[poi.poi_id];
    const sizeClass = poi.buddy_demand_count >= 7 ? "pin-lg" : poi.buddy_demand_count <= 3 ? "pin-sm" : "";
    const pinHTML = `<div class="map-pin ${isHot ? "is-hot" : ""} ${isSelected ? "is-selected" : ""} ${sizeClass}" data-category="${poi.category}">
      <span class="pin-icon">${iconForPoi(poi)}</span>
      <span class="pin-count">${poi.buddy_demand_count}</span>
      ${isHot ? `<em>热门</em>` : ""}
      ${matchScore ? `<span class="pin-match">${matchScore}%</span>` : ""}
    </div>`;
    const marker = new AMap.Marker({
      position: new AMap.LngLat(poi.location[0], poi.location[1]),
      content: pinHTML,
      zIndex: isSelected ? 150 : 100
    });
    marker.on("click", () => {
      appState.selectedPOI = poi;
      renderGaodeMarkers();
      updatePOISheet();
      gaodeMap.panTo(poi.location);
      const sheet = document.getElementById("poiSheet");
      if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    marker.setMap(gaodeMap);
    gaodeMarkers.push(marker);
  });
}

function updateMapStats() {
  const el = document.getElementById("mapStatsBar");
  if (!el) return;
  const list = gaodePOIs.length ? gaodePOIs : pois;
  const totalBuddy = list.reduce((sum, p) => sum + (p.buddy_demand_count || 0), 0);
  el.innerHTML = `
    <div><b>${area}</b><span>当前区域</span></div>
    <div><b>${users.length + backgroundUsers.length}</b><span>今日活跃</span></div>
    <div><b>${totalBuddy}</b><span>搭子需求</span></div>
    <div><b>${list.length}</b><span>可成局地点</span></div>
  `;
}

function updateFilterTabs() {
  const el = document.getElementById("filterTabsRow");
  if (!el) return;
  const categoryCount = {};
  scenes.forEach((s) => { categoryCount[s] = s === "全部" ? pois.length : pois.filter((p) => categoryToActivity(p) === s).length; });
  el.innerHTML = `
    <div class="category-chips-row">
      ${scenes.map((scene) =>
        `<button class="filter-chip ${appState.selectedCategory === scene ? "is-active" : ""}" data-category="${scene}">${scene}<span class="chip-count">${categoryCount[scene]}</span></button>`
      ).join("")}
    </div>
    <div class="time-chips-row">
      ${["现在", "今晚", "周末"].map((t) =>
        `<button class="time-chip ${appState.selectedTime === t ? "is-active" : ""}" data-time="${t}">${t}</button>`
      ).join("")}
    </div>
  `;
  el.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.selectedCategory = btn.dataset.category;
      gaodePOIs = filteredMockPois(appState.selectedCategory);
      appState.selectedPOI = gaodePOIs[0] || null;
      updateFilterTabs();
      renderGaodeMarkers();
      updateMapStats();
      if (appState.selectedPOI) updatePOISheet();
      searchAndRenderPOIs(appState.selectedCategory);
    });
  });
  el.querySelectorAll(".time-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.selectedTime = btn.dataset.time;
      updateFilterTabs();
      showToast(`已切换到「${btn.dataset.time}」搭子`);
    });
  });
}

const DISH_DATA = {
  "韩餐":   [["石锅拌饭", "¥68", "#fde8c8", "#f97316"], ["豆腐汤", "¥48", "#fef9c3", "#ca8a04"], ["部队锅", "¥78/人", "#fee2e2", "#dc2626"]],
  "火锅":   [["鸳鸯锅底", "¥58/人", "#fee2e2", "#dc2626"], ["涮肉拼盘", "¥88", "#fde8c8", "#ea580c"], ["饮料畅饮", "免费", "#e0f2fe", "#0284c7"]],
  "咖啡":   [["手冲咖啡", "¥38", "#fef3c7", "#92400e"], ["拿铁", "¥32", "#fde8c8", "#c2410c"], ["下午茶套", "¥68/2人", "#f3e8ff", "#7c3aed"]],
  "KTV":    [["小包厢", "¥88/时", "#f3e8ff", "#7c3aed"], ["含畅饮套", "¥128/人", "#e0e7ff", "#4338ca"], ["无限欢唱", "¥199", "#fce7f3", "#be185d"]],
  "酒吧":   [["招牌特调", "¥58", "#fee2e2", "#b91c1c"], ["精酿啤酒", "¥38", "#fef3c7", "#92400e"], ["双人套餐", "¥188", "#fce7f3", "#be185d"]],
  "夜宵":   [["烤串拼盘", "¥68", "#1e293b", "#f97316"], ["炸鸡套餐", "¥48", "#fde8c8", "#ea580c"], ["啤酒畅饮", "¥58", "#e0e7ff", "#4338ca"]],
  "桌游":   [["双人券", "¥68", "#dcfce7", "#15803d"], ["四人套餐", "¥198", "#e0f2fe", "#0369a1"], ["无限时", "¥128/人", "#fce7f3", "#be185d"]],
  "甜品":   [["招牌甜品", "¥38", "#fce7f3", "#db2777"], ["双拼套", "¥58", "#f3e8ff", "#7c3aed"], ["季节限定", "¥48", "#fef9c3", "#ca8a04"]],
  "日料":   [["刺身拼盘", "¥98", "#e0f2fe", "#0284c7"], ["拉面套", "¥68", "#fde8c8", "#c2410c"], ["寿司拼", "¥88", "#dcfce7", "#15803d"]],
};

function poiDishTiles(poi) {
  return DISH_DATA[poi.sub_category] || DISH_DATA[poi.category] ||
    [["招牌推荐", `¥${poi.avg_price}`, "#fde8c8", "#f97316"], ["套餐优惠", `¥${Math.round(poi.avg_price * 1.8)}/2人`, "#e0f2fe", "#0284c7"], ["限时特惠", "团购价", "#dcfce7", "#15803d"]];
}

function poiPhotoGradient(poi) {
  const palettes = {
    "餐厅": ["#ffe5c8", "#ffb347", "🍜"],
    "KTV": ["#f3e8ff", "#a855f7", "🎤"],
    "酒吧": ["#fee2e2", "#ef4444", "🍸"],
    "咖啡": ["#fef3c7", "#92400e", "☕"],
    "夜宵": ["#e0e7ff", "#3730a3", "🌙"],
    "桌游": ["#dcfce7", "#166534", "🎲"]
  };
  const [bg, accent, icon] = palettes[poi.category] || palettes["餐厅"];
  return { bg, accent, icon };
}

function gaodeNavLink(poi) {
  const loc = poi.location ? `${poi.location[0]},${poi.location[1]}` : "116.4551,39.9042";
  return `https://uri.amap.com/marker?position=${loc}&name=${encodeURIComponent(poi.name)}&src=meituan-together&callnative=1`;
}

function starHTML(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - half);
}

function updatePOISheet() {
  const el = document.getElementById("poiSheet");
  if (!el || !appState.selectedPOI) return;
  const poi = appState.selectedPOI;
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });
  const matchScore = matchScoreMap[poi.poi_id];
  const demands = getFakeDemands(poi);
  const navLink = gaodeNavLink(poi);
  const tiles = poiDishTiles(poi);
  const { accent } = poiPhotoGradient(poi);
  el.innerHTML = `
    <div class="sheet-grip"></div>
    <div class="merchant-photo-strip">
      ${tiles.slice(0, 3).map(([dish, price, bg, accent]) => `
        <div class="photo-tile" style="background:linear-gradient(160deg,${bg} 0%,${bg}99 100%);border-bottom:3px solid ${accent};">
          <span class="photo-tile-price" style="color:${accent}">${price}</span>
          <span class="photo-tile-name">${dish}</span>
        </div>
      `).join("")}
      <div class="merchant-photo-meta">
        ${matchScore ? `<span class="sheet-match">${matchScore}% 匹配</span>` : ""}
        <span class="open-badge">${poi.open_status}</span>
      </div>
    </div>
    <div class="merchant-detail-body">
      <div class="sheet-title-row">
        <h2 class="merchant-name">${poi.name}</h2>
      </div>
      <div class="merchant-rating-row">
        <span class="stars" style="color:${accent}">${starHTML(poi.rating)}</span>
        <b>${poi.rating}</b>
        <span class="muted">· ${poi.sub_category} · 人均 ¥${poi.avg_price} · ${poi.distance_km}km</span>
      </div>
      ${poi.address ? `<p class="merchant-address">📍 ${poi.address}</p>` : `<p class="merchant-address">📍 三里屯附近 · 步行约 ${Math.round(poi.distance_km * 12)} 分钟</p>`}
      <div class="merchant-chips">
        <span class="mchip wait-chip">⏱ 等 ${poi.wait_time_min} 分钟</span>
        ${poi.tags.slice(0, 3).map((t) => `<span class="mchip">${t}</span>`).join("")}
      </div>
      <div class="deal-bar">
        <span class="deal-icon">🎫</span>
        <span>${poi.deal_text}</span>
        <span class="deal-off">团购优惠</span>
      </div>
      <div class="merchant-cta-row">
        <a href="${navLink}" target="_blank" class="cta-nav-btn">📍 导航到这里</a>
        <button class="cta-detail-btn" id="viewMerchantDetail">查看商家详情 ↗</button>
      </div>
      <button class="cta-match-btn wide" id="matchFromPoi">✨ AI 帮我找搭子去这里</button>
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
    appState.userInput = `今晚想去${poi.name}，${poi.sub_category}，预算 ${poi.avg_price} 元以内，最好轻松聊聊，离我不要太远。`;
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
  document.getElementById("wantGoBtn").addEventListener("click", () => {
    poi.buddy_demand_count = (poi.buddy_demand_count || 0) + 1;
    const display = document.getElementById("buddyCountDisplay");
    if (display) display.textContent = poi.buddy_demand_count;
    const btn = document.getElementById("wantGoBtn");
    if (btn) { btn.textContent = "已标记 ✓"; btn.disabled = true; btn.style.opacity = ".6"; }
    showToast("已加入「想去」，等 AI 帮你找搭子");
  });
  document.getElementById("joinFirstDemand").addEventListener("click", () => {
    const targetDemand = demands.find((d) => d.demand_id === appState.selectedDemandId) || demands[0];
    if (!targetDemand) return;
    const intent = {
      activity_type: categoryToScene(poi.category),
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
  const navLink = gaodeNavLink(poi);
  const tiles = poiDishTiles(poi);
  overlay = document.createElement("div");
  overlay.id = "merchantModal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h2>${poi.name}</h2>
        <button class="modal-close" id="closeModal">✕</button>
      </div>
      <div class="modal-photo-row">
        ${tiles.slice(0, 3).map(([dish, price, bg, accent]) =>
          `<div class="modal-photo" style="background:linear-gradient(160deg,${bg},${bg}bb);border-bottom:3px solid ${accent};">
            <span style="color:${accent};font-weight:900;font-size:12px;">${price}</span>
            <span style="font-size:11px;margin-top:3px;">${dish}</span>
          </div>`
        ).join("")}
      </div>
      <div class="modal-info">
        <div class="modal-info-row"><span>评分</span><b>⭐ ${poi.rating} / 5.0</b></div>
        <div class="modal-info-row"><span>人均消费</span><b>¥${poi.avg_price}</b></div>
        <div class="modal-info-row"><span>品类</span><b>${poi.sub_category}</b></div>
        <div class="modal-info-row"><span>营业状态</span><b>${poi.open_status}</b></div>
        <div class="modal-info-row"><span>当前等待</span><b>${poi.wait_time_min} 分钟</b></div>
        <div class="modal-info-row"><span>距离</span><b>${poi.distance_km}km</b></div>
        ${poi.address ? `<div class="modal-info-row"><span>地址</span><b style="font-size:12px;">${poi.address}</b></div>` : ""}
        ${poi.tel ? `<div class="modal-info-row"><span>电话</span><b>${poi.tel}</b></div>` : ""}
        <div class="modal-info-row"><span>团购优惠</span><b>${poi.deal_text}</b></div>
      </div>
      <div class="modal-actions">
        <a href="${navLink}" target="_blank" class="cta-nav-btn" style="flex:1;">📍 高德导航</a>
        <button class="cta-match-btn" style="flex:1;" id="modalMatchBtn">AI 匹配搭子</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("closeModal").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("modalMatchBtn").addEventListener("click", () => {
    overlay.remove();
    appState.userInput = `今晚想去${poi.name}，${poi.sub_category}，预算 ${poi.avg_price} 元以内，最好轻松聊聊，离我不要太远。`;
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
  const count = Math.min(poi.buddy_demand_count, 3);
  const seed = parseInt(poi.poi_id.replace(/\D/g, "")) || 1;
  const templates = [
    { time: appState.selectedTime === "现在" ? "现在 + 15 分钟" : appState.selectedTime === "周末" ? "周末 15:30" : "今晚 18:30", style: "轻松聊天", size: "1v1", note: "聊聊天，别太社交" },
    { time: appState.selectedTime === "现在" ? "现在 + 30 分钟" : appState.selectedTime === "周末" ? "周末 16:00" : "今晚 19:00", style: "低压力社交", size: "1v1", note: "想试试这家，一起去吗" },
    { time: appState.selectedTime === "现在" ? "现在 + 45 分钟" : appState.selectedTime === "周末" ? "周末 17:00" : "今晚 20:00", style: "多人热闹", size: "3-5人", note: "找几个人一起，气氛好就行" }
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

function categoryToScene(category) {
  return { "KTV": "KTV搭子", "酒吧": "酒吧搭子", "咖啡": "咖啡搭子", "夜宵": "夜宵搭子" }[category] || "饭搭子";
}

async function runAI() {
  if (appState.aiLoading) return;
  appState.aiLoading = true;
  appState.aiHasRun = true;
  appState.parsedIntent = null;
  appState.matchResults = [];
  appState.replanningNotice = "";
  for (let step = 0; step < 3; step += 1) {
    appState.aiStep = step;
    render();
    await sleep(560 + step * 90);
  }
  appState.parsedIntent = parseIntent(appState.userInput);
  const sparseSupply = window.mockData.sparseSupply || { users: users.slice(0, 2), pois: pois.slice(0, 2) };
  const availablePOIs = appState.sparseMode ? sparseSupply.pois : (gaodePOIs.length ? gaodePOIs : pois);
  const availableUsers = appState.sparseMode ? sparseSupply.users : users;
  appState.matchResults = runMatching(appState.parsedIntent, availableUsers, availablePOIs).map((result, index) => {
    const concurrency = buildConcurrencyMeta(index);
    logConcurrencyMeta(concurrency);
    return { ...result, intent: appState.parsedIntent, concurrency };
  });
  if (appState.poiConstraint) {
    appState.matchResults = appState.matchResults.map((result, index) => index === 0 && isPoiCompatible(appState.parsedIntent, appState.poiConstraint) ? ({ ...result, poi: appState.poiConstraint, place_score: 90, total_score: Math.max(result.total_score, 88), backup_poi: findDealBackup(appState.poiConstraint), explanation: result.explanation.replace(result.poi.name, appState.poiConstraint.name) }) : result);
  }
  appState.generatedPlan = appState.matchResults[0] || null;
  appState.debugMeta = appState.generatedPlan ? appState.generatedPlan.concurrency : null;
  appState.aiLoading = false;
  appState.aiStep = -1;
  render();
}

function renderAIPage() {
  $("#aiPage").innerHTML = `
    <section class="card ai-card">
      <p class="eyebrow">AI Matching</p>
      <h2>告诉 AI 你的需求</h2>
      <textarea id="intentInput">${escapeHTML(appState.userInput)}</textarea>
      <div class="prompt-row">
        <button data-prompt="今晚想找一个人吃韩餐，预算 80 元以内，不想太尴尬，最好轻松聊聊，离我不要太远。">韩餐 1v1</button>
        <button data-prompt="今晚想找几个人去 KTV，人均 100 元以内，气氛热闹一点。">KTV 多人</button>
        <button data-prompt="周末想找安静的人一起喝咖啡学习，预算 40 元以内。">咖啡学习</button>
        <button data-prompt="今晚想吃夜宵烧烤，预算 60 元以内，小组轻松聊天。">夜宵烧烤</button>
      </div>
      <button class="primary-button wide ${appState.aiLoading ? "is-loading" : ""}" id="runAIButton" ${appState.aiLoading ? "disabled" : ""}>${appState.aiLoading ? "AI 正在匹配..." : "开始 AI 匹配"}</button>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:#6b7280;">
        <input id="sparseModeToggle" type="checkbox" ${appState.sparseMode ? "checked" : ""} />
        稀疏模式（低供给演示）
      </label>
    </section>
    ${renderAIProcess()}
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
    const replanPOIs = gaodePOIs.length ? gaodePOIs : pois;
    appState.matchResults[0] = replanMatch(appState.matchResults[0], "waiting_time_change", replanPOIs);
    appState.replanningNotice = appState.matchResults[0].replanning_notice;
    render();
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
}

function renderIntentCard() {
  if (appState.aiLoading) return "";
  if (!appState.parsedIntent) {
    return `<section class="card ai-state"><div class="analyzing-dot"></div><div><b>AI 正在等待输入</b><p>输入需求后会解析预算、时间、品类、社交风格和距离。</p></div></section>`;
  }
  const i = appState.parsedIntent;
  const confidenceLow = i.parse_layer === "low_confidence";
  return `
    <section class="card ai-state is-done">
      <div class="analyzing-dot"></div>
      <div>
        <b>AI 已完成解析</b>
        <p>${i.activity_type} · ${i.category_preference} · ¥${i.budget_max} 以内 · ${i.social_style} · ${i.group_size} · ${i.target_time}</p>
        <p style="margin-top:6px;font-size:12px;color:${confidenceLow ? "#b45309" : "#15803d"};">
          ${confidenceLow ? "低置信度待澄清" : "规则解析成功"}（置信度 ${Math.round((i.parse_confidence || 0.8) * 100)}%）
        </p>
      </div>
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
  return `
    <section class="result-section result-fade">
      <div class="section-title">
        <h2>AI 匹配结果</h2>
        <div style="display:flex;gap:6px;">
          <button class="text-button" id="reshuffleResult">换一局</button>
          <button class="text-button" id="simulateWaitFromResult">模拟排队变长</button>
        </div>
      </div>
      ${appState.replanningNotice ? `<div class="notice-card">${appState.replanningNotice}</div>` : ""}
      ${renderPlanCompareTable()}
      ${appState.matchResults.map((match, index) => renderMatchCard(match, index)).join("")}
    </section>
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
    ["时间", (m) => m.suggested_time],
  ];
  return `
    <div class="plan-compare-table card">
      <p class="eyebrow" style="margin-bottom:8px;">方案对比</p>
      <div class="pct-grid" style="grid-template-columns: 52px ${plans.map(() => "1fr").join(" ")}">
        <div class="pct-cell pct-header-cell"></div>
        ${plans.map((_, i) => `<div class="pct-cell pct-header-cell plan-label-${planLabels[i]}">${planLabels[i]}</div>`).join("")}
        ${rows.map(([label, fn]) => `
          <div class="pct-cell pct-row-label">${label}</div>
          ${plans.map((m) => `<div class="pct-cell">${fn(m)}</div>`).join("")}
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

function renderMatchCard(match, index) {
  const userLikesCat = match.user.preferred_categories && match.user.preferred_categories.includes(match.intent.category_preference);
  return `
    <article class="match-card card">
      <div class="match-top">
        <div class="score-circle">${match.total_score}%</div>
        <div>
          <h3>${match.user.nickname}${match.user.verified_status ? ' <span class="verified-badge">已验证</span>' : ""}</h3>
          <p>${match.user.social_style} · ¥${match.user.budget_min}–${match.user.budget_max} · ${match.user.distance_km}km</p>
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
          <li>品类偏好：${userLikesCat ? "✓ 对方偏爱" : "○ 感兴趣"} ${match.intent.category_preference}</li>
          <li>社交风格：${match.user.social_style} ↔ ${match.intent.social_style}</li>
          <li>位置距离：${match.user.distance_km}km，等待 ${match.poi.wait_time_min} 分钟，备选 ${match.backup_poi ? match.backup_poi.name : "同类地点"}</li>
        </ul>
      </details>
      <div class="plan-copy">
        <b>AI 成局方案</b>
        <p>推荐你和 ${match.user.nickname} ${match.suggested_time} 去 ${match.poi.name}。${match.explanation} 备选地点：${match.backup_poi ? match.backup_poi.name : "附近同类商家"}。</p>
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
          <div class="gc-avatar">${iconForPoi(gc.poi)}</div>
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
          <div class="gc-list-icon">${iconForPoi(gc.poi)}</div>
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
  $("#chatPage").innerHTML = `
    <section class="chat-profile card">
      <div class="avatar">${match.user.nickname[0]}</div>
      <div>
        <h2>${match.user.nickname}${match.user.verified_status ? ' <span class="verified-badge">已验证</span>' : ""}</h2>
        <p>${match.total_score}% 匹配 · ${match.user.social_style} · ${match.user.distance_km}km</p>
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
      <button class="safety-button" id="safetyOptions">🛡 安全选项</button>
    </section>
    ${appState.replanningNotice ? `<div class="notice-card">${appState.replanningNotice}</div>` : ""}
    <section class="card" style="padding:10px 14px;">
      <p class="eyebrow" style="margin-bottom:6px;">当前局态</p>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
        <b>${planMeta.label}</b>
        <span style="color:#6b7280;">${planMeta.progress}%</span>
      </div>
      <div style="margin-top:8px;height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;">
        <div style="height:100%;width:${planMeta.progress}%;background:linear-gradient(90deg,#f97316,#fb923c);"></div>
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
      ${appState.debugMeta ? `<details style="margin-top:8px;"><summary style="cursor:pointer;color:#6b7280;">调试字段（并发叙事）</summary><p style="margin-top:6px;font-size:12px;color:#6b7280;">match_version: ${appState.debugMeta.match_version}<br/>reservation_ttl: ${appState.debugMeta.reservation_ttl}<br/>idempotency_key: ${appState.debugMeta.idempotency_key}</p></details>` : ""}
    </section>
    <section class="messages-card card">
      ${appState.chatThread.messages.map(renderMessage).join("")}
      ${appState.pendingSuccess ? `<div class="confirming-banner">双方已确认，正在生成成局卡片...</div>` : ""}
      <div class="quick-replies">
        ${["可以", "想换一家", "时间晚一点", "预算有点高", "直接确认"].map((text) => `<button data-quick="${text}">${text}</button>`).join("")}
      </div>
      <div class="chat-composer">
        <input id="chatInput" placeholder="输入消息" />
        <button class="primary-button" id="sendMessage">发送</button>
      </div>
    </section>
  `;
  $("#confirmMatch").addEventListener("click", confirmMatch);
  $("#changePlace").addEventListener("click", () => applyReplan("change_place"));
  $("#simulateWait").addEventListener("click", () => applyReplan("waiting_time_change"));
  $("#simulateReject").addEventListener("click", simulateMatchReject);
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
      { sender: "system", text: `🎉 成局！${match.suggested_time} 一起去 ${match.poi.name}`, timestamp: t },
      { sender: "matched_user", text: "太好了，待会见 😊", timestamp: t },
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
    appState.chatThread.messages.push({ sender: "matched_user", text: "我也确认，待会见 😊", timestamp: nowTime() });
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
  const replanPOIs = gaodePOIs.length ? gaodePOIs : pois;
  appState.selectedMatch = replanMatch(appState.selectedMatch, eventType, replanPOIs);
  appState.depositLocked = false;
  appState.depositAgreementChecked = false;
  appState.fallbackSuggestion = "";
  setPlanStatus(PLAN_STATUS.NEGOTIATING);
  appState.replanningNotice = appState.selectedMatch.replanning_notice;
  appState.chatThread.messages.push({ sender: "ai", text: appState.replanningNotice, timestamp: "18:12" });
  render();
}

function simulateMatchReject() {
  if (!appState.selectedMatch || !appState.chatThread) return;
  setPlanStatus(PLAN_STATUS.REJECTED);
  appState.depositLocked = false;
  appState.chatThread.messages.push({ sender: "matched_user", text: "我这边临时有事，这局先不过去了。", timestamp: nowTime() });
  const alternatives = appState.matchResults.filter((item) => item.match_id !== appState.selectedMatch.match_id);
  const planC = alternatives[1] || alternatives[0];
  if (planC) {
    appState.selectedMatch = { ...planC, intent: appState.selectedMatch.intent };
    appState.debugMeta = appState.selectedMatch.concurrency || appState.debugMeta;
    appState.fallbackSuggestion = `已自动切到候补 ${alternatives[1] ? "C" : "B"}：${planC.user.nickname} @ ${planC.poi.name}（${planC.total_score}%）。`;
    appState.chatThread.messages.push({
      sender: "ai",
      text: `${appState.fallbackSuggestion} 基于现有候选列表重排，未引入额外算法。`,
      timestamp: nowTime()
    });
    setPlanStatus(PLAN_STATUS.FALLBACK_READY);
  } else {
    appState.fallbackSuggestion = "暂无候补 C，建议降级为“仅保留地点 + 放宽时间”后再匹配。";
    appState.chatThread.messages.push({ sender: "ai", text: appState.fallbackSuggestion, timestamp: nowTime() });
  }
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
    setPlanStatus(PLAN_STATUS.NEGOTIATING);
  }
  if (text === "直接确认") {
    confirmMatch();
    return;
  }
  appState.chatThread.messages.push({ sender: "user_current", text, timestamp: "18:13" });
  render();
}

function renderSuccessPage() {
  if (!appState.selectedMatch) return;
  const deal = getDeal(appState.selectedMatch.poi.poi_id);
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
      <div class="deal-box">
        <b>${deal.title}</b>
        <p>${deal.deal_type} · 原价 ¥${deal.original_price} · 优惠价 ¥${deal.discount_price}</p>
        <p>适合 ${deal.suitable_group_size} · ${deal.valid_time}</p>
      </div>
      <button class="primary-button wide" id="enterGroupChat">💬 进入群聊</button>
      <button class="primary-button wide" id="buyDeal">购买团购券</button>
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
  $("#buyDeal").addEventListener("click", () => showToast("模拟购买成功 🎫"));
  $("#viewRoute").addEventListener("click", () => {
    const poi = appState.selectedMatch.poi;
    const link = gaodeNavLink(poi);
    window.open(link, "_blank");
  });
  $("#addCalendar").addEventListener("click", () => showToast("已模拟加入日历"));
  $("#shareBuddy").addEventListener("click", () => showToast("已模拟分享给搭子"));
}

function renderProfilePage() {
  $("#profilePage").innerHTML = `
    <section class="card">
      <p class="eyebrow">我的</p>
      <h2>Demo 数据健康度</h2>
      <div class="health-list">
        <div><span>POI</span><b>${pois.length}</b></div>
        <div><span>核心用户</span><b>${users.length}</b></div>
        <div><span>搭子需求</span><b>${buddyDemands.length}</b></div>
        <div><span>聊天线程</span><b>${chatThreads.length}</b></div>
        <div><span>优惠券</span><b>${deals.length}</b></div>
        <div><span>重规划事件</span><b>${replanningEvents.length}</b></div>
      </div>
    </section>
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

function findDealBackup(poi) {
  const allPOIs = gaodePOIs.length ? gaodePOIs : pois;
  return allPOIs.filter((c) => c.poi_id !== poi.poi_id && c.category === poi.category).sort((a, b) => a.wait_time_min - b.wait_time_min)[0];
}

function isPoiCompatible(intent, poi) {
  if (!poi) return false;
  if (intent.activity_type === "KTV搭子") return poi.category === "KTV";
  if (intent.activity_type === "酒吧搭子") return poi.category === "酒吧";
  if (intent.activity_type === "咖啡搭子") return poi.category === "咖啡";
  if (intent.activity_type === "夜宵搭子") return poi.category === "夜宵";
  return poi.category === "餐厅";
}

function breakdownLabel(key) {
  return ({ time: "时间", distance: "距离", budget: "预算", category: "品类", social_style: "社交", interest: "兴趣", place: "地点" })[key] || key;
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
      <div class="sheet-grip"></div>
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
