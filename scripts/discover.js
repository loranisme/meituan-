function bindAreaPill() {
  const pill = $("#areaLabel");
  if (!pill || pill.dataset.bound) return;
  pill.dataset.bound = "1";
  if (!canShowDeveloperControls()) {
    pill.classList.add("is-static");
    pill.setAttribute("aria-label", "当前小商圈");
    pill.setAttribute("aria-disabled", "true");
    return;
  }
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

function applyCity(cityId, options = {}) {
  const nextCity = cityOptions.find((city) => city.id === cityId);
  if (!nextCity) return;
  if (appState.selectedCityId === nextCity.id && !options.force) return;
  appState.selectedCityId = nextCity.id;
  appState.mapExpandedClusterId = null;
  appState.mapManualPOI = false;
  invalidateMapPoiCache();
  refreshMapSupply();
  syncAmapCityCenter();
  updateAreaPill();
  updateRefMapHeading();
  updateDiscoverRecommend();
  if (document.getElementById("circlePage")) renderCirclePage();
  if (!options.silent) showToast(`已切换到${nextCity.name}`);
}

function locateCurrentCity() {
  applyCity(cityOptions[0]?.id || appState.selectedCityId, { silent: true });
  showToast(`已定位到${getCurrentCity().name}`);
}

function applyBrowseRadius(km) {
  const next = Number(km);
  if (!Number.isFinite(next) || next <= 0) return;
  appState.browseRadiusKm = next;
  appState.mapExpandedClusterId = null;
  appState.mapManualPOI = false;
  refreshMapSupply();
  syncAmapCityCenter();
  syncMapRangeOverlay();
  updateAreaPill();
  updateRefRadiusRow();
  updateRefMapHeading();
}

function selectLifeCircle(circleId) {
  appState.selectedCircleId = circleId;
  appState.mapExpandedClusterId = null;
  appState.mapManualPOI = false;
  invalidateMapPoiCache();
  const circle = getCurrentCircle();
  applyBrowseRadius(circle.radius_km || 2);
  // 不关闭圈子浮层，不跳页：就地刷新浮层内容
  if (document.getElementById("circlePage")) renderCirclePage();
  showToast(`已切换到「${circle.shortName}」`);
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
  const city = getCurrentCity();
  const areaLabel = `${city.areaName || circle.shortName || "杨浦滨江"} · 小商圈`;
  const canOpen = canShowDeveloperControls();
  el.classList.toggle("is-static", !canOpen);
  el.setAttribute("aria-label", canOpen ? "切换生活圈" : "当前小商圈");
  el.setAttribute("aria-disabled", canOpen ? "false" : "true");
  el.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="${circle.accent || "#FF6B35"}" aria-hidden="true" style="flex-shrink:0"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
    <span style="font-size:13px;font-weight:700;color:#1a1a1a;">${escapeHTML(areaLabel)}</span>
    ${canOpen ? `<span style="color:#9ca3af;font-size:11px;margin-left:1px;">›</span>` : ""}
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
  const km = currentBrowseRadiusKm();
  const label = km >= 50 ? "全部" : `${km}km`;
  return `<span class="user-radius-label">${label}</span>`;
}

function syncMapRangeOverlay() {
  const userPin = currentCityUserPin();
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
    label.textContent = currentBrowseRadiusKm() >= 50 ? "全部" : `${currentBrowseRadiusKm()}km`;
  });
}

function flatMapDiscoverHTML() {
  const userPin = currentCityUserPin();
  const radiusSize = browseRadiusVisualSize();
  return `
    <div class="map-grid" aria-hidden="true"></div>
    <canvas id="heatCanvas" class="discover-heat-canvas" aria-hidden="true"></canvas>
    <div class="map-street street-h street-h-2" aria-hidden="true"></div>
    <div class="map-street street-v street-v-2" aria-hidden="true"></div>
    <div class="map-road road-main" aria-hidden="true"></div>
    <div class="map-road road-cross" aria-hidden="true"></div>
    <div class="user-location-pin map-user-pin" style="left:${userPin.x}%;top:${userPin.y}%"></div>
    <div class="user-radius" data-radius-km="${currentBrowseRadiusKm()}" style="left:${userPin.x}%;top:${userPin.y}%;width:${radiusSize}%;height:${radiusSize}%">${rangeLabelHTML()}</div>
  `;
}

