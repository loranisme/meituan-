function renderSuccessPage() {
  if (!appState.selectedMatch) return;
  const deal = appState.selectedDeal || getDeal(appState.selectedMatch.poi.poi_id);
  const dealRank = rankDealCandidates(appState.selectedMatch)[0];
  const selectedDealText = appState.selectedDeal
    ? `双方已选择：${appState.selectedDeal.title}`
    : `待选择，推荐使用：${dealRank ? dealRank.deal.title : deal.title}`;
  $("#successPage").innerHTML = `
    <section class="${TW.successCard} ${TW.card} success-page-card">
      <div class="${TW.successMark}">✓</div>
      <p class="${TW.eyebrow}">双方确认</p>
      <h1>成局成功</h1>
      <p class="success-subtitle">${escapeHTML(appState.selectedMatch.suggested_time)} 和 ${escapeHTML(appState.selectedMatch.user.nickname)} 去 ${escapeHTML(appState.selectedMatch.poi.name)}</p>
      <div class="success-plan-summary">
        <div>
          <span>时间</span>
          <b>${escapeHTML(appState.selectedMatch.suggested_time)}</b>
        </div>
        <div>
          <span>人数</span>
          <b>${escapeHTML(appState.selectedMatch.intent.group_size)}</b>
        </div>
        <div>
          <span>预算</span>
          <b>¥${appState.selectedMatch.intent.budget_min}–${appState.selectedMatch.intent.budget_max}</b>
        </div>
      </div>
      <div class="success-status-pill ${appState.depositLocked ? "is-locked" : ""}">
        ${appState.depositLocked ? "诚意金已锁定" : "诚意金已解锁"}
      </div>
      <div class="fulfillment-timeline">
        <p class="${TW.eyebrow}">履约进度</p>
        <ol class="${TW.timelineList}">
          <li class="${appState.depositLocked ? "done" : ""}">锁定诚意金 / 支付意愿</li>
          <li class="done">双方确认方案</li>
          <li>选择并购买团购券</li>
          <li>导航到店 · 核销</li>
          <li>解冻诚意金 · 信誉 +2</li>
        </ol>
      </div>
      <div class="${TW.dealBox} success-deal-box">
        <b>${selectedDealText}</b>
        <p>${deal.deal_type} · 原价 ¥${deal.original_price} · 优惠价 ¥${deal.discount_price} · 省 ¥${Math.max(0, deal.original_price - deal.discount_price)}</p>
        <p>适合 ${deal.suitable_group_size} · ${deal.valid_time}</p>
      </div>
      <button class="${TW.primaryButton} ${TW.wide} success-primary-action" id="buyDeal">${appState.selectedDeal ? "购买已选团购券" : "选择团购券"}</button>
      <button class="${TW.secondaryButton} ${TW.wide} success-chat-action" id="enterGroupChat">进入群聊</button>
      <div class="${TW.successSecondaryRow} success-secondary-row">
        <button class="${TW.secondaryButton}" id="chooseDeal">换团购券</button>
        <button class="${TW.secondaryButton}" id="viewRoute">导航出发</button>
        <button class="${TW.secondaryButton}" id="shareBuddy">分享</button>
      </div>
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
    showToast(`已选择购买：${appState.selectedDeal.title}`);
  });
  $("#viewRoute").addEventListener("click", () => {
    showPoiNavHint(appState.selectedMatch.poi);
  });
  $("#shareBuddy").addEventListener("click", () => showToast("已分享给搭子"));
}

function renderProfilePage() {
  const me = currentUser || { nickname: "小团", reputation_score: 85, completed_plans: 10 };
  const rep = me.reputation_score != null ? me.reputation_score : reputationBadge(me).score;
  const tier = rep >= 85 ? "靠谱搭子" : rep >= 70 ? "良好" : "一般";
  const city = getCurrentCity();
  const mem = appState.agentMemory || DEMO_AGENT_MEMORY;
  const completionRate = Math.round((1 - (me.no_show_rate || 0.05)) * 100);
  const tags = (me.interest_labels || []).slice(0, 4);
  const prefScenes = (mem.preferred_scenes || []).slice(0, 3).join(" · ") || "吃饭 · 咖啡";
  $("#profilePage").innerHTML = `
    <div class="profile-page profile-page-lite">
      <header class="profile-topbar profile-topbar-lite">
        <div>
          <p>我的</p>
          <h1>个人资料</h1>
        </div>
      </header>

      <section class="profile-hero-card">
        <div class="profile-identity">
          <div class="profile-avatar">${me.avatar_url ? `<img src="${me.avatar_url}" alt="" />` : escapeHTML(me.nickname[0])}</div>
          <div class="profile-main">
            <div class="profile-name-row">
              <h2>${escapeHTML(me.nickname)}</h2>
              <span>${me.verified_status ? "已验证" : "未验证"}</span>
            </div>
            <p>${escapeHTML(city.shortName || city.name)} · ${escapeHTML(me.social_style || "轻松聊天")}</p>
            <div class="profile-tags">${tags.map((t) => `<span>${escapeHTML(t)}</span>`).join("")}</div>
          </div>
        </div>
        <div class="profile-stat-grid">
          <div><b>${rep}</b><span>${tier}</span></div>
          <div><b>${me.completed_plans || 0}</b><span>成局</span></div>
          <div><b>${completionRate}%</b><span>准时率</span></div>
        </div>
      </section>

      <section class="profile-card">
        <div class="profile-section-head">
          <h2>我的偏好</h2>
        </div>
        <div class="profile-preference-grid">
          <div><span>常选场景</span><b>${escapeHTML(prefScenes)}</b></div>
          <div><span>预算</span><b>¥${mem.default_budget_range?.[0] || 60}–${mem.default_budget_range?.[1] || 90}</b></div>
          <div><span>距离</span><b>${mem.distance_preference_km || 1.5}km 内</b></div>
          <div><span>社交</span><b>${escapeHTML(mem.social_preference || "低打扰 1v1")}</b></div>
        </div>
      </section>

      <section class="profile-card">
        <div class="profile-section-head">
          <h2>安全与设置</h2>
        </div>
        <div class="profile-setting-list">
          <div><span>实名认证</span><b>${me.verified_status ? "已完成" : "未完成"}</b></div>
          <div><span>隐私范围</span><b>同城可见</b></div>
          <div><span>当前城市</span><b>${escapeHTML(city.shortName || city.name)}</b></div>
        </div>
      </section>
    </div>
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
    <div class="${TW.modalSheet} deal-rank-sheet">
      <div class="${TW.modalHeader} deal-rank-header">
        <div>
          <p class="${TW.eyebrow}">${canShowDeveloperControls() && appState.developerMode ? "团购券 AI Rank" : "团购券"}</p>
          <h2>选择本次要用的券</h2>
        </div>
        <button class="${TW.modalClose}" id="closeDealRankModal" aria-label="关闭">关闭</button>
      </div>
      <div class="${TW.replanBody}">
        <div class="${TW.replanContext} deal-rank-context">
          <b>${appState.selectedMatch.poi.name} · ${appState.selectedMatch.intent.group_size}</b>
          <p>优先展示适合当前人数和预算的券，选好后可发给对方确认。</p>
          ${canShowDeveloperControls() && appState.developerMode ? `<p class="${TW.scoreFormula} replan-score-formula">综合分 = 人数适配 25% + 节省力度 25% + 人均预算 20% + 有效时间 12% + 对方偏好 10% + 地点匹配 8%</p>` : ""}
        </div>
        <div class="${TW.replanCandidateList}">
          ${ranked.map((item, index) => `
            <article class="${TW.replanCandidate} ${TW.dealRankCard} deal-rank-card ${appState.selectedDeal && appState.selectedDeal.deal_id === item.deal.deal_id ? "is-selected" : ""}">
              <div class="${TW.candidateHead} deal-rank-card-head">
                <span class="${TW.rankBadge}">#${index + 1}</span>
                <div>
                  <b>${item.deal.title}</b>
                  <p>${item.deal.deal_type} · ${item.deal.valid_time} · ${item.deal.suitable_group_size}</p>
                </div>
                <strong><span>${canShowDeveloperControls() && appState.developerMode ? "综合" : "省"}</span>${canShowDeveloperControls() && appState.developerMode ? item.rankScore : `¥${item.saved}`}<small>${canShowDeveloperControls() && appState.developerMode ? "分" : ""}</small></strong>
              </div>
              <div class="${TW.candidateMetrics} ${canShowDeveloperControls() && appState.developerMode ? "" : "is-hidden"}">
                <span>人数 ${item.groupScore}</span>
                <span>节省 ${item.saveScore}</span>
                <span>预算 ${item.budgetScore}</span>
                <span>偏好 ${item.preferenceScore}</span>
              </div>
              <p class="${TW.candidateReason}">原价 ¥${item.deal.original_price} · 券后 ¥${item.deal.discount_price} · 人均约 ¥${item.perPerson}${canShowDeveloperControls() && appState.developerMode ? ` · ${item.reasons.join(" · ")}` : ""}</p>
              <button class="${TW.primaryButton} ${TW.wide}" data-choose-deal="${index}">${appState.selectedDeal && appState.selectedDeal.deal_id === item.deal.deal_id ? "已选这张券" : "选择这张券"}</button>
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
        appState.chatThread.messages.push({ sender: "ai", text: `已记录这张团购券：预计人均 ¥${item.perPerson}，可省 ¥${item.saved}。`, timestamp: nowTime() });
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
  sheet.className = "modal-overlay deposit-modal-overlay";
  const poi = appState.selectedMatch?.poi;
  const depositAmt = 9.9;
  sheet.innerHTML = `
    <div class="${TW.modalSheet} deposit-sheet">
      <div class="${TW.modalHeader} deposit-header">
        <div>
          <p class="${TW.eyebrow}">确认意愿</p>
          <h2>锁定诚意金</h2>
        </div>
        <button class="${TW.modalClose}" id="cancelDepositSheet" aria-label="关闭">关闭</button>
      </div>
      <div class="deposit-body">
        <div class="deposit-summary">
          <div><span>金额</span><b>¥${depositAmt.toFixed(1)}</b></div>
          <div><span>地点</span><b>${poi ? escapeHTML(poi.name) : "待定"}</b></div>
          <div><span>方式</span><b>美团钱包预授权</b></div>
        </div>
        <div class="deposit-rules">
          <b>解冻规则</b>
          <p>到店核销后全额解冻；约定前 30 分钟外取消全额退回；临近取消或爽约会按规则扣除并影响信誉。</p>
        </div>
        <label class="deposit-agreement">
          <input type="checkbox" id="depositAgreement" ${appState.depositAgreementChecked ? "checked" : ""} />
          <span>我已阅读并同意冻结 ¥${depositAmt.toFixed(1)} 诚意金，用于锁定本次成局意愿</span>
        </label>
        <div class="deposit-actions">
          <button class="${TW.secondaryButton}" id="cancelDepositSheetSecondary">再想想</button>
          <button class="${TW.primaryButton}" id="confirmDepositSheet" ${appState.depositAgreementChecked ? "" : "disabled"}>锁定并继续</button>
        </div>
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
  const closeDepositSheet = () => {
    appState.depositSheetVisible = false;
    if (appState.planStatus === PLAN_STATUS.PENDING_LOCK) setPlanStatus(PLAN_STATUS.MATCHED);
    render();
  };
  document.getElementById("cancelDepositSheet").onclick = closeDepositSheet;
  document.getElementById("cancelDepositSheetSecondary").onclick = closeDepositSheet;
  document.getElementById("confirmDepositSheet").onclick = () => {
    if (!appState.depositAgreementChecked) return;
    appState.depositLocked = true;
    appState.depositSheetVisible = false;
    showToast("诚意金意愿已锁定");
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
  toast.className = appState.toast ? `${TW.toast} ${TW.toastShow}` : TW.toast;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
