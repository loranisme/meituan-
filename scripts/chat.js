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
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
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
  const showDevControls = canShowDeveloperControls();
  return `
    <section class="${TW.card} result-fade coordinator-summary-card">
      <p class="${TW.eyebrow}" style="margin-bottom:8px;">已帮你们对齐</p>
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
      <p style="font-size:12px;color:#9ca3af;margin-top:10px;">等待对方确认中，确认后会生成成局卡片。</p>
      ${showDevControls && appState.developerMode ? `<p style="font-size:12px;color:#9ca3af;margin-top:4px;">开发者态可在下方模拟对方操作。</p>` : ""}
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
      <section class="${TW.card} ${TW.gcHeaderCard} chat-detail-header">
        <button type="button" class="${TW.backTextBtn} chat-back-btn" id="backToList">消息</button>
        <div class="${TW.gcHeaderInfo} chat-detail-title">
          <div>
            <p>${escapeHTML(categoryToActivity(gc.poi))}</p>
            <h2>${escapeHTML(gc.poi.name)}</h2>
            <span>${gc.members.map((m) => escapeHTML(m.nickname)).join(" · ")}</span>
          </div>
        </div>
      </section>
      <section class="chat-appointment-card">
        <div>
          <span>约定详情</span>
          <b>${escapeHTML(gc.poi.name)}</b>
        </div>
        <dl>
          <div><dt>时间</dt><dd>${escapeHTML(gc.suggested_time)}</dd></div>
          <div><dt>人均</dt><dd>¥${gc.poi.avg_price}</dd></div>
          <div><dt>类型</dt><dd>${escapeHTML(gc.poi.sub_category || gc.poi.category)}</dd></div>
        </dl>
      </section>
      <section class="${TW.messagesCard} ${TW.card}">
        <div class="chat-card-title"><span>聊天</span></div>
        <div class="chat-message-scroll">
          ${gc.messages.map((m) => {
            if (m.sender === "system") return `<div class="${TW.message} ${TW.systemMsg}"><span>${m.text}</span></div>`;
            return renderMessage(m);
          }).join("")}
        </div>
        <div class="chat-input-dock">
          <div class="${TW.quickReplies}">
            ${["收到！", "我在路上", "稍等一下", "已到门口"].map((t) => `<button data-gcquick="${t}">${t}</button>`).join("")}
          </div>
          <div class="${TW.chatComposer}">
            <input id="gcInput" placeholder="输入群消息" />
            <button class="${TW.primaryButton}" id="gcSend">发送</button>
          </div>
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
    const msgCard = $("#chatPage .chat-message-scroll");
    if (msgCard) msgCard.scrollTop = msgCard.scrollHeight;
    return;
  }

  // Case 2: viewing active match chat (in-progress match)
  if (appState.viewingGroupChatId === "__active__" && appState.selectedMatch) {
    const match = appState.selectedMatch;
    const deal = getDeal(match.poi.poi_id);
    const planMeta = currentPlanStatusMeta();
    const showDevControls = canShowDeveloperControls();
    const backupPoiName = match.backup_poi ? match.backup_poi.name : "同类附近地点";
    $("#chatPage").innerHTML = `
      <section class="${TW.card} ${TW.gcHeaderCard}">
        <button type="button" class="${TW.backTextBtn}" id="backFromActive">← 消息</button>
        <div class="${TW.gcHeaderInfo}">
          <div style="flex:1;min-width:0;">
            <h2 style="font-size:16px;">${match.user.nickname}${match.user.verified_status ? ' <span class="${TW.verifiedBadge}">已验证</span>' : ""}</h2>
            <p class="${TW.muted}" style="font-size:12px;">${match.total_score}% 匹配 · ${match.user.social_style} · ${match.user.distance_km}km</p>
          </div>
          <span class="${TW.activeMatchBadge}">进行中</span>
        </div>
      </section>
      ${showDevControls ? `<div class="chat-dev-toggle-row">
        <button type="button" class="developer-toggle ${appState.developerMode ? "is-active" : ""}" id="chatDeveloperMode" aria-pressed="${appState.developerMode ? "true" : "false"}">开发者模式</button>
      </div>` : ""}
      <section class="chat-plan-card">
        <div class="chat-plan-head">
          <div>
            <p>此次出行</p>
          </div>
          <button class="${TW.safetyButton} chat-safety-button" id="safetyOptions">安全选项</button>
        </div>
        <div class="chat-trip-chips">
          <span>${match.intent.activity_type}</span>
          <span>¥${match.intent.budget_min}–${match.intent.budget_max}</span>
          <span>${match.intent.social_style}</span>
          <span>${match.intent.group_size}</span>
          <span>${match.intent.target_time}</span>
        </div>
        ${appState.replanningNotice ? `<p class="chat-plan-notice">${appState.replanningNotice}</p>` : ""}
        <div class="chat-plan-status">
          <div class="chat-plan-status-row">
            <span>当前局态</span>
            <b>${planMeta.label}</b>
          </div>
          <div class="${TW.progressTrack}">
            <div class="${TW.progressFill}" style="width:${planMeta.progress}%;"></div>
          </div>
        </div>
        <div class="chat-plan-detail">
          <p class="${TW.eyebrow}">方案确认</p>
          <h3>${match.poi.name}</h3>
          <p>${match.suggested_time} · ${match.intent.group_size} · 预算 ¥${match.intent.budget_min}–${match.intent.budget_max}</p>
          <p class="${TW.muted}">${match.poi.sub_category} · 人均 ¥${match.poi.avg_price} · 等待 ${match.poi.wait_time_min} 分钟 · 备选 ${backupPoiName}</p>
          <div class="${TW.dealStrip}">${deal.title}</div>
        </div>
        <div class="${TW.confirmRow}">
          <span class="${appState.currentUserConfirmed ? "ok" : ""}">我 ${appState.currentUserConfirmed ? "已确认" : "待确认"}</span>
          <span class="${appState.matchedUserConfirmed ? "ok" : ""}">对方 ${appState.matchedUserConfirmed ? "已确认" : "待确认"}</span>
        </div>
        ${appState.planStatus === PLAN_STATUS.LOCKED_WAITING_PEER ? `
          <div class="chat-peer-confirming">
            <span class="chat-peer-dot"></span>
            <span>对方确认中…</span>
          </div>` : ""}
        <div class="${TW.actionGrid}">
          ${appState.planStatus === PLAN_STATUS.LOCKED_WAITING_PEER ? `
            ${showDevControls && appState.developerMode ? `
              <button class="${TW.secondaryButton}" id="simPeerReject">模拟对方拒绝</button>
              <button class="${TW.secondaryButton}" id="simTimeout">模拟等待超时</button>
            ` : ""}
          ` : appState.planStatus === PLAN_STATUS.CONFIRMED ? `
            <button class="${TW.primaryButton} ${TW.wide}" id="goToSuccess">查看成局详情 →</button>
          ` : `
            <button class="${TW.primaryButton}" id="confirmMatch" ${appState.currentUserConfirmed ? "disabled" : ""}>我确认</button>
            <button class="${TW.secondaryButton}" id="changePlace">换地点</button>
            ${showDevControls && appState.developerMode ? `
              <button class="${TW.secondaryButton}" id="simulateWait">模拟排队变长</button>
              <button class="${TW.secondaryButton}" id="simulateReject">模拟对方拒绝</button>
            ` : ""}
          `}
        </div>
        ${appState.fallbackSuggestion ? `<p style="margin-top:8px;color:#92400e;background:#fffbeb;border-radius:10px;padding:8px 10px;">${appState.fallbackSuggestion}</p>` : ""}
        ${renderRejectRematchCard()}
        ${appState.planStatus === PLAN_STATUS.FALLBACK_READY ? `<button class="${TW.primaryButton} ${TW.wide}" id="acceptFallback" style="margin-top:8px;">接受候补方案</button>` : ""}
        ${showDevControls && appState.developerMode && appState.debugMeta ? `<details class="dev-details" style="margin-top:8px;"><summary style="cursor:pointer;color:#6b7280;">调试字段（并发叙事）</summary><p style="margin-top:6px;font-size:12px;color:#6b7280;">match_version: ${appState.debugMeta.match_version}<br/>reservation_ttl: ${appState.debugMeta.reservation_ttl}<br/>idempotency_key: ${appState.debugMeta.idempotency_key}</p></details>` : ""}
      </section>
      <section class="${TW.messagesCard} ${TW.card}">
        <div class="chat-card-title"><span>聊天</span></div>
        <div class="chat-message-scroll">
          ${appState.chatThread.messages.map(renderMessage).join("")}
          ${appState.pendingSuccess ? `<div class="${TW.confirmingBanner}">双方已确认，正在生成成局卡片...</div>` : ""}
        </div>
        <div class="chat-input-dock">
          <div class="${TW.quickReplies}">
            ${["可以", "想换一家", "时间短一点", "时间晚一点", "预算有点高", "直接确认"].map((text) => `<button data-quick="${text}">${text}</button>`).join("")}
          </div>
          <div class="${TW.chatComposer}">
            <input id="chatInput" placeholder="输入消息" />
            <button class="${TW.primaryButton}" id="sendMessage">发送</button>
          </div>
        </div>
      </section>
    `;
    $("#backFromActive").addEventListener("click", backToList);
    $("#chatDeveloperMode")?.addEventListener("click", () => {
      appState.developerMode = !appState.developerMode;
      render();
    });
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
    const activeMsg = $("#chatPage .chat-message-scroll");
    if (activeMsg) activeMsg.scrollTop = activeMsg.scrollHeight;
    return;
  }

  // Case 3: chat list (WeChat-style, always the default)
  const activeMatch = appState.selectedMatch;
  const allChats = appState.groupChats;
  const lastMsg = (msgs) => msgs[msgs.length - 1]?.text || "";

  if (!activeMatch && allChats.length === 0) {
    $("#chatPage").innerHTML = `
      <header class="${TW.chatPageHeader}"><h1>消息</h1></header>
      <section class="${TW.card} ${TW.emptyState}">
        <h2>还没有消息</h2>
        <p>从地图加入一个局，或使用快速匹配。</p>
        <button class="${TW.primaryButton} ${TW.wide}" id="goAI">去快速匹配</button>
      </section>`;
    $("#goAI").addEventListener("click", () => setPage("ai"));
    return;
  }

  $("#chatPage").innerHTML = `
    <header class="${TW.chatPageHeader} chat-list-header"><h1>消息</h1><p>${allChats.length + (activeMatch ? 1 : 0)} 个会话</p></header>
    ${activeMatch ? `
      <article class="${TW.groupListItem} ${TW.card} ${TW.activeChatItem} chat-thread-card" id="openActiveMatch">
        <div class="${TW.gcListIcon} ${TW.activeChatIcon}">${activeMatch.user.nickname[0]}</div>
        <div class="${TW.gcListBody}">
          <div class="chat-thread-top">
            <h3 style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${activeMatch.user.nickname} · ${activeMatch.poi.name}</h3>
            <span class="${TW.activeMatchBadge}">进行中</span>
          </div>
          <p>${activeMatch.suggested_time} · ${activeMatch.intent.activity_type}</p>
          <small class="${TW.muted}">${lastMsg(appState.chatThread?.messages || [])}</small>
        </div>
      </article>
    ` : ""}
    ${allChats.map((gc) => `
      <article class="${TW.groupListItem} ${TW.card} chat-thread-card" data-gcid="${gc.group_id}">
        <div class="${TW.gcListIcon}">${poiBadgeHTML(gc.poi)}</div>
        <div class="${TW.gcListBody}">
          <div class="chat-thread-top">
            <h3 style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${gc.name}</h3>
            <span class="${TW.gcListTime}">${gc.createdAt}</span>
          </div>
          <p>${gc.suggested_time} · ${gc.members.map((m) => m.nickname).join("、")}</p>
          <small class="${TW.muted}">${lastMsg(gc.messages)}</small>
        </div>
      </article>
    `).join("")}
  `;
  if (activeMatch) {
    $("#openActiveMatch").addEventListener("click", () => {
      appState.viewingGroupChatId = "__active__";
      render();
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    });
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
      brief: `检测到 ${match.poi.name} 等待时间可能升至 ${nextWait} 分钟。下面是等待更短、预算接近的候选店，你可以换店，也可以继续等原店。`,
      modeLabel: "低等待优先",
      nextWait
    };
  }
  return {
    title: "换地点候选",
    brief: `已按 ${match.intent.category_preference}、预算、距离和等待时间筛出更接近当前方案的餐厅。`,
    modeLabel: "换一家候选",
    nextWait: match.poi.wait_time_min
  };
}

function openReplanChooser(eventType, match = appState.selectedMatch, options = {}) {
  if (!match) return;
  const existing = document.getElementById("replanChoiceModal");
  if (existing) existing.remove();
  const copy = replanModalCopy(eventType, match);
  const candidates = rankReplanCandidates(match, eventType);
  const showDevControls = canShowDeveloperControls() && appState.developerMode;
  const userReason = (item) => {
    if (eventType === "waiting_time_change" && Number(item.poi.wait_time_min || 0) <= 12) return "等待更短";
    if (item.categoryScore >= 82) return "品类最接近";
    if (item.distanceScore >= 82) return "距离更近";
    return "条件更稳";
  };
  const overlay = document.createElement("div");
  overlay.id = "replanChoiceModal";
  overlay.className = "modal-overlay replan-modal-overlay";
  overlay.innerHTML = `
    <div class="${TW.modalSheet} replan-sheet">
      <div class="${TW.modalHeader} replan-header">
        <div>
          <p class="${TW.eyebrow}">${copy.modeLabel}</p>
          <h2>${copy.title}</h2>
        </div>
        <button class="${TW.modalClose}" id="closeReplanModal" aria-label="关闭">关闭</button>
      </div>
      <div class="${TW.replanBody}">
        <div class="${TW.replanContext} replan-context">
          <div class="replan-current">
            <span>当前方案</span>
            <b>${match.poi.name}</b>
          </div>
          <p>${copy.brief}</p>
          ${showDevControls ? `<p class="${TW.scoreFormula} replan-score-formula">综合分 = 品类相似 26% + 等待友好 22% + 人均相近 17% + 距离 13% + 评分 10% + 对方偏好 12%</p>` : ""}
          <div class="${TW.candidateMetrics} replan-current-metrics">
            <span>当前等待 ${match.poi.wait_time_min}min</span>
            <span>人均 ¥${match.poi.avg_price}</span>
            <span>${match.intent.social_style}</span>
          </div>
        </div>
        <div class="${TW.replanCandidateList}">
          ${candidates.map((item, index) => `
            <article class="${TW.replanCandidate} replan-candidate-card">
              <div class="${TW.candidateHead} replan-candidate-head">
                <span class="${TW.rankBadge}">#${index + 1}</span>
                <div>
	                  <b>${item.poi.name}</b>
	                  <p>${item.poi.sub_category} · ${item.poi.distance_km}km · ${item.poi.rating}分</p>
	                </div>
	                <strong><span>${userReason(item)}</span>${showDevControls ? item.rankScore : `${item.poi.wait_time_min}min`}<small>${showDevControls ? "分" : "等待"}</small></strong>
	              </div>
	              <div class="${TW.candidateMetrics} replan-user-metrics">
	                <span>等待 ${item.poi.wait_time_min}min</span>
	                <span>${item.poi.distance_km}km</span>
	                <span>人均 ¥${item.poi.avg_price}</span>
	              </div>
	              ${showDevControls ? `<div class="${TW.candidateMetrics} replan-dev-metrics">
	                <span>品类 ${item.categoryScore}</span>
	                <span>等待 ${item.waitScore}</span>
	                <span>人均 ${item.priceScore}</span>
	                <span>偏好 ${item.peerScore}</span>
	              </div>` : ""}
              <p class="${TW.candidateReason}">${item.reasons.join(" · ")}</p>
              <button class="${TW.primaryButton} ${TW.wide} replan-choose-btn" data-choose-replan="${index}">选择并发给对方确认</button>
            </article>
          `).join("") || `<p class="${TW.empty}">当前没有足够接近的候选店，可以继续保留原方案。</p>`}
        </div>
        ${eventType === "waiting_time_change" ? `
          <div class="${TW.waitChoiceRow}">
            <button class="${TW.secondaryButton} ${TW.wide}" id="keepWaitingBtn">继续等原店</button>
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
  const devNotice = `AI 相似度排序 #${options.resultIndex !== undefined ? "A" : "1"}：已选择 ${item.poi.name}（${item.rankScore}分）。${item.reasons.join("，")}。`;
  const userNotice = `已选择 ${item.poi.name}，等待 ${item.poi.wait_time_min} 分钟，人均 ¥${item.poi.avg_price}。${item.reasons.slice(0, 2).join("，")}。`;
  const nextMatch = {
    ...match,
    poi: item.poi,
    backup_poi: findDealBackup(item.poi),
    suggested_time: eventType === "waiting_time_change" ? match.suggested_time : match.suggested_time,
    replanning_notice: canShowDeveloperControls() && appState.developerMode ? devNotice : userNotice
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
    replanning_notice: `已保留 ${match.poi.name}，预计等待 ${nextWait} 分钟，会继续按原方案提醒双方。`
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
  const meta = message.ai_generated && canShowDeveloperControls() ? "AI 模拟对方" : message.timestamp;
  return `
    <div class="${TW.message} ${cls} ${message.pending ? "is-pending" : ""}">
      <span>${escapeHTML(message.text)}</span>
      <small>${escapeHTML(meta || "")}</small>
    </div>
  `;
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
  // 对方默认同意，1.5s 后自动确认，触发 Match 动画
  setTimeout(() => simulatePeerConfirm(), 1500);
}

function simulatePeerConfirm() {
  if (appState.planStatus !== PLAN_STATUS.LOCKED_WAITING_PEER) return;
  setPlanStatus(PLAN_STATUS.CONFIRMED);
  appState.matchedUserConfirmed = true;
  appState.chatThread.matched_user_confirmed = true;
  appState.chatThread.messages.push({ sender: "matched_user", text: "我也确认，待会见！", timestamp: nowTime() });
  const gc = buildGroupChat(appState.selectedMatch);
  appState.groupChats.push(gc);
  // 双方都确认 → 触发 Match 成局动画，动画结束后跳成局详情页
  showMatchSuccessAnimation(appState.selectedMatch, { destination: "success" });
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
  overlay.className = "modal-overlay safety-modal-overlay";
  overlay.innerHTML = `
    <div class="${TW.modalSheet} safety-sheet">
      <div class="${TW.modalHeader} safety-header">
        <div>
          <p class="${TW.eyebrow}">出行安全</p>
          <h2>安全选项</h2>
        </div>
        <button class="${TW.modalClose}" id="closeSafetyPanel">关闭</button>
      </div>
      <div class="safety-list">
        <button class="safety-option" id="safetyShare">
          <i aria-hidden="true">位</i>
          <span><b>开启行程共享</b><small>将本次出行位置实时分享给紧急联系人</small></span>
        </button>
        <button class="safety-option" id="safetyContact">
          <i aria-hidden="true">联</i>
          <span><b>通知紧急联系人</b><small>发送一键提醒消息，告知今晚行程安排</small></span>
        </button>
        <button class="safety-option" id="safetyReport">
          <i aria-hidden="true">助</i>
          <span><b>举报 / 求助</b><small>遇到异常情况可一键联系美团安全团队</small></span>
        </button>
      </div>
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
  const showDevControls = canShowDeveloperControls();
  return `
    <section class="${TW.card} fallback-rematch-card" style="margin-top:8px;background:#f8fafc;">
      <p class="${TW.eyebrow}">${showDevControls && appState.developerMode ? "拒人重算" : "候补方案"}</p>
      <p style="margin:6px 0;font-size:13px;">${showDevControls && appState.developerMode
        ? `排除 <b>${escapeHTML(r.prevNickname)}</b>（${r.prevScore}%）→ 推荐 <b>${escapeHTML(r.next.user.nickname)}</b> @ ${escapeHTML(r.next.poi.name)}（${r.next.total_score}%）`
        : `对方暂时不方便，已为你找到 <b>${escapeHTML(r.next.user.nickname)}</b> 和 <b>${escapeHTML(r.next.poi.name)}</b> 的候补方案。`}</p>
      ${showDevControls && appState.developerMode ? `<div class="${TW.breakdown}" style="margin-top:8px;">
        ${Object.entries(bd).slice(0, 6).map(([key, value]) => `<div><span>${breakdownLabel(key)}</span><b>${value}</b></div>`).join("")}
      </div>` : ""}
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
      text: canShowDeveloperControls() && appState.developerMode
        ? `规则层已重算：推荐 ${next.user.nickname} @ ${next.poi.name}（${next.total_score}%）。${next.explanation}`
        : `已为你们换成 ${next.poi.name}，会继续按新的预算和时间推进确认。`,
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