function flatMapZonesHTML(classPrefix = "", options = {}) {
  const p = classPrefix ? `${classPrefix} ` : "";
  const pulsePin = currentCityUserPin();
  const pulse = options.pulseEat ? `<div class="${p}map-live-pulse" style="left:${pulsePin.x}%;top:${pulsePin.y}%"></div>` : "";
  const userPin = currentCityUserPin();
  const radiusSize = browseRadiusVisualSize();
  return `
    <div class="${p}map-zone zone-dining" aria-hidden="true"></div>
    <div class="${p}map-zone zone-play" aria-hidden="true"></div>
    <div class="${p}map-zone zone-sport" aria-hidden="true"></div>
    <div class="${p}map-zone zone-night" aria-hidden="true"></div>
    <div class="${p}map-grid" aria-hidden="true"></div>
    <div class="${p}map-landuse map-park park-west" aria-hidden="true"></div>
    <div class="${p}map-landuse map-park park-east" aria-hidden="true"></div>
    <div class="${p}map-landuse map-campus campus-north" aria-hidden="true"></div>
    <div class="${p}map-landuse map-water water-south" aria-hidden="true"></div>
    <div class="${p}map-street street-h street-h-1" aria-hidden="true"></div>
    <div class="${p}map-street street-h street-h-2" aria-hidden="true"></div>
    <div class="${p}map-street street-h street-h-3" aria-hidden="true"></div>
    <div class="${p}map-street street-h street-h-4" aria-hidden="true"></div>
    <div class="${p}map-street street-v street-v-1" aria-hidden="true"></div>
    <div class="${p}map-street street-v street-v-2" aria-hidden="true"></div>
    <div class="${p}map-street street-v street-v-3" aria-hidden="true"></div>
    <div class="${p}map-street street-v street-v-4" aria-hidden="true"></div>
    <div class="${p}map-street street-diag street-diag-1" aria-hidden="true"></div>
    <div class="${p}map-street street-diag street-diag-2" aria-hidden="true"></div>
    <div class="${p}map-road road-main" aria-hidden="true"></div>
    <div class="${p}map-road road-cross" aria-hidden="true"></div>
    <div class="${p}map-road road-upper" aria-hidden="true"></div>
    <div class="${p}map-road road-lower" aria-hidden="true"></div>
    <div class="${p}map-road road-diagonal-a" aria-hidden="true"></div>
    <div class="${p}map-road road-diagonal-b" aria-hidden="true"></div>
    <div class="${p}map-road road-secondary-a" aria-hidden="true"></div>
    <div class="${p}map-road road-secondary-b" aria-hidden="true"></div>
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

const CATEGORY_EMOJI = {
  餐厅: "🍜", KTV: "🎤", 酒吧: "🍸", 咖啡: "☕",
  夜宵: "🌙", 攀岩: "🧗", 骑行: "🚴", 桌游: "🎲"
};
function poiEmoji(poi) { return CATEGORY_EMOJI[poi.category] || "📍"; }
function truncName(name, max = 6) { return name.length > max ? name.slice(0, max) + "…" : name; }

function pinSummaryHTML(poi, matchScore) {
  const emoji = poiEmoji(poi);
  const name = escapeHTML(truncName(poi.name));
  const hotDot = isHotPoi(poi) ? `<i class="pin-hot-dot"></i>` : "";
  const aiBadge = matchScore ? `<i class="pin-ai-badge">AI</i>` : "";
  return `${hotDot}${aiBadge}<span class="pin-emoji">${emoji}</span><span class="pin-label">${name}</span>`;
}

// 头像哈希颜色 — 与 match 页用户头像风格一致
const AVATAR_PALETTE = [
  { bg: "#FFF4ED", color: "#C2410C" }, // orange
  { bg: "#EFF5FF", color: "#1D4ED8" }, // blue
  { bg: "#ECFDF5", color: "#065F46" }, // green
  { bg: "#F5F0FF", color: "#6D28D9" }, // purple
  { bg: "#FFF8E1", color: "#92400E" }, // amber
  { bg: "#FFF0F0", color: "#BE123C" }, // rose
  { bg: "#F0FDFA", color: "#0F766E" }, // teal
  { bg: "#FDF4FF", color: "#86198F" }, // fuchsia
];
function avatarHashColor(seed) {
  let hash = 0;
  const s = String(seed || "?");
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
function avatarHTML(seed, initial, size = 38) {
  const { bg, color } = avatarHashColor(seed);
  return `<span class="dv2-avatar" style="width:${size}px;height:${size}px;background:${bg};color:${color};font-size:${Math.round(size * 0.42)}px;">${escapeHTML(String(initial || "?")[0])}</span>`;
}

const MAP_CLUSTER_DEFS = [
  { id: "food", label: "吃喝", categories: ["餐厅", "咖啡"], x: 35, y: 46, accent: "#FF6B35", tint: "#FFF4ED" },
  { id: "night", label: "夜间", categories: ["夜宵", "酒吧"], x: 31, y: 70, accent: "#FF2442", tint: "#FFF0F3" },
  { id: "play", label: "玩乐", categories: ["KTV", "桌游"], x: 66, y: 38, accent: "#8B5CF6", tint: "#F5F0FF" },
  { id: "sport", label: "运动", categories: ["攀岩", "骑行"], x: 68, y: 67, accent: "#2F7EF7", tint: "#EFF5FF" }
];

function clusterDefForPoi(poi) {
  return MAP_CLUSTER_DEFS.find((cluster) => cluster.categories.includes(poi.category)) || MAP_CLUSTER_DEFS[0];
}

function computeOpportunityScore(poi) {
  const radius = Math.max(currentBrowseRadiusKm(), 1);
  const distance = Number(poi.distance_km || radius);
  const wait = Number(poi.wait_time_min || 0);
  const demand = Number(poi.buddy_demand_count || 0);
  const hot = Number(poi.hot_score || 0);
  const rating = Number(poi.rating || 4.4);
  const distanceScore = clampNumber(1 - distance / (radius + 0.35), 0, 1) * 15;
  const waitScore = clampNumber(1 - wait / 34, 0, 1) * 13;
  const demandScore = clampNumber(demand / 11, 0, 1) * 19;
  const hotScore = clampNumber(hot / 100, 0, 1) * 12;
  const ratingScore = clampNumber((rating - 4.1) / 0.8, 0, 1) * 7;
  const filterBonus = appState.selectedCategory !== "全部" && (
    appState.selectedCategory === categoryToActivity(poi) ||
    String(appState.selectedCategory).startsWith("group:")
  ) ? 3 : 0;
  return Math.round(clampNumber(38 + distanceScore + waitScore + demandScore + hotScore + ratingScore + filterBonus, 52, 96));
}

function rankedMapPois(list = gaodePOIs) {
  return (list || []).slice().sort((a, b) => computeOpportunityScore(b) - computeOpportunityScore(a));
}

function opportunityReasons(poi) {
  const deal = getDeal(poi.poi_id);
  const saved = deal ? Math.max(0, deal.original_price - deal.discount_price) : 0;
  const walkMin = Math.max(3, Math.round(Number(poi.distance_km || 0.8) * 12));
  return [
    `${poi.distance_km}km 内，步行约 ${walkMin} 分钟`,
    `${poi.buddy_demand_count} 人想约，附近同类需求集中`,
    Number(poi.wait_time_min || 0) <= 12 ? `等待 ${poi.wait_time_min} 分钟，适合马上出门` : `等待 ${poi.wait_time_min} 分钟，建议先锁定时间`,
    saved > 0 ? `团购可省 ¥${saved}，预算更容易对齐` : `人均 ¥${poi.avg_price}，预算清晰`
  ];
}

function buildMapClusters(list) {
  return MAP_CLUSTER_DEFS.map((def) => {
    const members = (list || []).filter((poi) => clusterDefForPoi(poi).id === def.id);
    if (!members.length) return null;
    const totalDemand = members.reduce((sum, poi) => sum + Number(poi.buddy_demand_count || 0), 0);
    const topScore = Math.max(...members.map(computeOpportunityScore));
    const centroid = members.reduce((acc, poi) => {
      const pos = poiMapPercent(poi);
      acc.x += pos.x;
      acc.y += pos.y;
      return acc;
    }, { x: 0, y: 0 });
    const weight = members.length || 1;
    return {
      ...def,
      members: rankedMapPois(members),
      count: members.length,
      totalDemand,
      score: topScore,
      x: Math.round((def.x * 0.62) + (centroid.x / weight) * 0.38),
      y: Math.round((def.y * 0.62) + (centroid.y / weight) * 0.38)
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

function activeMapCluster(clusters) {
  return clusters.find((cluster) => cluster.id === appState.mapExpandedClusterId) || null;
}

function circleMoments(circle) {
  const list = filteredMockPois(appState.selectedCategory);
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
  return filteredMockPois(appState.selectedCategory)
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
  const hotPoi = poiOverride || filteredMockPois(appState.selectedCategory)
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
          <div style="height:148px;background:url('${coverUrl}') center/cover no-repeat;position:relative;">
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.42);"></div>
            <div style="position:absolute;top:10px;right:10px;background:#FFE033;color:#1a1a1a;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:800;">还差 ${spotsLeft} 人</div>
            <div style="position:absolute;bottom:12px;left:14px;right:14px;color:#fff;">
              <p style="font-size:17px;font-weight:900;margin:0;text-shadow:0 1px 4px rgba(0,0,0,0.4);">${escapeHTML(poi.name)}</p>
              <p style="font-size:12px;margin:3px 0 0;opacity:0.88;">评分 ${poi.rating} · ${escapeHTML(poi.sub_category)} · 人均 ¥${poi.avg_price}</p>
            </div>
          </div>
          <div style="background:#fff;padding:14px 16px 12px;">
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
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.40);"></div>
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
      <div class="${TW.modalSheet}" style="padding-bottom:36px;">
        <div class="${TW.modalHeader}">
          <div>
            <h2 style="font-size:17px;margin:0;">邀请卡片</h2>
            <p style="font-size:11px;color:#999;margin:2px 0 0;">发出后对方一键接受即进活动页</p>
          </div>
          <button class="${TW.modalClose}" id="closeInviteCard">关闭</button>
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
          <button type="button" class="${TW.secondaryButton}" id="icCopy" style="min-height:46px;font-size:13px;">复制链接</button>
          <button type="button" class="${TW.primaryButton}"   id="icGo"   style="min-height:46px;font-size:14px;">
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
    overlay.querySelector("#icCopy").addEventListener("click", () => showToast("链接已复制"));
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
  const currentCity = getCurrentCity();
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
  page.className = TW.circlePage;
  page.innerHTML = `
    <header class="${TW.circlePageHeader}">
      <button type="button" class="${TW.backTextBtn}" id="closeCirclePage">返回</button>
      <h1>生活圈</h1>
      <span class="circle-page-count">${effectiveBuddies} 人想约</span>
    </header>
    <div class="${TW.circlePageBody} circle-page-body">
      <section class="city-picker-card">
        <div class="city-picker-head">
          <div>
            <span>当前城市</span>
            <b>${escapeHTML(currentCity.name)}</b>
          </div>
          <button type="button" id="locateCityBtn">定位</button>
        </div>
        <div class="city-picker-row">
          ${cityOptions.map((city) => `
            <button type="button" class="${city.id === appState.selectedCityId ? "is-active" : ""}" data-city-id="${escapeHTML(city.id)}">
              ${escapeHTML(city.shortName || city.name)}
            </button>
          `).join("")}
        </div>
      </section>
      <section class="${TW.circleHero} circle-hero-panel" style="--circle-tint:${current.tint};--circle-accent:${current.accent || "#FF6B35"}">
        <div class="${TW.circlePulseBar}">
          <span><span class="${TW.liveDot}"></span> ${browsing} 人正逛这个圈</span>
          <span class="${TW.circleWeather}">${circleWeather.temp}° ${escapeHTML(circleWeather.label)}</span>
        </div>
        <b>${escapeHTML(current.name)}</b>
        <p>${escapeHTML(current.tagline)} · ${escapeHTML(activeSceneName)}</p>
        <p class="${TW.circleAdLine}">「${escapeHTML(brandSloganLine())}」</p>
        <div class="${TW.circleTimeRow}" id="circleTimeRow">
          ${timeSlots.map((t) => `
            <button type="button" class="${TW.circleTimeChip} ${appState.circleTimeSlot === t.id ? "is-active" : ""}" data-slot="${t.id}">${t.label}</button>
          `).join("")}
        </div>
        <div style="margin-top:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="font-size:11px;font-weight:700;color:#555;letter-spacing:0.02em;">成局热度</span>
            <span style="font-size:11px;font-weight:700;color:#FF6B35;">${appState.circleTimeSlot === "weekend" ? "本周末" : appState.circleTimeSlot === "tonight" ? "今晚" : "此刻"} ${effectiveBuddies} 人想约 · ${heatPct}%</span>
          </div>
          <div style="height:7px;background:rgba(0,0,0,0.08);border-radius:4px;overflow:hidden;">
            <div style="width:${heatPct}%;height:100%;border-radius:4px;transition:width 0.45s ease;background:${heatPct >= 75 ? "#FF6B35" : heatPct >= 45 ? "#FFB347" : "#FFE033"};"></div>
          </div>
        </div>
        <div class="${TW.circleMiniMap} circle-heatmap" id="circleMiniMap" style="margin-top:8px;">
          ${flatMapZonesHTML("", { pulseEat: true })}
          <canvas id="miniHeatCanvas" class="circle-heat-canvas"></canvas>
          <div class="mini-map-pins">${miniMapPinsHTML(displayPoiList)}</div>
        </div>
        <p class="${TW.muted}" style="font-size:11px;margin-top:6px;">地图已按「${escapeHTML(activeSceneName)}」显示 ${escapeHTML(sceneSummary)}</p>
        <div class="${TW.circleCardStats}" style="margin-top:10px">
          <span><b>${effectiveShops}</b> 家店</span>
          <span><b>${effectiveBuddies}</b> 人想约</span>
          <span>约 ${appState.browseRadiusKm}km</span>
        </div>
      </section>

      <section class="${TW.card} ${TW.discoverFilterCard}">
        <div class="${TW.sectionHead}"><h3>地图筛选</h3><button type="button" class="${TW.linkish}" id="circleSeeMap">看地图</button></div>
        <p class="${TW.muted} ${TW.discoverFilterNote}">切换生活圈或类型后，地图上的商家点位和热力会同步更新。</p>

        <div class="${TW.discoverControlLabel}">生活圈</div>
        <div class="${TW.circleList} ${TW.discoverCircleList} discover-circle-list">
          ${lifeCircles.map((c) => {
            const s = circleStats(c);
            const active = c.id === appState.selectedCircleId;
            const displayName = c.shortName || c.name.replace("附近 · ", "");
            return `
              <button type="button" class="${TW.circleCard} ${TW.discoverCircleCard} circle-filter-tile ${active ? "is-active" : ""}" data-circle="${c.id}"
                style="--card-tint:${c.tint};--card-accent:${c.accent}">
                <span class="circle-filter-icon">${escapeHTML(displayName[0] || "圈")}</span>
                <span class="circle-filter-copy">
                  <b>${escapeHTML(displayName)}</b>
                  <small>${s.shops} 店 · ${s.buddies} 人想约</small>
                </span>
              </button>
            `;
          }).join("")}
        </div>

        <div class="${TW.discoverControlLabel}">浏览范围</div>
        <div class="${TW.radiusRow}" id="radiusRow">
          ${BROWSE_RADIUS_PRESETS.map(({ value, label }) => `
            <button type="button" class="${TW.radiusChip} ${Math.abs(appState.browseRadiusKm - value) < 0.01 ? "is-active" : ""}" data-radius="${value}">${label}</button>
          `).join("")}
        </div>

        <div class="${TW.discoverControlLabel}">组局类型</div>
        <div class="${TW.sceneGroupGrid} ${TW.discoverSceneGrid} discover-scene-grid" role="tablist">
          <button type="button" class="${TW.sceneGroupTile} scene-filter-chip ${appState.selectedCategory === "全部" ? "is-active" : ""}" data-discover-group="all" style="--accent:#FF6B35;--tint:#FFF4ED">
            <span class="scene-filter-copy">
              <b>全部</b>
              <small>${circlePoiList.length} 店 · ${circleTotalStats.buddies} 人</small>
            </span>
          </button>
          ${sceneGroups.map((group) => {
            const groupStats = groupDemandStats(group);
            const isActive = activeGroupId === group.id;
            return `
              <button type="button" class="${TW.sceneGroupTile} scene-filter-chip ${isActive ? "is-active" : ""}" data-discover-group="${group.id}"
                style="--accent:${group.accent};--tint:${group.tint}">
                <span class="scene-filter-copy">
                  <b>${group.label}</b>
                  <small>${groupStats.shops} 店 · ${groupStats.people} 人</small>
                </span>
              </button>
            `;
          }).join("")}
        </div>
        <div class="${TW.sceneSubPanel} ${activeGroup ? "is-open" : ""}" ${activeGroup ? "" : 'aria-hidden="true"'}>
          ${activeGroup ? `
            <div class="${TW.sceneSubTrack}">
              ${activeGroup.scenes.map((scene) => {
                const meta = sceneCatalog[scene] || { abbr: scene[0], tagline: scene };
                const sceneStats = sceneDemandStats(scene);
                const isSceneActive = appState.selectedCategory === scene;
                return `
                  <button type="button" class="${TW.sceneSubChip} ${isSceneActive ? "is-active" : ""}" data-discover-scene="${scene}"
                    style="--accent:${activeGroup.accent}">
                    ${sceneIcon(sceneMetaAbbr(meta), activeGroup.accent, activeGroup.tint, "sm")}
                    <span class="${TW.sscText}">
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
          <button type="button" class="${TW.sceneClearFilter}" id="clearDiscoverFilter">清除类型筛选 · 看全部地点</button>
        ` : ""}
      </section>

      <div class="${TW.sectionHead}" style="margin-top:14px"><h3>地图上的地点</h3><span class="${TW.muted}" style="font-size:12px;">${escapeHTML(sceneSummary)}</span></div>
      <div class="${TW.discoverPoiList} discover-poi-list">
        ${mapPois.map((p) => `
          <button type="button" class="${TW.discoverPoiRow}" data-poi="${p.poi_id}">
            ${poiBadgeHTML(p)}
            <div>
              <b>${escapeHTML(p.name)}</b>
              <p>${escapeHTML(p.sub_category)} · ${p.distance_km}km · ${p.buddy_demand_count} 人想约</p>
            </div>
            <span>¥${p.avg_price}</span>
          </button>
        `).join("") || `<div class="${TW.emptyState}">这个筛选下暂时没有地点，换个类型试试。</div>`}
      </div>

      <div class="${TW.sectionHead}" style="margin-top:14px"><h3>圈子里正在发生</h3></div>
      <div class="${TW.circleMomentList} circle-moment-list">
        ${moments.slice(0, 3).map((m) => `
          <button type="button" class="${TW.circleMoment}" data-poi="${m.poi_id || ""}">
            <div class="${TW.circleMomentHead}">
              <span class="${TW.circleLiveAvatar}">${escapeHTML(m.avatar)}</span>
              <div><b>${escapeHTML(m.user)}</b> <small>${escapeHTML(m.ago)} · ${escapeHTML(m.time)}</small></div>
            </div>
            <p>${escapeHTML(m.text)}</p>
          </button>
        `).join("")}
      </div>

      <section class="${TW.card} ${TW.circleLive}" style="margin-top:12px">
        <p class="${TW.eyebrow}">可加入的局</p>
        ${liveDemands.map((d) => `
          <div class="${TW.circleLiveItem}">
            <span class="${TW.circleDemandIcon}">${escapeHTML((d.activity_type || "搭")[0])}</span>
            <div style="flex:1">
              <b>${escapeHTML(d.poi_name)}</b>
              <p class="${TW.muted}" style="font-size:12px;">${escapeHTML(d.target_time)} · ¥${d.budget_min}–${d.budget_max} · ${d.distance_km}km</p>
            </div>
            <button type="button" class="${TW.textButton}" data-join="${escapeHTML(d.demand_id)}">加入</button>
          </div>
        `).join("") || `<p class="${TW.muted}" style="font-size:12px;margin-top:8px;">当前筛选下暂无可加入的局。</p>`}
        <button type="button" class="${TW.primaryButton} ${TW.wide}" id="circleGoMatch" style="margin-top:12px">快速匹配搭子</button>
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
  page.querySelector("#locateCityBtn")?.addEventListener("click", locateCurrentCity);
  page.querySelectorAll("[data-city-id]").forEach((btn) => {
    btn.addEventListener("click", () => applyCity(btn.dataset.cityId));
  });
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
  page.querySelectorAll("#circlePage [data-poi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poi = filteredMockPois(appState.selectedCategory).find((p) => p.poi_id === btn.dataset.poi) || getMockPoisWithCoords().find((p) => p.poi_id === btn.dataset.poi);
      if (!poi) return;
      appState.selectedPOI = poi;
      appState.mapManualPOI = true;
      closeCirclePage();
      setPage("map");
      setTimeout(() => {
        renderMockMapPins();
        updatePOISheet();
        updateRefMapVisual();
        const sheet = document.getElementById("poiSheet");
        if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
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
}

function venueExtraModalRows(poi) {
  const ex = poi.venue_extra;
  if (!ex) return "";
  const row = (label, value) => `<div class="${TW.modalInfoRow}"><span>${label}</span><b>${value}</b></div>`;
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
    return `<span class="${TW.mchip}">${ex.climb_grade}</span><span class="${TW.mchip}">${ex.gear_rental}</span>`;
  }
  if (poi.category === "骑行") {
    return `<span class="${TW.mchip}">${ex.route_length}</span><span class="${TW.mchip}">${ex.bike_rental}</span>`;
  }
  if (poi.category === "桌游") {
    return `<span class="${TW.mchip}">${ex.private_room}</span><span class="${TW.mchip}">${ex.avg_session_hours}</span>`;
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
  if (!document.getElementById("refDiscoverRoot")) {
    $("#mapPage").innerHTML = `
      <div class="dv2-root" id="refDiscoverRoot">

        <!-- ① 分类筛选栏（紧贴顶部，横向滚动） -->
        <div class="dv2-cats-wrap">
          <div class="dv2-cats" id="filterTabsRow"></div>
        </div>

        <!-- ② 地图区块（全宽，无卡片外框） -->
        <div class="dv2-map-block">
          <div class="dv2-map-canvas-wrap" id="refMapVisual">
            <div id="mockMapCanvas" class="${("AMap" in window) ? "real-map dv2-map-canvas" : "fake-map is-discover-view dv2-map-canvas"}" role="img" aria-label="${escapeHTML(getCurrentCircle().name)}地图">
              ${("AMap" in window) ? "" : `${flatMapDiscoverHTML()}<div id="mockMapPins" class="map-pins-layer"></div>`}
            </div>

            <!-- 地图浮层：左上角位置 pill -->
            <button type="button" class="dv2-map-area-pill" id="areaLabel" aria-label="切换生活圈"></button>

            <!-- 地图浮层：底部数据条 -->
            <div class="dv2-map-footer" id="refMapFooter"></div>

            <!-- 地图浮层：右下角定位按钮 -->
            <button type="button" class="dv2-map-locate" id="refMapLocate" aria-label="定位" ${canShowDeveloperControls() ? "" : "hidden"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="#2F7EF7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#2F7EF7" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>

          <!-- 地图下方：成局机会条 -->
          <div class="dv2-stats-row" id="refMapHeading"></div>
        </div>

        <!-- ③ 选中 POI 卡片 -->
        <section id="poiSheet" class="dv2-poi-card"></section>

        <!-- 隐藏区 -->
        <section id="discoverRecommend" hidden></section>
        <div id="discoverHeaderExtras" hidden><div id="refRadiusRow"></div></div>
      </div>
    `;
    document.getElementById("refMapLocate")?.addEventListener("click", locateCurrentCity);
    initMockMap();
  }
  updateRefRadiusRow();
  updateAreaPill();
  updateRefMapHeading();
  updateSceneNavigator();
  updateMapControls();
  updateDiscoverRecommend();
  syncMapRangeOverlay();
  if (mockMapReady) {
    if (amapInstance) {
      renderAmapPins();
    } else {
      renderMockMapPins();
    }
    updateRefMapVisual();
    updatePOISheet();
  } else if (appState.selectedPOI) {
    updateRefMapVisual();
    updatePOISheet();
  }
}

function updateRefRadiusRow() {
  const el = document.getElementById("refRadiusRow");
  if (!el) return;
  if (!canShowDeveloperControls()) {
    const parent = document.getElementById("discoverHeaderExtras");
    if (parent) parent.hidden = true;
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const parent = document.getElementById("discoverHeaderExtras");
  if (parent) parent.hidden = false;
  el.hidden = false;
  const km = currentBrowseRadiusKm();
  el.innerHTML = BROWSE_RADIUS_PRESETS.map(({ value, label }) => `
    <button type="button" class="${TW.radiusPill} ${Math.abs(km - value) < 0.01 ? "is-active" : ""}" data-ref-radius="${value}">${label}</button>
  `).join("");
  el.querySelectorAll("[data-ref-radius]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyBrowseRadius(Number(btn.dataset.refRadius));
      showToast(`已切换到${browseRadiusPresetLabel(Number(btn.dataset.refRadius))}范围`);
    });
  });
}

function updateRefMapHeading() {
  const el = document.getElementById("refMapHeading");
  if (!el) return;
  const list = rankedMapPois(gaodePOIs.length ? gaodePOIs : filteredMockPois(appState.selectedCategory));
  const total = list.reduce((sum, poi) => sum + Number(poi.buddy_demand_count || 0), 0);
  const forming = list.filter((p) => Number(p.buddy_demand_count || 0) >= 2).length;
  const hotCount = list.filter(isHotPoi).length;
  el.innerHTML = `
    <div class="dv2-stats-row-inner">
      <div class="dv2-stat"><b>${list.length}</b><span>家地点</span></div>
      <div class="dv2-stat-div"></div>
      <div class="dv2-stat"><b>${total}</b><span>人想出门</span></div>
      <div class="dv2-stat-div"></div>
      <div class="dv2-stat dv2-stat-hot"><b>${forming}</b><span>个成局中</span></div>
      <div class="dv2-stat-div"></div>
      <div class="dv2-stat"><b>${hotCount}</b><span>热门地点</span></div>
    </div>
  `;
}

function updateRefMapVisual() {
  updateRefMapFooter();
}

function updateRefBubbles() {
  const el = document.getElementById("refMapBubbles");
  if (el) el.innerHTML = "";
}

function updateRefMapFooter() {
  const el = document.getElementById("refMapFooter");
  if (!el) return;
  const city = getCurrentCity();
  const best = appState.selectedPOI;
  const radiusKm = currentBrowseRadiusKm();
  const areaName = city.areaName || city.shortName || city.name;
  if (best) {
    const walkMin = Math.max(2, Math.round((best.distance_km || 0.8) * 12));
    el.innerHTML = `
      <span class="dv2-footer-dot ${isHotPoi(best) ? "is-hot" : ""}"></span>
      <span class="dv2-footer-name">${escapeHTML(best.name)}</span>
      <span class="dv2-footer-meta">${walkMin} 分钟 · ¥${best.avg_price}</span>
    `;
  } else {
    el.innerHTML = `
      <span class="dv2-footer-dot"></span>
      <span class="dv2-footer-name">${escapeHTML(areaName)}</span>
      <span class="dv2-footer-meta">${radiusKm}km 范围 · 点 pin 看局</span>
    `;
  }
}

function updateRefStickyBar(poi, demands) {
  /* actions rendered inline in updatePOISheet */
}

function startQuickMatchFromPoi(poi) {
  appState.userInput = defaultIntentTextForPoi(poi);
  appState.poiConstraint = poi;
  appState.currentPage = "ai";
  appState.parsedIntent = null;
  appState.matchResults = [];
  appState.aiHasRun = false;
  showToast("已为你开始快速匹配");
  render();
  setTimeout(() => runAI(), 450);
}

function bindRefPoiActions(poi, demands) {
  document.getElementById("matchFromPoi")?.addEventListener("click", () => startQuickMatchFromPoi(poi));
  document.getElementById("poiJoinBtn")?.addEventListener("click", () => {
    const d = demands[0];
    if (d) joinDemandFromRefSheet(d.demand_id, poi, demands);
    else startQuickMatchFromPoi(poi);
  });
}

function joinDemandFromRefSheet(demandId, poi, demands) {
  const targetDemand = demands.find((d) => d.demand_id === demandId) || demands[0];
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
}

function updateMapControls() {
  const el = document.getElementById("mapLayerToggle");
  if (!el) {
    appState.mapLayer = "normal";
    syncMapLayerState();
    return;
  }
  if (el.dataset.bound) {
    syncMapLayerState();
    return;
  }
  el.dataset.bound = "1";
  el.querySelectorAll("[data-map-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.mapLayer = btn.dataset.mapLayer === "heat" ? "heat" : "normal";
      appState.mapExpandedClusterId = null;
      syncMapLayerState();
      renderMockMapPins();
      renderHeatCanvas();
      if (amapInstance) renderAmapPins();
      updateRefMapFooter();
      showToast(appState.mapLayer === "heat" ? "已切换到人流热力图" : "已切换到地点地图");
    });
  });
  syncMapLayerState();
}

function syncMapLayerState() {
  const canvas = document.getElementById("mockMapCanvas");
  if (canvas) {
    canvas.classList.add("is-discover-view");
    canvas.classList.toggle("is-heat-view", appState.mapLayer === "heat");
  }
  document.querySelectorAll("[data-map-layer]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mapLayer === appState.mapLayer);
  });
  syncAmapHeatLayer();
}

/** 示意地图 pin 位置：mockData 里 POI 的 x/y（0–100 百分比），非经纬度 */
function poiMapPercent(poi) {
  return {
    x: Math.max(4, Math.min(96, Number(poi.x) || 50)),
    y: Math.max(8, Math.min(92, Number(poi.y) || 50))
  };
}

const POI_MAP_CACHE_VERSION = 3;
let _mockPoisWithCoords = null;
let _mockPoisCacheVersion = 0;
let _mockPoisCacheCityId = "";
let _mockPoisCacheCircleId = "";
function invalidateMapPoiCache() {
  _mockPoisWithCoords = null;
  _mockPoisCacheVersion = 0;
  _mockPoisCacheCityId = "";
  _mockPoisCacheCircleId = "";
}

function getMockPoisWithCoords() {
  const city = getCurrentCity();
  const cityId = city.id || "default";
  const circleId = appState.selectedCircleId || "near";
  if (!_mockPoisWithCoords || _mockPoisCacheVersion !== POI_MAP_CACHE_VERSION || _mockPoisCacheCityId !== cityId || _mockPoisCacheCircleId !== circleId) {
    _mockPoisCacheVersion = POI_MAP_CACHE_VERSION;
    _mockPoisCacheCityId = cityId;
    _mockPoisCacheCircleId = circleId;
    const circleCenter = getCurrentCircle();
    const centerLng = circleCenter.center_lng || city.center_lng || mockData.mapCenter.lng;
    const centerLat = circleCenter.center_lat || city.center_lat || mockData.mapCenter.lat;
    _mockPoisWithCoords = pois.map((p) => {
      const pos = poiMapPercent(p);
      return {
        ...p,
        area: `${city.name} · ${areaShort}`,
        address: `${city.name} · ${areaShort} · ${p.sub_category}`,
        mapX: pos.x,
        mapY: pos.y,
        lng: Number((centerLng + (pos.x - 50) / 50 * 0.022).toFixed(6)),
        lat: Number((centerLat - (pos.y - 50) / 50 * 0.018).toFixed(6))
      };
    });
  }
  return _mockPoisWithCoords;
}

function filteredMockPois(category) {
  const circle = getCurrentCircle();
  const inCircle = poisInCircle(circle);
  const circleIds = new Set(inCircle.map((p) => p.poi_id));
  const radiusKm = currentBrowseRadiusKm();
  const all = getMockPoisWithCoords().filter((p) => {
    const distance = Number(p.distance_km || 0);
    return circleIds.has(p.poi_id) && (!distance || distance <= radiusKm + 0.08);
  });
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
  appState.mapExpandedClusterId = null;
  appState.mapManualPOI = false;
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
  if (!appState.mapManualPOI || !gaodePOIs.some((p) => p.poi_id === appState.selectedPOI?.poi_id)) {
    appState.selectedPOI = rankedMapPois(gaodePOIs)[0] || null;
  }
  syncMapRangeOverlay();
  syncAmapCityCenter();
  if (mockMapReady) {
    if (amapInstance) {
      renderAmapPins();
    } else {
      renderMockMapPins();
      if (!document.getElementById("refDiscoverRoot")) setTimeout(renderHeatCanvas, 0);
    }
    updatePOISheet();
    updateRefMapVisual();
    updateRefRadiusRow();
    updateRefMapHeading();
    updateMapControls();
    updateMapStats();
    updateSceneNavigator();
    updateDiscoverRecommend();
    syncMapLayerState();
  }
}

// ---------- Leaflet integration ----------
function percentToLatLng(x, y, centerLat, centerLng) {
  // Map percentage (0-100) to offset from center
  // ~2km area: lat span ~0.018°, lng span ~0.024° (at lat 31°)
  const latSpan = 0.018;
  const lngSpan = 0.024;
  return {
    lat: centerLat + (0.5 - y / 100) * latSpan,
    lng: centerLng + (x / 100 - 0.5) * lngSpan
  };
}

function initLeafletMap() {
  if (!window.L) return false;
  const container = document.getElementById("mockMapCanvas");
  if (!container) return false;

  // Tear down any previous Leaflet instance
  if (leafletMap) {
    try { leafletMap.remove(); } catch (_) {}
    leafletMap = null;
    leafletMarkers = [];
  }

  container.className = "dv2-map-canvas leaflet-map-host is-discover-view";
  container.innerHTML = `
    <div id="leafletTileLayer" style="position:absolute;inset:0;z-index:0;"></div>
    <div class="map-skeleton-loader" id="mapSkeletonLoader" aria-hidden="true">
      <div class="map-skeleton-pulse"></div>
      <span>地图加载中…</span>
    </div>
    <canvas id="heatCanvas" class="discover-heat-canvas leaflet-heat-overlay" aria-hidden="true"></canvas>
    <div id="mockMapPins" class="map-pins-layer leaflet-pin-layer"></div>
  `;

  const city = getCurrentCity();
  const centerLat = Number(city.center_lat || 31.252634);
  const centerLng = Number(city.center_lng || 121.549153);

  leafletMap = window.L.map("leafletTileLayer", {
    center: [centerLat, centerLng],
    zoom: 15,
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: true,
    keyboard: false
  });

  const tileLayer = window.L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    { subdomains: "abcd", maxZoom: 19 }
  ).addTo(leafletMap);
  tileLayer.on("load", () => {
    const skeleton = document.getElementById("mapSkeletonLoader");
    if (skeleton) { skeleton.style.opacity = "0"; setTimeout(() => skeleton?.remove(), 300); }
  });

  // User location dot
  const userPin = currentCityUserPin();
  const { lat: uLat, lng: uLng } = percentToLatLng(userPin.x, userPin.y, centerLat, centerLng);
  window.L.marker([uLat, uLng], {
    icon: window.L.divIcon({
      className: "leaflet-user-icon",
      html: `<div class="user-location-pin leaflet-user-dot"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    }),
    interactive: false,
    zIndexOffset: 9000
  }).addTo(leafletMap);

  return true;
}

