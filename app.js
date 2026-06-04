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
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => navigate(item.dataset.page)));
  render();
  setTimeout(() => runDemoScriptIfPresent(), 900);
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
  scrollCurrentPageToTop();
}

function setPage(page) {
  appState.currentPage = page;
  render();
  scrollCurrentPageToTop();
}

function scrollCurrentPageToTop() {
  requestAnimationFrame(() => {
    const activeId = appState.currentPage === "map" ? "mapPage" : appState.currentPage === "ai" ? "aiPage" : appState.currentPage === "chat" ? "chatPage" : appState.currentPage === "success" ? "successPage" : "profilePage";
    const el = document.getElementById(activeId);
    if (el) el.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function render() {
  const pageIds = ["mapPage", "aiPage", "chatPage", "successPage", "profilePage"];
  const activeId = appState.currentPage === "map" ? "mapPage" : appState.currentPage === "ai" ? "aiPage" : appState.currentPage === "chat" ? "chatPage" : appState.currentPage === "success" ? "successPage" : "profilePage";
  pageIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("hidden", id !== activeId);
    el.classList.toggle("block", id === activeId);
  });
  $$(".nav-item").forEach((item) => {
    const active = item.dataset.page === appState.currentPage || (appState.currentPage === "success" && item.dataset.page === "chat");
    const isMatchNav = item.dataset.page === "ai";
    item.classList.toggle("text-ink", active);
    item.classList.toggle("text-muted", !active);
    const icon = item.querySelector(".nav-icon");
    if (!icon) return;
    icon.classList.remove("bg-ink", "bg-brand", "text-white", "text-brand-ink", "rounded-xl", "rounded-lg");
    if (active) {
      icon.classList.add("rounded-xl");
      if (isMatchNav) {
        icon.classList.add("bg-brand", "text-brand-ink");
      } else {
        icon.classList.add("bg-ink", "text-white");
      }
    } else {
      icon.classList.add("rounded-lg");
    }
  });
  updateChatNavBadge();
  document.body.classList.toggle("is-discover-page", appState.currentPage === "map");
  document.body.classList.toggle("is-match-page", appState.currentPage === "ai");
  document.body.classList.toggle("is-chat-page", appState.currentPage === "chat");
  document.body.classList.toggle("has-developer-controls", canShowDeveloperControls());
  if (appState.currentPage === "map") renderMapPage();
  else updateAreaPill();
  renderAIPage();
  renderChatPage();
  renderSuccessPage();
  renderProfilePage();
  renderDepositSheet();
  renderPreferenceDrawer();
  renderToast();
}


function loadAmapSdkIfNeeded(onReady) {
  const key = String(window.AMAP_KEY || window.__RUNTIME_CONFIG?.amapKey || "").trim();
  if (!key) {
    return Promise.resolve(false);
  }
  if ("AMap" in window) {
    if (typeof onReady === "function") onReady();
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.onload = () => {
      const ok = "AMap" in window;
      if (ok && typeof onReady === "function") onReady();
      finish(ok);
    };
    script.onerror = () => {
      console.warn("[AMap] SDK 加载失败，已降级为示意地图。请检查 AMAP_KEY 与控制台域名白名单。");
      finish(false);
    };
    document.head.appendChild(script);
    setTimeout(() => {
      if (!("AMap" in window)) {
        console.warn("[AMap] SDK 加载超时，已降级为示意地图。");
        finish(false);
      }
    }, 8000);
  });
}

loadAmapSdkIfNeeded(() => {
  if (typeof upgradeToRealMapIfPossible === "function") {
    upgradeToRealMapIfPossible();
  }
});
init();