function renderLeafletPins() {
  if (!leafletMap || !window.L) return;
  const layer = document.getElementById("mockMapPins");
  if (!layer) return;

  const list = gaodePOIs.length ? gaodePOIs : filteredMockPois(appState.selectedCategory);
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });

  const city = getCurrentCity();
  const centerLat = Number(city.center_lat || 31.252634);
  const centerLng = Number(city.center_lng || 121.549153);

  // Remove old Leaflet markers
  leafletMarkers.forEach((m) => { try { leafletMap.removeLayer(m); } catch (_) {} });
  leafletMarkers = [];

  list.forEach((poi, index) => {
    const pos = poiMapPercent(poi);
    const { lat, lng } = percentToLatLng(pos.x, pos.y, centerLat, centerLng);
    const matchScore = matchScoreMap[poi.poi_id];
    const isHot = isHotPoi(poi);
    const isSelected = poi.poi_id === appState.selectedPOI?.poi_id;
    const isAI = Boolean(matchScore);
    const g = poiPhotoGradient(poi);

    const cls = [
      "map-pin",
      "pin-enter",
      isAI ? "is-ai" : isHot ? "is-hot" : "",
      isSelected ? "is-selected" : ""
    ].filter(Boolean).join(" ");

    const icon = window.L.divIcon({
      className: "leaflet-poi-icon",
      html: `<div class="${cls}" style="position:absolute;transform:translate(-50%,-50%);"
        data-poi-id="${poi.poi_id}" tabindex="-1" role="button" aria-label="${escapeHTML(poi.name)}">
        ${pinSummaryHTML(poi, matchScore)}
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const marker = window.L.marker([lat, lng], {
      icon,
      zIndexOffset: isSelected ? 2000 : isAI ? 1000 : index
    }).addTo(leafletMap);

    marker.on("click", () => {
      appState.selectedPOI = poi;
      appState.mapManualPOI = true;
      appState.poiSheetTab = "demands";
      renderLeafletPins();
      updateRefMapVisual();
      updatePOISheet();
      const sheet = document.getElementById("poiSheet");
      if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    leafletMarkers.push(marker);
  });

  setTimeout(renderHeatCanvas, 0);
}

function initMockMap() {
  if (!appState.selectedCircleId && lifeCircles[0]) appState.selectedCircleId = lifeCircles[0].id;
  gaodePOIs = filteredMockPois(appState.selectedCategory);
  const preSelected = appState.selectedPOI && gaodePOIs.some((p) => p.poi_id === appState.selectedPOI.poi_id);
  if (!preSelected || !appState.mapManualPOI) {
    const preferred = gaodePOIs.find((p) => p.poi_id === "poi_039");
    appState.selectedPOI = preferred || rankedMapPois(gaodePOIs)[0] || null;
  }
  if ("AMap" in window) {
    initRealMap();
  } else {
    initFakeMap();
  }
}

function initFakeMap() {
  mockMapReady = true;
  // Try Leaflet first; CSS fake map as fallback
  if (initLeafletMap()) {
    renderLeafletPins();
  } else {
    renderMockMapPins();
  }
  updateMapStats();
  updateRefMapVisual();
  updatePOISheet();
}

function initRealMap() {
  const circle = getCurrentCircle();
  const centerLng = circle.center_lng || mockData.mapCenter.lng;
  const centerLat = circle.center_lat || mockData.mapCenter.lat;
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
      syncAmapCityCenter({ lockBounds: true });
    });
    mockMapReady = true;
    renderAmapPins();
    syncAmapHeatLayer();
    updateMapStats();
    updateRefMapVisual();
    updatePOISheet();
  } catch (err) {
    console.warn("[AMap] 初始化失败，降级为平面示意地图", err);
    container.className = "fake-map is-discover-view";
    container.innerHTML = flatMapDiscoverHTML() +
      '<div id="mockMapPins" class="map-pins-layer"></div>';
    amapInstance = null;
    initFakeMap();
  }
}

function upgradeToRealMapIfPossible() {
  if (!("AMap" in window)) return false;
  const container = document.getElementById("mockMapCanvas");
  if (!container) return false;

  if (amapInstance) {
    syncAmapCityCenter({ lockBounds: true });
    renderAmapPins();
    syncAmapHeatLayer();
    updateRefMapVisual();
    updatePOISheet();
    syncMapLayerState();
    return true;
  }

  container.className = "real-map is-discover-view";
  container.innerHTML = "";
  initRealMap();
  syncMapLayerState();
  return !!amapInstance;
}

window.upgradeToRealMapIfPossible = upgradeToRealMapIfPossible;

function renderAmapPins() {
  if (!amapInstance) return;
  hideAmapHeatLayer();
  amapInstance.clearMap();
  amapHeatLayer = null;
  amapRangeCircle = null;
  const AMap = /** @type {any} */ (window["AMap"]);
  const matchScoreMap = {};
  appState.matchResults.forEach((r) => { matchScoreMap[r.poi.poi_id] = r.total_score; });

  renderAmapRangeCircle(AMap);
  syncAmapHeatLayer();

  const poisToShow = isDiscoverMapView()
    ? rankedMapPois(gaodePOIs).slice(0, 5)
    : gaodePOIs;

  poisToShow.forEach((poi, index) => {
    if (!poi.lng || !poi.lat) return;
    const isSelected = isDiscoverMapView() ? isDiscoverPinSelected(poi) : poi.poi_id === (appState.selectedPOI && appState.selectedPOI.poi_id);
    const isDiscover = isDiscoverMapView();
    const matchScore = matchScoreMap[poi.poi_id];
    const isHot = poi.hot_score > 80;
    const sizeClass = poi.buddy_demand_count >= 7 ? "pin-lg" : poi.buddy_demand_count <= 3 ? "pin-sm" : "";
    const g = poiPhotoGradient(poi);
    const pinHTML = isDiscover
      ? discoverAmapPinHTML(poi, index)
      : `
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
        anchor: isDiscover ? (isSelected ? "bottom-center" : "center") : "bottom-center",
        offset: new AMap.Pixel(0, 0),
        title: poi.name,
        zIndex: isSelected ? 120 : 100
      });
      marker.on("click", () => {
        appState.selectedPOI = poi;
        if (isDiscover) appState.mapManualPOI = true;
        renderAmapPins();
        updateRefMapVisual();
        updatePOISheet();
        const sheet = document.getElementById("poiSheet");
        if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      amapInstance.add(marker);
    } catch (_) {}
  });
}

function syncAmapCityCenter(options = {}) {
  if (!amapInstance) return;
  const circle = getCurrentCircle();
  const centerLng = circle.center_lng || mockData.mapCenter.lng;
  const centerLat = circle.center_lat || mockData.mapCenter.lat;
  const radiusKm = currentBrowseRadiusKm();
  try {
    if (typeof amapInstance.clearLimitBounds === "function") amapInstance.clearLimitBounds();
    amapInstance.setZoomAndCenter(radiusKm >= 50 ? 12 : radiusKm >= 5 ? 13 : 15, [centerLng, centerLat], false);
    if (options.lockBounds) {
      setTimeout(() => {
        try { amapInstance.setLimitBounds(amapInstance.getBounds()); } catch (_) {}
      }, 80);
    }
  } catch (_) {}
}

function heatCountForPoi(poi) {
  return Math.max(8, Math.round(heatWeightForPoi(poi) * 8));
}

function amapHeatData(list) {
  return list
    .filter((poi) => poi.lng && poi.lat)
    .map((poi) => ({ lng: poi.lng, lat: poi.lat, count: heatCountForPoi(poi) }));
}

function hideAmapHeatLayer() {
  if (!amapHeatLayer) return;
  try { amapHeatLayer.hide(); } catch (_) {}
}

function syncAmapHeatLayer() {
  if (!amapInstance || !("AMap" in window)) return;
  const AMap = /** @type {any} */ (window["AMap"]);
  const shouldShow = appState.mapLayer === "heat";
  if (!shouldShow) {
    hideAmapHeatLayer();
    return;
  }
  const list = gaodePOIs.length ? gaodePOIs : filteredMockPois(appState.selectedCategory);
  const data = amapHeatData(list);
  if (!data.length) return;
  const max = Math.max(...data.map((item) => item.count), 20);
  const applyData = () => {
    try {
      amapHeatLayer.setDataSet({ data, max });
      amapHeatLayer.show();
    } catch (err) {
      console.warn("[AMap] 热力层数据更新失败", err);
    }
  };
  if (amapHeatLayer) {
    applyData();
    return;
  }
  try {
    amapInstance.plugin(["AMap.HeatMap"], () => {
      try {
        amapHeatLayer = new AMap.HeatMap(amapInstance, {
          radius: 34,
          opacity: [0, 0.72],
          zIndex: 30
        });
        applyData();
      } catch (err) {
        console.warn("[AMap] 热力层初始化失败", err);
      }
    });
  } catch (err) {
    console.warn("[AMap] 热力插件加载失败", err);
  }
}

function renderAmapRangeCircle(AMap) {
  if (!amapInstance || !AMap) return;
  const circle = getCurrentCircle();
  const centerLng = circle.center_lng || mockData.mapCenter.lng;
  const centerLat = circle.center_lat || mockData.mapCenter.lat;
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

function navigationRouteHTML(poi) {
  if (!poi) return "";
  const userPin = MAP_LAYOUT.user_pin || { x: 48, y: 54 };
  const target = poiMapPercent(poi);
  const roadY = Math.abs(target.y - userPin.y) > 18 ? (target.y < userPin.y ? 34 : 73) : 52;
  const midX = clampNumber((userPin.x + target.x) / 2 + (target.x > userPin.x ? 6 : -6), 18, 82);
  const points = [
    [userPin.x, userPin.y],
    [userPin.x, roadY],
    [midX, roadY],
    [midX, target.y],
    [target.x, target.y]
  ];
  const pointString = points.map(([x, y]) => `${x},${y}`).join(" ");
  const labelPoint = [
    clampNumber((userPin.x + target.x) / 2, 18, 82),
    clampNumber(Math.min(userPin.y, target.y) - 10, 14, 82)
  ];
  const walkMin = Math.max(3, Math.round((poi.distance_km || 0.8) * 12));
  return `
    <svg class="map-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline class="route-casing" points="${pointString}" />
      <polyline class="route-line" points="${pointString}" />
      ${points.slice(1, -1).map(([x, y]) => `<circle class="route-turn" cx="${x}" cy="${y}" r="0.8" />`).join("")}
    </svg>
    <div class="map-route-dist" style="left:${labelPoint[0]}%;top:${labelPoint[1]}%;">导航 ${walkMin} 分钟</div>
  `;
}

function mapPoiButtonHTML(poi, index, options = {}) {
  const selectedPoi = appState.selectedPOI;
  const isSelected = poi.poi_id === (selectedPoi && selectedPoi.poi_id);
  const matchScore = options.matchScore || computeOpportunityScore(poi);
  const isAI = options.ai !== false && matchScore >= 82;
  const isDimmed = options.dimmed ? "is-dimmed" : "";
  const sizeClass = isAI || poi.buddy_demand_count >= 7 ? "pin-lg" : poi.buddy_demand_count <= 3 ? "pin-sm" : "";
  const pos = poiMapPercent(poi);
  const g = poiPhotoGradient(poi);
  return `
    <button type="button" class="map-pin pin-enter ${isAI ? "is-ai" : isHotPoi(poi) ? "is-hot" : ""} ${isSelected ? "is-selected" : ""} ${isDimmed} ${sizeClass}"
      data-poi-id="${poi.poi_id}" data-category="${poi.category}"
      style="left:${pos.x}%;top:${pos.y}%;--pin-color:${g.accent};--pin-bg:${g.bg};--float-delay:${(index % 6) * 0.16}s"
      title="${escapeHTML(poi.name)}：${poi.buddy_demand_count} 人想约 · Agent ${matchScore}分"
      aria-label="${escapeHTML(poi.name)}，${escapeHTML(poi.category)}，Agent ${matchScore} 分">
      ${sceneIcon(categoryAbbr(poi), g.accent, g.bg, "xs")}
      ${pinSummaryHTML(poi, matchScore)}
    </button>
  `;
}

function isDiscoverMapView() {
  return !!document.getElementById("refDiscoverRoot");
}

function isDiscoverPinSelected(poi) {
  return !!(poi && appState.selectedPOI && poi.poi_id === appState.selectedPOI.poi_id);
}

const DISCOVER_PIN_MARKER_SVG = `<svg class="discover-pin-drop-svg" viewBox="0 0 24 36" width="32" height="42" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0z" fill="#FF2442" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="11" r="4.5" fill="#fff" fill-opacity="0.92"/></svg>`;

function discoverMapPinHTML(poi, index) {
  const isSelected = isDiscoverPinSelected(poi);
  const pos = poiMapPercent(poi);
  const hot = isHotPoi(poi);
  const g = poiPhotoGradient(poi);
  return `
    <button type="button" class="map-pin discover-pin mapmaker-pin ${hot ? "is-hot" : ""} ${isSelected ? "is-selected" : ""} pin-enter"
      data-poi-id="${poi.poi_id}"
      style="left:${pos.x}%;top:${pos.y}%;--pin-color:${g.accent};--pin-bg:${g.bg};--float-delay:${(index % 4) * 0.14}s"
      aria-label="${escapeHTML(poi.name)}">
      ${pinSummaryHTML(poi, null)}
    </button>`;
}

function discoverAmapPinHTML(poi, index) {
  const isSelected = isDiscoverPinSelected(poi);
  const hot = isHotPoi(poi);
  const g = poiPhotoGradient(poi);
  return `
    <div class="map-pin discover-pin mapmaker-pin ${hot ? "is-hot" : ""} ${isSelected ? "is-selected" : ""} pin-enter"
         style="cursor:pointer;--pin-color:${g.accent};--pin-bg:${g.bg};--float-delay:${(index % 4) * 0.14}s"
         title="${escapeHTML(poi.name)}">
      ${pinSummaryHTML(poi, null)}
    </div>`;
}

function bindDiscoverMapPins(layer, list) {
  layer.querySelectorAll(".discover-pin[data-poi-id]").forEach((btn) => {
    const activate = () => {
      const poi = list.find((p) => p.poi_id === btn.dataset.poiId);
      if (!poi) return;
      appState.selectedPOI = poi;
      appState.mapManualPOI = true;
      renderMockMapPins();
      if (amapInstance) renderAmapPins();
      updateRefMapVisual();
      updatePOISheet();
      document.getElementById("poiSheet")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      activate();
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}

function renderMockMapPins() {
  const layer = document.getElementById("mockMapPins");
  if (!layer) return;
  const list = gaodePOIs.length ? gaodePOIs : filteredMockPois(appState.selectedCategory);
  const ranked = rankedMapPois(list);
  if (!appState.selectedPOI) {
    const preferred = ranked[0] || list[0] || null;
    if (preferred) appState.selectedPOI = preferred;
  }

  const isRefDiscover = !!document.getElementById("refDiscoverRoot");
  // If Leaflet is active, pins are managed by renderLeafletPins — skip CSS pin rendering
  if (isRefDiscover && leafletMap) {
    renderLeafletPins();
    updateRefMapFooter();
    updateRefMapHeading();
    return;
  }
  // CSS fake map: show all ranked POIs (spread individually, no clustering)
  const pinPois = isRefDiscover ? ranked : [];
  if (isRefDiscover && pinPois.length && !pinPois.some((p) => p.poi_id === appState.selectedPOI?.poi_id)) {
    appState.selectedPOI = pinPois[0];
    appState.mapManualPOI = false;
  }
  const selectedPoi = appState.selectedPOI || ranked[0] || null;
  const routeHTML = isRefDiscover
    ? (selectedPoi ? navigationRouteHTML(selectedPoi) : "")
    : navigationRouteHTML(appState.selectedPOI);

  if (isRefDiscover) {
    layer.innerHTML = routeHTML + pinPois.map((p, i) => discoverMapPinHTML(p, i)).join("");
    bindDiscoverMapPins(layer, list);
    updateRefMapFooter();
    updateRefMapHeading();
    setTimeout(renderHeatCanvas, 0);
    return;
  }

  const clusters = buildMapClusters(list);
  const expanded = activeMapCluster(clusters);
  const featuredIds = new Set(ranked.slice(0, appState.mapLayer === "heat" ? 1 : 5).map((p) => p.poi_id));
  const visiblePois = expanded ? expanded.members.slice(0, 10) : ranked.filter((p) => featuredIds.has(p.poi_id));
  const topScore = ranked[0] ? computeOpportunityScore(ranked[0]) : 0;
  const clusterHTML = clusters.map((cluster, index) => {
    const isActive = expanded && expanded.id === cluster.id;
    const hiddenByExpansion = expanded && !isActive;
    return `
      <button type="button" class="map-cluster-pin ${isActive ? "is-expanded" : ""} ${hiddenByExpansion ? "is-muted" : ""}"
        data-cluster-id="${cluster.id}"
        style="left:${cluster.x}%;top:${cluster.y}%;--cluster-color:${cluster.accent};--cluster-bg:${cluster.tint};--float-delay:${(index % 4) * 0.12}s"
        aria-label="${cluster.label}聚合，${cluster.count}家，${cluster.totalDemand}人想约">
        <b>${escapeHTML(cluster.label)}</b>
        <span>${cluster.count}家 · ${cluster.totalDemand}人</span>
      </button>
    `;
  }).join("");
  const mapSelectedPoi = appState.selectedPOI || ranked[0] || null;
  const expandedPanel = expanded ? `
    <div class="map-expanded-panel">
      <div>
        <b>${escapeHTML(expanded.label)}已展开</b>
        <span>${expanded.count} 家店 · 最高机会 ${expanded.score} 分</span>
      </div>
      <button type="button" id="collapseMapCluster">收起</button>
    </div>
  ` : `
    <div class="map-agent-note">
      <b>${topScore ? `${topScore} 分` : "待计算"}</b>
      <span>${mapSelectedPoi ? `优先看 ${escapeHTML(mapSelectedPoi.name)}` : "换个范围发现更多"}</span>
    </div>
  `;
  layer.innerHTML = routeHTML + clusterHTML + visiblePois.map((poi, index) => (
    mapPoiButtonHTML(poi, index, { matchScore: computeOpportunityScore(poi), dimmed: expanded && poi.poi_id !== mapSelectedPoi?.poi_id })
  )).join("") + expandedPanel;

  layer.querySelectorAll(".map-cluster-pin[data-cluster-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.mapExpandedClusterId = btn.dataset.clusterId || null;
      appState.mapManualPOI = false;
      const nextCluster = buildMapClusters(list).find((cluster) => cluster.id === appState.mapExpandedClusterId);
      if (nextCluster && nextCluster.members[0]) appState.selectedPOI = nextCluster.members[0];
      renderMockMapPins();
      updateRefMapVisual();
      updatePOISheet();
      syncMapLayerState();
    });
  });
  layer.querySelector("#collapseMapCluster")?.addEventListener("click", () => {
    appState.mapExpandedClusterId = null;
    renderMockMapPins();
    syncMapLayerState();
  });
  layer.querySelectorAll(".map-pin[data-poi-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poi = list.find((p) => p.poi_id === btn.dataset.poiId) || getMockPoisWithCoords().find((p) => p.poi_id === btn.dataset.poiId);
      if (!poi) return;
      appState.selectedPOI = poi;
      appState.mapManualPOI = true;
      renderMockMapPins();
      updateRefMapVisual();
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
  const opportunity = computeOpportunityScore(poi);
  const waitBonus = clampNumber(1 - wait / 38, 0, 1) * 2.4;
  const ratingBonus = clampNumber(rating - 4.2, 0, 0.8) * 2.2;
  return demand * 1.65 + hot / 13 + waitBonus + ratingBonus + opportunity / 9;
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

  const radiusKm = currentBrowseRadiusKm();
  const isOpportunityLayer = appState.mapLayer === "heat";
  poiList.forEach((poi, i) => {
    const density = poiDensityBoost(poi, poiList);
    const isHot = isHotPoi(poi);
    // Hot POIs get boosted intensity to create concentrated "hot zones"
    const hotBoost = isHot ? 1.28 : 0.78;
    const layerBoost = isOpportunityLayer ? 1 : 0.42;
    const intensity = clampNumber((weights[i] / maxW) * (0.76 + density * 0.09) * slotMult * hotBoost * layerBoost, 0, 1);
    if (intensity < (isOpportunityLayer ? 0.07 : 0.12)) return; // normal layer keeps heat as a quiet hint
    const x = (poiMapPercent(poi).x / 100) * w;
    const y = (poiMapPercent(poi).y / 100) * h;
    // Hot POIs have larger radius; normal POIs are smaller to avoid uniform glow
    const rangeScale = clampNumber(0.78 + radiusKm * 0.12, 0.95, 1.42);
    const baseRadius = isMini ? 13 : (isHot ? 30 : 17);
    const radius = (baseRadius + intensity * (isMini ? 28 : (isHot ? 76 : 48))) * rangeScale;
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
  const list = gaodePOIs.length ? gaodePOIs : filteredMockPois(appState.selectedCategory);
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
  updateAreaPill();
}

function updateSceneNavigator() {
  const el = document.getElementById("filterTabsRow");
  if (!el) return;
  el.hidden = false;
  // Direct category chips with emoji — filter by category name
  const CAT_CHIPS = [
    { label: "全部", emoji: "🗺", filter: "全部" },
    { label: "餐厅", emoji: "🍜", filter: "餐厅" },
    { label: "咖啡", emoji: "☕", filter: "咖啡" },
    { label: "KTV", emoji: "🎤", filter: "KTV" },
    { label: "酒吧", emoji: "🍸", filter: "酒吧" },
    { label: "夜宵", emoji: "🌙", filter: "夜宵" },
    { label: "攀岩", emoji: "🧗", filter: "攀岩" },
    { label: "骑行", emoji: "🚴", filter: "骑行" },
    { label: "桌游", emoji: "🎲", filter: "桌游" }
  ];
  const active = appState.selectedCategory || "全部";
  el.innerHTML = CAT_CHIPS.map((chip) => {
    const isActive = chip.filter === active || (chip.filter === "全部" && active === "全部");
    return `<button type="button" class="dv2-cat-chip ${isActive ? "is-active" : ""}" data-cat-filter="${chip.filter}">
      <span class="dv2-cat-emoji">${chip.emoji}</span>
      <span>${escapeHTML(chip.label)}</span>
    </button>`;
  }).join("");
  el.querySelectorAll("[data-cat-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.catFilter;
      appState.selectedCategory = cat;
      // filteredMockPois 按 categoryToActivity 字符串或 "全部" 过滤，
      // 对原始 category 名（餐厅/咖啡/KTV…）直接按 poi.category 过滤
      const base = filteredMockPois("全部");
      gaodePOIs = cat === "全部" ? base : base.filter((p) => p.category === cat);
      updateSceneNavigator();
      if (leafletMap) renderLeafletPins();
      else renderMockMapPins();
      updatePOISheet();
      updateRefMapHeading();
      updateDiscoverRecommend();
    });
  });
}

function updateDiscoverRecommend() {
  const el = document.getElementById("discoverRecommend");
  if (!el) return;
  el.hidden = false;

  const list = rankedMapPois(gaodePOIs.length ? gaodePOIs : filteredMockPois(appState.selectedCategory));

  // Unified data source: use getFakeDemands (same as POI sheet) per ranked POI
  const allDemands = [];
  for (const poi of list.slice(0, 12)) {
    const demands = getFakeDemands(poi);
    for (const d of demands.slice(0, 2)) {
      allDemands.push({ ...d, poi });
      if (allDemands.length >= 5) break;
    }
    if (allDemands.length >= 5) break;
  }

  const joinCount = allDemands.length;

  el.innerHTML = `
    <div class="djl-root">
      <div class="djl-head">
        <span class="djl-head-title">可加入的局</span>
        ${joinCount ? `<span class="djl-head-count">${joinCount} 个</span>` : ""}
      </div>
      ${joinCount ? `
        <div class="djl-list">
          ${allDemands.map((d) => {
            const poi = d.poi || pois.find((p) => p.poi_id === d.poi_id);
            const nickname = d.nickname || d.demandUser?.nickname || "搭子";
            const seed = d.demand_id || nickname;
            const { bg, color } = avatarHashColor(seed);
            const walkMin = poi ? Math.max(2, Math.round((poi.distance_km || 1) * 12)) : "?";
            const dealText = poi ? merchantDealShort(poi) : "";
            return `
              <button type="button" class="djl-row ${d.isMyDemand ? "djl-row-mine" : ""}" data-join-demand="${escapeHTML(d.demand_id)}">
                <span class="djl-avatar" style="background:${bg};color:${color};">${escapeHTML(nickname[0])}</span>
                <span class="djl-body">
                  <span class="djl-row-top">
                    <b>${escapeHTML(poi?.name || "附近地点")}</b>
                    ${d.isMyDemand ? `<span class="djl-mine-badge">我发起</span>` : `<em>${escapeHTML(d.time || d.target_time || "今晚")}</em>`}
                  </span>
                  <span class="djl-row-sub">${escapeHTML(d.activity_type || "搭子")} · ¥${d.budget_min}–${d.budget_max} · 步行 ${walkMin} 分钟</span>
                  ${dealText ? `<span class="djl-deal-tag">${escapeHTML(dealText)}</span>` : ""}
                </span>
                ${d.isMyDemand ? `<span class="djl-mine-status">等待中</span>` : `<span class="djl-join-btn">加入</span>`}
              </button>`;
          }).join("")}
        </div>
      ` : `
        <div class="djl-empty">
          <span class="djl-empty-icon">🔍</span>
          <b>当前筛选下暂无可加入的局</b>
          <p>切换上方品类，或点地图商家用 AI 快速匹配</p>
        </div>
      `}
    </div>`;

  el.querySelectorAll("[data-join-demand]").forEach((btn) => {
    btn.addEventListener("click", () => joinDemand(btn.dataset.joinDemand));
  });
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
    el.innerHTML = `<div class="${TW.refPoiBody}"><p class="${TW.muted}">当前生活圈和类型下没有可显示的商家，换个圈子或类型试试。</p></div>`;
    return;
  }
  const poi = appState.selectedPOI;
  const demands = getFakeDemands(poi);
  const walkMin = Math.max(3, Math.round(Number(poi.distance_km || 0.8) * 12));
  const opportunityScore = computeOpportunityScore(poi);
  const tab = appState.poiSheetTab || "demands";

  el.innerHTML = `
    <!-- Hero -->
    <div class="dv2-poi-hero" style="background-image:url('${poiCoverImage(poi)}')">
      <div class="dv2-poi-hero-overlay">
        <div class="dv2-poi-hero-badges">
          <span class="dv2-badge-open">${escapeHTML(poi.open_status || "营业中")}</span>
          ${isHotPoi(poi) ? `<span class="dv2-badge-hot">🔥 热门</span>` : ""}
        </div>
        <div class="dv2-poi-hero-info">
          <p class="dv2-poi-kicker">${escapeHTML(poiEmoji(poi))} ${escapeHTML(categoryToActivity(poi))}</p>
          <h2 class="dv2-poi-name">${escapeHTML(poi.name)}</h2>
          <div class="dv2-poi-quick-meta">
            <span>⭐ ${poi.rating}</span>
            <span>·</span>
            <span>${walkMin} 分钟可达</span>
            <span>·</span>
            <span>¥${poi.avg_price}/人</span>
          </div>
        </div>
      </div>
      <div class="dv2-poi-opp-badge"><b>${opportunityScore}</b><small>机会分</small></div>
    </div>

    <!-- Tab 导航 -->
    <div class="dv2-poi-tabs">
      <button class="dv2-poi-tab ${tab === "demands" ? "is-active" : ""}" data-poi-tab="demands">可加入的局</button>
      <button class="dv2-poi-tab ${tab === "create" ? "is-active" : ""}" data-poi-tab="create">创建新局</button>
      <button class="dv2-poi-tab ${tab === "info" ? "is-active" : ""}" data-poi-tab="info">商家信息</button>
    </div>

    <!-- Tab 内容 -->
    <div id="poiTabContent" class="dv2-poi-tab-body">
      ${renderPoiTabContent(tab, poi, demands)}
    </div>
  `;

  el.querySelectorAll("[data-poi-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.poiSheetTab = btn.dataset.poiTab;
      updatePOISheet();
    });
  });
  el.querySelectorAll(".ref-live-row[data-demand]").forEach((card) => {
    card.addEventListener("click", () => joinDemandFromRefSheet(card.dataset.demand, poi, demands));
  });
  bindRefPoiActions(poi, demands);
  bindCreateTabListeners(poi);
  updateRefMapHeading();
}

function renderPoiTabContent(tab, poi, demands) {
  if (tab === "create") return renderCreateSessionTab(poi);
  if (tab === "info") return renderMerchantInfoTab(poi);
  return renderDemandsTab(poi, demands);
}

function renderDemandsTab(poi, demands) {
  const visibleDemands = demands.slice(0, 3);
  const liveCount = Number(poi.buddy_demand_count || 0);
  const waitText = merchantWaitLabel(poi);
  const dealText = merchantDealShort(poi);
  const groupLabel = liveCount >= 2 ? `${liveCount} 人正在组局` : liveCount >= 1 ? "正在组局" : "可以发起组局";
  const primaryLabel = visibleDemands.length ? "加入最近组局" : "AI 快速匹配";
  return `
    <div class="ref-poi-metric-grid">
      <span><b>${liveCount}</b><small>想约</small></span>
      <span><b>${poi.wait_time_min}min</b><small>${escapeHTML(waitText)}</small></span>
      <span><b>¥${poi.avg_price}</b><small>人均</small></span>
    </div>
    <p class="${TW.refPoiMeta}">${escapeHTML(poi.sub_category)} · ${escapeHTML(groupLabel)} · ${escapeHTML(dealText)}</p>
    ${visibleDemands.length ? `
      <div class="${TW.refLiveHead}">
        <h3 class="text-[15px] font-bold text-ink">附近正在约</h3>
        <span>${visibleDemands.length} 个可加入</span>
      </div>
      ${visibleDemands.map((d) => refDemandRowHTML(d)).join("")}
    ` : `
      <div class="ref-empty-live">
        <b>暂时没有公开局</b>
        <p>可以让 AI 按预算、距离和聊天风格帮你发起匹配。</p>
      </div>
    `}
    <div class="dv2-cta-row">
      <button type="button" class="dv2-btn-primary" id="poiJoinBtn">${primaryLabel}</button>
      <button type="button" class="dv2-btn-secondary" id="matchFromPoi">让 Agent 安排</button>
    </div>
  `;
}

function renderCreateSessionTab(poi) {
  const budgetBase = Math.max(40, Math.round(Number(poi.avg_price || 80) / 10) * 10);
  const timeOptions = ["今晚 18:00", "今晚 19:30", "今晚 21:00", "周末 15:00"];
  const budgetOptions = [Math.max(40, budgetBase - 20), budgetBase, budgetBase + 30];
  return `
    <div class="create-session-form">
      <p class="create-session-heading">在 <b>${escapeHTML(poi.name)}</b> 发起一个局</p>
      <div class="create-field-row">
        <label class="create-field-label">活动时间</label>
        <div class="create-time-grid">
          ${timeOptions.map((t) => `<button type="button" class="create-time-opt" data-t="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join("")}
        </div>
        <input id="createTimeCustom" class="create-input" value="${timeOptions[1]}" placeholder="或自定义时间..." />
      </div>
      <div class="create-two-col">
        <div class="create-field-row">
          <label class="create-field-label">人数</label>
          <div class="create-count-row">
            <button type="button" id="createGroupMinus" class="create-count-btn">−</button>
            <input id="createGroupInput" type="number" min="1" max="12" value="2" class="create-count-input" />
            <button type="button" id="createGroupPlus" class="create-count-btn">+</button>
          </div>
        </div>
        <div class="create-field-row">
          <label class="create-field-label">人均预算</label>
          <div class="create-budget-row">
            <span class="create-budget-symbol">¥</span>
            <input id="createBudgetInput" type="number" min="0" step="10" value="${budgetBase}" class="create-budget-input" />
          </div>
          <div class="create-budget-chips">
            ${budgetOptions.map((a) => `<button type="button" class="create-budget-chip" data-budget="${a}">¥${a}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="create-field-row">
        <label class="create-field-label">聊天氛围</label>
        <div class="create-style-row">
          ${["轻松聊天", "低压力 1v1", "小组热闹", "安静陪伴"].map((s) => `<button type="button" class="create-style-opt" data-style="${s}">${s}</button>`).join("")}
        </div>
      </div>
      <button type="button" class="create-submit-btn" id="createSessionSubmit">发起这个局 →</button>
    </div>
  `;
}

function renderMerchantInfoTab(poi) {
  const deal = getDeal(poi.poi_id);
  const walkMin = Math.max(3, Math.round(Number(poi.distance_km || 0.8) * 12));
  const tags = (poi.tags || []).slice(0, 6);
  const hours = poi.business_hours || "11:00–22:00";
  const address = poi.address || `${getCurrentCity().areaName || "附近"} · ${poi.sub_category}`;
  const social = (poi.suitable_social_styles || []).slice(0, 3);
  return `
    <div class="merchant-info-body">
      <div class="merchant-info-meta-row">
        <span class="merchant-info-rating">⭐ ${poi.rating}</span>
        <span>${escapeHTML(poi.sub_category)}</span>
        <span>${poi.distance_km}km</span>
        <span>步行约 ${walkMin} 分钟</span>
      </div>
      <div class="merchant-info-grid">
        <div><b>¥${poi.avg_price}</b><small>人均消费</small></div>
        <div><b>${poi.wait_time_min}min</b><small>当前等待</small></div>
        <div><b>${poi.buddy_demand_count}</b><small>人想约</small></div>
        <div><b>${escapeHTML(poi.open_status || "营业中")}</b><small>状态</small></div>
      </div>
      <div class="merchant-info-row">
        <span class="merchant-info-icon">🕐</span>
        <span>${escapeHTML(hours)}</span>
      </div>
      <div class="merchant-info-row">
        <span class="merchant-info-icon">📍</span>
        <span>${escapeHTML(address)}</span>
      </div>
      ${deal ? `
        <div class="merchant-deal-row">
          <span class="deal-badge">团购</span>
          <div>
            <b>${escapeHTML(deal.title)}</b>
            <p>¥${deal.discount_price} · 省 ¥${Math.max(0, deal.original_price - deal.discount_price)} · ${escapeHTML(deal.valid_time || "今日可用")}</p>
          </div>
        </div>
      ` : ""}
      ${tags.length ? `<div class="merchant-info-tags">${tags.map((t) => `<span>${escapeHTML(t)}</span>`).join("")}</div>` : ""}
      ${social.length ? `<div class="merchant-info-social"><span class="merchant-info-label">适合</span>${social.map((s) => `<span>${escapeHTML(s)}</span>`).join("")}</div>` : ""}
      <div class="dv2-cta-row" style="margin-top:12px;">
        <button type="button" class="dv2-btn-primary" id="matchFromPoi">找搭子去这里</button>
        <button type="button" class="dv2-btn-secondary" id="poiNavBtn">导航出发</button>
      </div>
    </div>
  `;
}

function bindCreateTabListeners(poi) {
  const el = document.getElementById("poiTabContent");
  if (!el || appState.poiSheetTab !== "create") return;

  // Time option selection
  el.querySelectorAll(".create-time-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".create-time-opt").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const input = document.getElementById("createTimeCustom");
      if (input) input.value = btn.dataset.t;
    });
  });
  el.querySelector(".create-time-opt")?.classList.add("is-active");

  // Style selection
  el.querySelectorAll(".create-style-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".create-style-opt").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });
  el.querySelector(".create-style-opt")?.classList.add("is-active");

  // Budget chips
  el.querySelectorAll(".create-budget-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".create-budget-chip").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const input = document.getElementById("createBudgetInput");
      if (input) input.value = btn.dataset.budget;
    });
  });

  // Group count
  document.getElementById("createGroupMinus")?.addEventListener("click", () => {
    const inp = document.getElementById("createGroupInput");
    if (inp) inp.value = Math.max(1, Number(inp.value) - 1);
  });
  document.getElementById("createGroupPlus")?.addEventListener("click", () => {
    const inp = document.getElementById("createGroupInput");
    if (inp) inp.value = Math.min(12, Number(inp.value) + 1);
  });

  // Submit
  document.getElementById("createSessionSubmit")?.addEventListener("click", () => {
    const time = document.getElementById("createTimeCustom")?.value || "今晚 19:30";
    const size = Number(document.getElementById("createGroupInput")?.value || 2);
    const budget = Number(document.getElementById("createBudgetInput")?.value || poi.avg_price);
    const style = el.querySelector(".create-style-opt.is-active")?.dataset.style || "轻松聊天";
    const me = window.mockData?.currentUser || {};
    const newDemand = {
      demand_id: `user_created_${Date.now()}`,
      poi_id: poi.poi_id,
      nickname: me.nickname || "我",
      demandUser: me,
      time,
      style,
      size: size > 1 ? `${size} 人` : "1v1",
      note: `${categoryToActivity(poi)} · ¥${budget} 以内 · ${style}`,
      budget_min: Math.max(0, budget - 10),
      budget_max: budget,
      activity_type: categoryToActivity(poi),
      isMyDemand: true
    };
    appState.userCreatedDemands.unshift(newDemand);
    appState.poiSheetTab = "demands";
    updatePOISheet();
    updateDiscoverRecommend();
    showToast(`已在 ${poi.name} 发起局，快来找搭子吧 🎉`);
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

function refDemandRowHTML(demand) {
  const user = demand.demandUser || {};
  const verified = user.verified_status;
  const { bg, color } = avatarHashColor(demand.demand_id || demand.nickname || "?");
  return `
    <button type="button" class="${TW.refLiveRow} ${demand.isMyDemand ? "ref-live-row-mine" : ""}" data-demand="${demand.demand_id}">
      <span class="${TW.refLiveAvatar}" style="background:${bg};color:${color};">${escapeHTML(String(demand.nickname || "搭")[0])}</span>
      <span class="${TW.refLiveBody}">
        <b>${escapeHTML(demand.time || "今晚")} · ${escapeHTML(demand.size || "1v1")}
          ${demand.isMyDemand ? `<span style="font-size:10px;background:#FFF8CC;color:#92700a;border-radius:4px;padding:1px 5px;margin-left:4px;">我发起</span>` : ""}
          ${verified && !demand.isMyDemand ? `<span class="${TW.refVerified}">已验证</span>` : ""}
        </b>
        <p>${escapeHTML(demand.note || demand.style || "轻松组局")}</p>
      </span>
      <span class="${TW.refLiveJoin}">${demand.isMyDemand ? "等待中" : "加入"}</span>
    </button>
  `;
}

function demandCardHTML(demand, isSelected) {
  const user = demand.demandUser || {};
  const verified = user.verified_status;
  return `
    <button type="button" class="${TW.mapDemandRow} ${isSelected ? "is-selected" : ""}" data-demand="${demand.demand_id}">
      <div class="${TW.mapDemandAvatar}">${escapeHTML(String(demand.nickname || "搭")[0])}</div>
      <div class="${TW.mapDemandBody}">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          <b style="font-size:13px;">${escapeHTML(demand.time || "今晚")}</b>
          ${verified ? `<span class="${TW.verifiedBadge}">已验证</span>` : ""}
          <span style="font-size:11px;color:#6b7280;">${escapeHTML(demand.size || "1v1")}</span>
        </div>
        <p style="font-size:12px;color:#6b7280;margin-top:1px;">${escapeHTML(demand.note || demand.style || "轻松组局")}</p>
      </div>
      <span class="${TW.mapDemandJoin}">加入</span>
    </button>
  `;
}

function getFakeDemands(poi) {
  // User-created demands for this POI come first
  const userCreated = (appState.userCreatedDemands || []).filter((d) => d.poi_id === poi.poi_id);

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
  if (userCreated.length || real.length) return [...userCreated, ...real].slice(0, 4);

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
