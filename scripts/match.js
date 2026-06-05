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
  appState.matchPreviewUsers = [];
  appState.matchAnimPhase = "search";
  appState.matchAnimCandidates = 0;
  appState.matchProfileIndex = null;
  appState.replanningNotice = "";
  appState.aiDirector = null;
  appState.aiMoodProfile = null;
  appState.aiAgentError = "";
  appState.aiRuleFallback = false;
  appState.aiFilteredByGemini = false;
  appState.aiFilterReason = "";
  render();
  try {
    appState.aiMoodProfile = analyzeMoodNLP(appState.userInput);
    appState.parsedIntent = applyMoodIntentPatch(parseIntent(appState.userInput), appState.aiMoodProfile, appState.userInput);
    updateMatchAnimationStatus("已理解你的需求，正在扫描附近候选...");
    await sleep(420);

    const candidateTargets = [2, 4, 6, 8];
    for (const count of candidateTargets) {
      appState.matchAnimCandidates = count;
      updateMatchAnimationStatus(`发现 ${count} 个候选结果...`);
      await sleep(380);
    }
    await sleep(520);

    rerunMatching();
    appState.matchPreviewUsers = appState.matchResults.slice(0, 3);
    appState.matchAnimPhase = "search";
    updateMatchAnimationStatus("正在计算最佳组合...");
    await sleep(2400);

    const { availablePOIs } = getMatchSupply();
    await enrichWithAIDirector(availablePOIs);
    appState.matchAnimPhase = "done";
    updateMatchAnimationStatus("即将为你展示结果...");
    await sleep(480);
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
    appState.matchAnimPhase = null;
    appState.matchAnimCandidates = 0;
    appState.matchPreviewUsers = [];
    render();
  }
}

function updateMatchAnimationStatus(text) {
  const footer = document.getElementById("matchAnimFooter");
  if (footer) footer.textContent = text;
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
  // Full POI catalog so Gemini can understand what actually exists nearby
  const allPOIs = (gaodePOIs.length ? gaodePOIs : pois).slice(0, 60);
  const poiCatalog = allPOIs.map((poi) => ({
    poi_id: poi.poi_id,
    name: poi.name,
    category: poi.category,
    sub_category: poi.sub_category,
    tags: (poi.tags || []).slice(0, 6),
    avg_price: poi.avg_price,
    rating: poi.rating,
    distance_km: poi.distance_km,
    wait_time_min: poi.wait_time_min,
    buddy_demand_count: poi.buddy_demand_count,
    deal_text: poi.deal_text,
    venue_extra: poi.venue_extra || null
  }));
  return {
    area,
    user_input: appState.userInput,
    parsed_intent: appState.parsedIntent,
    mood_profile: appState.aiMoodProfile,
    sparse_mode: appState.sparseMode,
    all_poi_catalog: poiCatalog,
    merchant_candidates: availablePOIs.slice(0, 8).map((poi) => ({
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

    // ── Core NLP→POI filter: Gemini tells us which POIs actually match ──
    if (director.poi_filter && !options.skipPoiFilter) {
      const { categories = [], search_tags = [] } = director.poi_filter;
      if (categories.length || search_tags.length) {
        const allPool = gaodePOIs.length ? gaodePOIs : filteredMockPois("全部");
        const tagsLower = search_tags.map((t) => String(t).toLowerCase());
        const filtered = allPool.filter((poi) => {
          const catMatch = !categories.length || categories.includes(poi.category);
          if (!catMatch) return false;
          if (!tagsLower.length) return true;
          // Match against sub_category and tags
          const poiText = [poi.sub_category, ...(poi.tags || [])].map((s) => String(s).toLowerCase());
          return tagsLower.some((tag) => poiText.some((t) => t.includes(tag) || tag.includes(t)));
        });
        // Only update gaodePOIs if we got reasonable results (≥ 1); else keep original pool
        if (filtered.length >= 1) {
          gaodePOIs = filtered;
          appState.aiFilteredByGemini = true;
          appState.aiFilterReason = director.poi_filter.reasoning || "";
        } else {
          // Relax to category-only match
          const catOnly = allPool.filter((poi) => !categories.length || categories.includes(poi.category));
          if (catOnly.length >= 1) {
            gaodePOIs = catOnly;
            appState.aiFilteredByGemini = true;
            appState.aiFilterReason = `附近没有完全匹配"${director.poi_filter.keyword}"的商家，已展示最相近的类型`;
          }
          // else: keep original pool, let rule layer handle it
        }
      }
    }

    if (director.intent_patch && !options.skipIntentPatch) {
      appState.parsedIntent = {
        ...appState.parsedIntent,
        ...director.intent_patch,
        parse_layer: "agent_enriched",
        parse_confidence: director.intent_patch.confidence ?? appState.parsedIntent.parse_confidence
      };
    }

    // Re-run matching with the (possibly filtered) POI pool + patched intent
    if (!options.skipIntentPatch) rerunMatching();

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

const MATCH_INSPIRE_PROMPTS = [
  { label: "喝咖啡", emoji: "☕", desc: "安静坐一下", prompt: "周末想找安静的人一起喝咖啡，预算 40 元以内，不尴尬就好。" },
  { label: "吃个饭", emoji: "🍜", desc: "找饭搭子", prompt: "今晚想找一个人一起吃饭，预算 80 元以内，轻松聊聊。" },
  { label: "桌游局", emoji: "🎲", desc: "轻松破冰", prompt: "今晚狼人阿瓦隆桌游，3-4 人，预算 70 元以内，轻松破冰。" },
  { label: "KTV", emoji: "🎤", desc: "热闹一起嗨", prompt: "今晚想找几个人去 KTV，人均 100 元以内，气氛热闹一点。" },
  { label: "夜骑", emoji: "🚴", desc: "吹风散心", prompt: "今晚想夜骑，找个节奏轻松的搭子，不要太快。" },
  { label: "攀岩", emoji: "🧗", desc: "新手也行", prompt: "压力有点大，想找个新手友好的攀岩搭子，预算 120 元以内。" }
];

function matchTagIcon(type) {
  const icons = {
    food: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3v8a4 4 0 008 0V3M14 3v8a4 4 0 008 0V3M6 11v10M14 11v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    coin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M9 12h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    people: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="7" r="3" stroke="currentColor" stroke-width="2"/><path d="M3 20v-1a5 5 0 015-5h2a5 5 0 015 5v1M16 11a3 3 0 100-6M21 20v-1a4 4 0 00-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    smile: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/></svg>',
    wallet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M16 14h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    block: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M5 5l14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12l-8 8-4-4V8h8l4 4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/></svg>'
  };
  return icons[type] || icons.smile;
}

function buildAITags() {
  // Only show tags when user has actually run the AI — never from memory defaults
  const intent = appState.parsedIntent;
  if (!intent || !appState.aiHasRun) return [];
  const tags = [];
  const category = intent.category_preference;
  if (category && category !== "餐饮") {
    tags.push({ label: category, tone: "orange", icon: "food" });
  } else if (intent.activity_type && intent.activity_type !== "饭搭子") {
    tags.push({ label: intent.activity_type.replace("搭子", ""), tone: "orange", icon: "food" });
  }
  if (intent.budget_max) tags.push({ label: `¥${intent.budget_max}以内`, tone: "yellow", icon: "coin" });
  if (intent.group_size) tags.push({ label: intent.group_size, tone: "blue", icon: "people" });
  const social = intent.social_style === "轻松聊天" ? "轻社交" : intent.social_style;
  if (social) tags.push({ label: social, tone: "sand", icon: "smile" });
  if (intent.distance_tolerance_km && intent.distance_tolerance_km < 2) {
    tags.push({ label: `${intent.distance_tolerance_km}km内`, tone: "green", icon: "pin" });
  }
  return tags.slice(0, 5);
}

function matchGreetingTime() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function userDisplayMeta(user) {
  const seed = String(user.user_id || "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const jobs = ["设计师", "产品经理", "程序员", "学生", "自由职业", "运营", "教师"];
  return {
    age: 22 + (seed % 9),
    job: jobs[seed % jobs.length]
  };
}

function userAvatarUrl(user) {
  return user.avatar_url || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(user.user_id || user.nickname || "buddy")}`;
}

function userBioSnippet(match) {
  const labels = match.user.interest_labels?.slice(0, 3).join(" · ") || match.user.social_style;
  return match.explanation || `喜欢${labels}，${match.user.social_style}，期待一起出门。`;
}

function filteredMatchResults() {
  const list = [...appState.matchResults];
  if (appState.matchResultFilter === "high") {
    return list.filter((item) => item.total_score >= 85);
  }
  if (appState.matchResultFilter === "nearby") {
    return list.filter((item) => Number(item.user.distance_km) <= 1.5);
  }
  if (appState.matchResultFilter === "newest") {
    return list.sort((a, b) => String(b.user.user_id).localeCompare(String(a.user.user_id)));
  }
  return list;
}

function renderMatchRadarDots() {
  const dots = [
    { x: 18, y: 28, delay: 0 },
    { x: 72, y: 22, delay: 0.4 },
    { x: 82, y: 58, delay: 0.8 },
    { x: 24, y: 68, delay: 1.1 },
    { x: 52, y: 14, delay: 0.2 },
    { x: 64, y: 78, delay: 1.4 },
    { x: 36, y: 46, delay: 0.6 }
  ];
  return dots.map((dot, index) => `
    <span class="match-radar-dot" style="left:${dot.x}%;top:${dot.y}%;animation-delay:${dot.delay}s" aria-hidden="true"></span>
  `).join("");
}

function renderMatchAnimationOverlay() {
  if (!appState.aiLoading || !appState.matchAnimPhase) return "";
  const phase = appState.matchAnimPhase;
  const preview = appState.matchPreviewUsers.length
    ? appState.matchPreviewUsers
    : appState.matchResults.slice(0, 3);
  const connectNodes = (preview.length ? preview : [{ user: { nickname: "?", avatar_url: "" }, total_score: 90 }, { user: { nickname: "?", avatar_url: "" }, total_score: 87 }, { user: { nickname: "?", avatar_url: "" }, total_score: 84 }]).slice(0, 3);
  const nodeSlots = [
    { cls: "node-top", scoreCls: "score-top" },
    { cls: "node-left", scoreCls: "score-left" },
    { cls: "node-right", scoreCls: "score-right" }
  ];
  return `
    <div class="match-anim-overlay" role="status" aria-live="polite">
      <div class="match-anim-panel">
        <div class="match-anim-phase match-anim-search ${phase === "search" ? "is-active" : ""}">
          <h2 class="match-anim-title">正在寻找同频的人</h2>
          <p class="match-anim-sub">已理解你的需求...</p>
          <div class="match-radar" aria-hidden="true">
            <div class="match-radar-core"></div>
            <div class="match-radar-ring ring-1"></div>
            <div class="match-radar-ring ring-2"></div>
            <div class="match-radar-ring ring-3"></div>
            ${renderMatchRadarDots()}
          </div>
          <p class="match-anim-footer" id="matchAnimFooter">发现 ${appState.matchAnimCandidates} 个候选结果...</p>
        </div>

        <div class="match-anim-phase match-anim-connect ${phase === "connect" || phase === "done" ? "is-active" : ""}">
          <h2 class="match-anim-title">正在为你建立连接</h2>
          <p class="match-anim-sub">匹配度越高，越合拍哦</p>
          <div class="match-connect-stage" aria-hidden="true">
            <svg class="match-connect-lines" viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet">
              <line class="match-connect-line line-a" x1="120" y1="100" x2="120" y2="34"/>
              <line class="match-connect-line line-b" x1="120" y1="100" x2="44" y2="156"/>
              <line class="match-connect-line line-c" x1="120" y1="100" x2="196" y2="156"/>
            </svg>
            <div class="match-connect-hub"></div>
            ${connectNodes.map((match, index) => {
              const slot = nodeSlots[index];
              return `
                <div class="match-connect-node ${slot.cls}">
                  <div class="match-connect-avatar">
                    <img src="${userAvatarUrl(match.user)}" alt="" loading="lazy"/>
                  </div>
                  <span class="match-connect-score ${slot.scoreCls}">${match.total_score}%</span>
                </div>
              `;
            }).join("")}
          </div>
          <p class="match-anim-footer">${phase === "done" ? "即将为你展示结果..." : "正在计算最佳组合..."}</p>
        </div>
      </div>
    </div>
  `;
}

function renderMatchFilterBar() {
  const filters = [
    { id: "all", label: "全部" },
    { id: "high", label: "高匹配" },
    { id: "nearby", label: "附近" },
    { id: "newest", label: "最新" }
  ];
  return `
    <div class="match-filter-bar">
      ${filters.map((filter) => `
        <button type="button" class="match-filter-chip ${appState.matchResultFilter === filter.id ? "is-active" : ""}" data-match-filter="${filter.id}">
          ${filter.label}
        </button>
      `).join("")}
    </div>
  `;
}

function renderMatchPeopleCard(match, index) {
  const meta = userDisplayMeta(match.user);
  const originalIndex = appState.matchResults.indexOf(match);
  return `
    <button type="button" class="match-people-card" data-open-profile="${originalIndex >= 0 ? originalIndex : index}">
      <img class="match-people-avatar" src="${userAvatarUrl(match.user)}" alt="" loading="lazy"/>
      <div class="match-people-body">
        <div class="match-people-head">
          <span class="match-people-name">${escapeHTML(match.user.nickname)}</span>
          <span class="match-people-score">${match.total_score}% 匹配</span>
        </div>
        <p class="match-people-meta">${meta.age}岁 · ${match.user.distance_km}km · ${escapeHTML(meta.job)}</p>
        <div class="match-people-tags">
          ${match.user.interest_labels.slice(0, 3).map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}
        </div>
        <p class="match-people-bio">${escapeHTML(userBioSnippet(match))}</p>
      </div>
    </button>
  `;
}

function renderMatchPeopleList() {
  if (!appState.matchResults.length) return "";
  const results = filteredMatchResults();
  return `
    <section class="match-people-section result-fade">
      <div class="match-people-header">
        <h2>找到 ${appState.matchResults.length} 位同频的人</h2>
        ${renderMatchFilterBar()}
      </div>
      ${results.length ? `
        <div class="match-people-list">
          ${results.map((match, index) => renderMatchPeopleCard(match, index)).join("")}
        </div>
      ` : `
        <div class="${TW.emptyState}" style="padding:20px;text-align:center;">
          <p style="color:#6b7280;font-size:13px;">当前筛选下暂无结果，试试其他标签。</p>
        </div>
      `}
    </section>
  `;
}

function renderMatchProfileSheet() {
  if (appState.matchProfileIndex == null) return "";
  const match = appState.matchResults[appState.matchProfileIndex];
  if (!match) return "";
  const meta = userDisplayMeta(match.user);
  const intentTags = [
    match.intent?.category_preference,
    match.intent?.budget_max ? `${match.intent.budget_max}元以内` : null,
    match.intent?.group_size,
    match.intent?.social_style === "轻松聊天" ? "轻社交" : match.intent?.social_style
  ].filter(Boolean);
  const places = [match.poi, match.backup_poi].filter(Boolean).slice(0, 2);
  return `
    <div class="modal-overlay match-profile-overlay" id="matchProfileOverlay">
      <div class="match-profile-sheet">
        <button type="button" class="match-profile-close" id="closeMatchProfile" aria-label="关闭">×</button>
        <div class="match-profile-hero">
          <img src="${userAvatarUrl(match.user)}" alt="" loading="lazy"/>
        </div>
        <div class="match-profile-content">
          <div class="match-profile-head">
            <h2>${escapeHTML(match.user.nickname)}</h2>
            <span class="match-profile-score">${match.total_score}% 匹配</span>
          </div>
          <p class="match-profile-meta">${meta.age}岁 · ${match.user.distance_km}km · ${escapeHTML(meta.job)}</p>
          <div class="match-profile-block">
            <h3>关于我</h3>
            <p>${escapeHTML(userBioSnippet(match))}</p>
          </div>
          <div class="match-profile-block">
            <h3>我在找</h3>
            <div class="match-profile-tags">
              ${intentTags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}
            </div>
          </div>
          ${places.length ? `
            <div class="match-profile-block">
              <h3>常去地点</h3>
              <div class="match-profile-places">
                ${places.map((poi) => `
                  <div class="match-profile-place">
                    <div class="match-profile-place-cover" style="background-image:url('${poiCoverImage(poi)}')"></div>
                    <b>${escapeHTML(poi.name)}</b>
                    <span>${escapeHTML(poi.sub_category || poi.category)} · ${poi.distance_km}km</span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>
        <div class="match-profile-footer">
          <button type="button" class="match-profile-sayhi" id="matchProfileSayHi">打个招呼</button>
          <button type="button" class="match-profile-msg" id="matchProfileInvite" aria-label="查看方案">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15a4 4 0 01-4 4H7l-4 3V7a4 4 0 014-4h10a4 4 0 014 4v8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindMatchPeopleEvents() {
  $$("#aiPage [data-match-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.matchResultFilter = button.dataset.matchFilter;
      render();
    });
  });
  $$("#aiPage [data-open-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.matchProfileIndex = Number(button.dataset.openProfile);
      render();
    });
  });
  $("#closeMatchProfile")?.addEventListener("click", () => {
    appState.matchProfileIndex = null;
    render();
  });
  $("#matchProfileOverlay")?.addEventListener("click", (event) => {
    if (event.target.id === "matchProfileOverlay") {
      appState.matchProfileIndex = null;
      render();
    }
  });
  $("#matchProfileSayHi")?.addEventListener("click", () => {
    const match = appState.matchResults[appState.matchProfileIndex];
    if (!match) return;
    appState.matchProfileIndex = null;
    selectMatch(match);
  });
  $("#matchProfileInvite")?.addEventListener("click", () => {
    const match = appState.matchResults[appState.matchProfileIndex];
    if (!match) return;
    showGroupInviteModal(match);
  });
}

function renderAITagPills() {
  const tags = buildAITags();
  if (!tags.length) return "";
  return `
    <div class="match-ai-tags result-fade">
      <div class="match-ai-tags-header">
        <span class="match-ai-spark">✦</span>
        <span class="match-ai-tags-label">Agent 理解为</span>
      </div>
      <div class="match-tag-row">
        ${tags.map((tag) => `
          <span class="match-tag match-tag--${tag.tone}">
            ${matchTagIcon(tag.icon)}
            ${escapeHTML(tag.label)}
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

function renderRecentPreferencesCard() {
  const mem = appState.agentMemory;
  if (!mem) return "";
  const notice = appState.agentMemoryNotice;
  const socialText = mem.social_preference.includes("1v1")
    ? "1v1 · 轻社交 · 放松"
    : `${mem.social_preference} · 轻社交 · 放松`;
  const rows = [
    { icon: "food", bg: "#FFF4ED", color: "#FF6B35", text: mem.preferred_scenes.slice(0, 2).join(" · ") },
    { icon: "coin", bg: "#FFF8E1", color: "#E6B000", text: `${mem.default_budget_range[0]}-${mem.default_budget_range[1]}元` },
    { icon: "pin", bg: "#ECFDF5", color: "#22A06B", text: `${mem.distance_preference_km}km 内` },
    { icon: "people", bg: "#EFF5FF", color: "#2F7EF7", text: socialText }
  ];
  return `
    <section class="match-pref-card">
      <div class="match-pref-head">
        <h3>最近偏好</h3>
        <span class="match-pref-status"><span class="match-pref-status-dot"></span>已生效</span>
      </div>
      ${rows.map((row) => `
        <div class="match-pref-row">
          <span class="match-pref-icon" style="background:${row.bg};color:${row.color}">${matchTagIcon(row.icon)}</span>
          <span>${escapeHTML(row.text)}</span>
        </div>
      `).join("")}
      <button type="button" class="match-pref-more" id="openPreferenceDrawer">查看更多偏好 ›</button>
      ${notice ? `<div class="${TW.agentMemoryNotice} result-fade" style="margin-top:10px;">${escapeHTML(notice)}</div>` : ""}
    </section>
  `;
}

function renderPreferenceDrawer() {
  let overlay = document.getElementById("preferenceDrawerOverlay");
  if (!appState.preferenceDrawerOpen) {
    overlay?.remove();
    return;
  }
  const mem = appState.agentMemory;
  if (!mem) return;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "preferenceDrawerOverlay";
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
  }
  const detailRows = [
    { icon: "food", bg: "#F5F0FF", color: "#8B5CF6", label: "常去场景", val: mem.preferred_scenes.join(" / ") },
    { icon: "wallet", bg: "#FFF8E1", color: "#E6B000", label: "默认预算", val: `¥${mem.default_budget_range[0]}-${mem.default_budget_range[1]}` },
    { icon: "pin", bg: "#ECFDF5", color: "#22A06B", label: "距离偏好", val: `${mem.distance_preference_km}km 内` },
    { icon: "people", bg: "#EFF5FF", color: "#2F7EF7", label: "社交偏好", val: mem.social_preference },
    { icon: "block", bg: "#FFF0F3", color: "#FF2442", label: "避开条件", val: mem.avoid_conditions.join("、") },
    { icon: "tag", bg: "#FFF0F5", color: "#EC4899", label: "团购偏好", val: mem.deal_preference }
  ];
  const historyItems = [
    ...(mem.learned_from.accepted_plans || []).map((name) => ({ text: name, badge: "常去", tone: "freq" })),
    ...(mem.learned_from.rejected_reasons || []).map((reason) => ({ text: reason, badge: "不喜欢", tone: "dislike" }))
  ];
  overlay.innerHTML = `
    <div class="pref-drawer-sheet" role="dialog" aria-label="偏好详情">
      <div class="pref-drawer-handle" aria-hidden="true"></div>
      <div class="pref-drawer-head">
        <div>
          <h2>你的偏好详情</h2>
          <p>基于你的历史行为和反馈</p>
        </div>
        <span class="match-pref-status"><span class="match-pref-status-dot"></span>已生效</span>
      </div>
      <div class="pref-detail-card">
        ${detailRows.map((row) => `
          <div class="pref-detail-row">
            <span class="pref-detail-icon" style="background:${row.bg};color:${row.color}">${matchTagIcon(row.icon)}</span>
            <div class="pref-detail-body">
              <p class="pref-detail-label">${escapeHTML(row.label)}</p>
              <p class="pref-detail-val">${escapeHTML(row.val)}</p>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="pref-history">
        <h3>来自历史行为</h3>
        <div class="pref-detail-card" style="padding:4px 16px;">
          ${historyItems.map((item) => `
            <div class="pref-history-row">
              <span>${escapeHTML(item.text)}</span>
              <span class="pref-history-badge pref-history-badge--${item.tone}">${escapeHTML(item.badge)}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <button type="button" class="pref-manage-btn" id="closePreferenceDrawer">
        管理我的偏好
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
  overlay.onclick = (event) => {
    if (event.target === overlay) {
      appState.preferenceDrawerOpen = false;
      render();
    }
  };
  overlay.querySelector("#closePreferenceDrawer")?.addEventListener("click", () => {
    appState.preferenceDrawerOpen = false;
    showToast("偏好管理即将上线");
    render();
  });
}

function renderAgentMemoryCard() {
  return renderRecentPreferencesCard();
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
    notice = `已记住：你喜欢这类 ${cat || "场景"}，以后会优先推荐。`;
  } else if (type === "too_far") {
    mem.distance_preference_km = Math.max(0.5, mem.distance_preference_km - 0.3);
    notice = `已更新：距离偏好缩小至 ${mem.distance_preference_km.toFixed(1)}km，下次会过滤更远的地点。`;
  } else if (type === "too_noisy") {
    if (!mem.avoid_conditions.includes("多人拼桌局")) mem.avoid_conditions.push("多人拼桌局");
    if (!mem.learned_from.rejected_reasons.includes("太嘈杂")) mem.learned_from.rejected_reasons.push("太嘈杂");
    notice = "已记住：你不喜欢嘈杂多人局，以后会优先推荐低打扰 1v1。";
  } else if (type === "too_expensive") {
    mem.default_budget_range[1] = Math.max(40, mem.default_budget_range[1] - 10);
    if (!mem.learned_from.rejected_reasons.includes("预算太高")) mem.learned_from.rejected_reasons.push("预算太高");
    notice = `已更新：默认预算上限降至 ¥${mem.default_budget_range[1]}，下次会过滤超预算方案。`;
  } else if (type === "less_like_this") {
    if (cat && !mem.learned_from.rejected_reasons.includes(cat)) mem.learned_from.rejected_reasons.push(cat);
    mem.preferred_scenes = mem.preferred_scenes.filter((s) => s !== cat);
    notice = `已记住：减少推荐「${cat || "这类"}」场景，以后会探索其他品类。`;
  }
  appState.agentMemoryNotice = notice;
  appState.agentFeedbackLog.push({ type, cat, timestamp: nowTime() });
  showToast(notice || "偏好已更新");
  render();
}

function renderAIPage() {
  const focusedResults = appState.aiHasRun && appState.matchResults.length && !appState.aiLoading && !canShowDeveloperControls();
  $("#aiPage").innerHTML = `
    <div class="match-page ${appState.aiLoading ? "is-animating" : ""} ${focusedResults ? "has-focused-results" : ""}">
      ${focusedResults ? "" : `<div class="match-greeting">
        <p class="match-greeting-time">${matchGreetingTime()} 👋</p>
        <h1 class="match-greeting-title">今天想做什么？</h1>
      </div>`}

      ${focusedResults ? "" : `<div class="match-input-wrap">
        <span class="match-input-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <textarea id="intentInput" aria-label="输入你的状态或想法" placeholder="输入你的状态或想法...">${escapeHTML(appState.userInput)}</textarea>
        <span class="match-input-ai" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1zM19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" fill="currentColor"/></svg>
        </span>
      </div>`}

      ${focusedResults ? "" : renderAITagPills()}

      ${focusedResults ? "" : `<button type="button" class="match-start-btn ${appState.aiLoading ? "is-loading" : ""}" id="runAIButton" ${appState.aiLoading ? "disabled" : ""}>
        ${appState.aiLoading ? "正在匹配" : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.5"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>开始匹配`}
      </button>
      <p class="match-btn-caption">系统将为你找到合适的主局和同频的人</p>`}

      ${focusedResults ? "" : renderRecentPreferencesCard()}

      ${focusedResults ? "" : `<section class="match-inspire">
        <p class="match-inspire-label">或者直接选一个</p>
        <div class="match-inspire-grid">
          ${MATCH_INSPIRE_PROMPTS.map((item) => `
            <button type="button" class="match-inspire-tile" data-prompt="${escapeHTML(item.prompt)}">
              <span class="match-inspire-emoji">${item.emoji}</span>
              <span class="match-inspire-name">${escapeHTML(item.label)}</span>
              <span class="match-inspire-desc">${escapeHTML(item.desc)}</span>
            </button>
          `).join("")}
        </div>
      </section>`}

      <div class="match-results-block">
        ${canShowDeveloperControls() && appState.developerMode ? renderMatchPeopleList() : ""}
        ${canShowDeveloperControls() && appState.developerMode ? renderAIDirectorCard() : ""}
        ${renderIntentCard()}
        ${renderMatchResults()}
      </div>
    </div>
    ${renderMatchAnimationOverlay()}
    ${renderMatchProfileSheet()}
  `;
  $("#intentInput")?.addEventListener("input", (event) => {
    appState.userInput = event.target.value;
    appState.parsedIntent = null;
    const tagHost = $("#aiPage .match-ai-tags");
    if (tagHost) tagHost.outerHTML = renderAITagPills();
  });
  $("#runAIButton")?.addEventListener("click", runAI);
  $("#openPreferenceDrawer")?.addEventListener("click", () => {
    appState.preferenceDrawerOpen = true;
    render();
  });
  $$("#aiPage [data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.userInput = button.dataset.prompt;
      appState.poiConstraint = null;
      // Briefly animate the tile
      button.style.transform = "scale(0.94)";
      setTimeout(() => { button.style.transform = ""; runAI(); }, 120);
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
  const developerToggle = $("#toggleDeveloperMode");
  if (developerToggle) developerToggle.addEventListener("click", () => {
    appState.developerMode = !appState.developerMode;
    render();
  });
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
  bindMatchPeopleEvents();
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
    <section class="${TW.card} ${TW.aiState} is-done agent-brief">
      <div class="${TW.analyzingDot}"></div>
      <div>
        <b>已为你找到合适组局</b>
        <p>${escapeHTML(appState.aiDirector.director_brief || layer.summary || "已生成可执行方案。")}</p>
        <div class="${TW.agentBriefGrid}">
          <span><b>${escapeHTML(profile.mood_label || "意图明确")}</b><small>状态</small></span>
          <span><b>${profile.confidence >= 0.75 ? "理解清楚" : "待确认"}</b><small>理解程度</small></span>
          <span><b>今晚推荐</b><small>首选方案</small></span>
        </div>
        ${profile.activity_strategy ? `<p style="margin-top:8px;font-size:12px;color:#4b5563;">${escapeHTML(profile.activity_strategy)}</p>` : ""}
        ${layer.freshness_label ? `<p style="margin-top:6px;font-size:12px;color:#6b7280;">${escapeHTML(layer.freshness_label)}</p>` : ""}
      </div>
    </section>
  `;
}

function renderIntentCard() {
  if (!appState.developerMode) return "";
  if (appState.aiLoading) return "";
  if (!appState.parsedIntent) {
    return `<section class="${TW.card} ${TW.aiState}"><div class="${TW.analyzingDot}"></div><div><b>等待你的描述</b><p>输入后会理解语义、情绪、预算、时间和距离。</p></div></section>`;
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
    <section class="${TW.card} ${TW.aiState} is-done ${TW.agentParseCard}">
      <div class="${TW.analyzingDot}"></div>
      <div style="width:100%;">
        <b>理解结果</b>
        <div class="${TW.intentAnalysisGrid}">
          ${moodLabel ? `<div class="${TW.intentRow}"><span class="${TW.intentRowLabel}">当前状态</span><span>${escapeHTML(moodLabel)}</span></div>` : ""}
          ${hardConditions.length ? `<div class="${TW.intentRow}"><span class="${TW.intentRowLabel}">硬条件</span><span>${hardConditions.map(escapeHTML).join("、")}</span></div>` : ""}
          ${softPrefs.length ? `<div class="${TW.intentRow}"><span class="${TW.intentRowLabel}">软偏好</span><span>${softPrefs.map(escapeHTML).join("、")}</span></div>` : ""}
          <div class="${TW.intentRow}"><span class="${TW.intentRowLabel}">系统判断</span><span>${escapeHTML(agentJudgment)}</span></div>
          ${appState.aiFilteredByGemini ? `<div class="${TW.intentRow}"><span class="${TW.intentRowLabel}">商家过滤</span><span style="color:#15803d;">${escapeHTML(appState.aiFilterReason || "已按语义重新筛选商家")}</span></div>` : ""}
        </div>
        <p style="margin-top:8px;font-size:12px;color:${confidenceLow ? "#b45309" : "#15803d"};">
          ${confidenceLow ? "还需要一点澄清" : "理解完成"}
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
    ? "再确认一下：你更想放松，还是来点轻运动？"
    : `差一个判断：${missingSlots.join("或")}大概是什么范围？`;
  const chips = Array.isArray(questions) && questions.length
    ? questions.slice(0, 3).map((q, idx) => `<button class="${TW.clarifyChip}" data-clarify="${idx}">${escapeHTML(q)}</button>`).join("")
    : ["随便逛逛", "吃顿饭就好", "预算 60 以内", "不要太远"].map((q) =>
        `<button class="${TW.clarifyChip}" data-clarify-text="${escapeHTML(q)}">${q}</button>`
      ).join("");
  return `
    <div class="${TW.agentClarifyCard} result-fade">
      <p class="${TW.agentQ}">${escapeHTML(agentQ)}</p>
      <div class="${TW.clarifyChips}">${chips}</div>
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
    ["匹配度", (m) => (m.total_score >= 85 ? "很合适" : m.total_score >= 70 ? "合适" : "可尝试")],
    ["人均", (m) => `¥${m.poi.avg_price}`],
    ["等待", (m) => `${m.poi.wait_time_min}min`],
    ["时间", (m) => m.suggested_time]
  ];
  return `
    <div class="${TW.planCompareTable} ${TW.card}">
      <p class="${TW.eyebrow}" style="margin-bottom:8px;">方案对比</p>
      <div class="${TW.pctGrid}" style="grid-template-columns: 52px ${plans.map(() => "1fr").join(" ")}">
        <div class="${TW.pctCell} ${TW.pctHeaderCell}"></div>
        ${plans.map((_, i) => `<div class="${TW.pctCell} ${TW.pctHeaderCell} plan-label-${planLabels[i]}">${planLabels[i]}</div>`).join("")}
        ${rows.map(([label, fn]) => `
          <div class="${TW.pctCell} ${TW.pctRowLabel}">${label}</div>
          ${plans.map((m) => `<div class="${TW.pctCell}">${escapeHTML(String(fn(m)))}</div>`).join("")}
        `).join("")}
      </div>
    </div>
  `;
}

function renderMatchResults() {
  if (appState.aiLoading) return "";
  if (!appState.matchResults.length && appState.aiHasRun) {
    return `
      <section class="${TW.card} ${TW.emptyState} result-fade">
        <h2>当前没有完全匹配的搭子</h2>
        <p>${appState.sparseMode ? "当前供给较低，已进入稀疏兜底。" : "已为你找到最接近的方案。"}</p>
      </section>
      ${appState.sparseMode ? `<section class="${TW.card}" style="margin-top:8px;"><b>兜底建议</b><p style="margin-top:6px;color:#6b7280;">建议放宽时间或预算后重试，或切换到“今晚/周末”以扩大候选池。</p></section>` : ""}
    `;
  }
  if (!appState.matchResults.length) return "";
  const showDevControls = canShowDeveloperControls();
  const fallbackBanner = appState.aiRuleFallback && appState.developerMode
    ? `<div class="${TW.noticeCard}" style="background:#fffbeb;color:#92400e;">当前为 <b>规则层兜底</b>（L0），评分仍为本地真相源。</div>`
    : "";
  return `
    <section class="result-section result-fade">
      <div class="${TW.sectionTitle} result-section-head">
        <h2>推荐成局方案</h2>
        <div class="result-actions">
          <button class="${TW.textButton}" id="reshuffleResult">换一局</button>
          <button class="${TW.textButton}" id="changeTimeOnly">换一个时间</button>
          ${showDevControls && appState.developerMode ? `<button class="${TW.textButton} dev-only" id="simulateWaitFromResult">模拟排队变长</button>` : ""}
          ${showDevControls ? `<button type="button" class="developer-toggle ${appState.developerMode ? "is-active" : ""}" id="toggleDeveloperMode" aria-pressed="${appState.developerMode ? "true" : "false"}">开发者模式</button>` : ""}
        </div>
      </div>
      ${fallbackBanner}
      ${appState.replanningNotice ? `<div class="${TW.noticeCard}">${appState.replanningNotice}</div>` : ""}
      ${showDevControls && appState.developerMode ? renderAgentClarifyCard() : ""}
      ${showDevControls && appState.developerMode ? renderPlanCompareTable() : ""}
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
  const planTitle = director.headline || "成局方案";
  const planCopy = director.explanation
    ? `${director.explanation}${director.closing_line ? ` ${director.closing_line}` : ""}`
    : `推荐你和 ${match.user.nickname} ${match.suggested_time} 去 ${match.poi.name}。${match.explanation} 备选地点：${match.backup_poi ? match.backup_poi.name : "附近同类商家"}。`;
  const pricing = computeDealPricing(match);
  const priceTag = pricing.fits
    ? `<span style="color:#15803d;font-size:11px;font-weight:700;">✓ 符合预算</span>`
    : `<span style="color:#b45309;font-size:11px;font-weight:700;">超预算 ¥${pricing.overBudget}</span>`;
  return `
    <article class="${TW.matchCard} ${TW.card} match-plan-card">
      <div class="${TW.matchTop}">
        <div>
          <p class="plan-priority-label">${index === 0 ? "今晚推荐" : "备选"}</p>
          <h3>${match.user.nickname}${match.user.verified_status ? ' <span class="${TW.verifiedBadge}">已验证</span>' : ""}</h3>
          <p>${match.user.social_style} · ¥${match.user.budget_min}–${match.user.budget_max} · ${match.user.distance_km}km · <span class="${TW.repBadge}">信誉 ${rep.score}（${rep.tier}）</span></p>
          <div class="${TW.tagRow}">${match.user.interest_labels.slice(0, 4).map((tag) => `<span>${tag}</span>`).join("")}</div>
        </div>
      </div>
      <div class="${TW.breakdown} dev-only" hidden aria-hidden="true">
        ${Object.entries(match.score_breakdown).slice(0, 6).map(([key, value]) => `<div><span>${breakdownLabel(key)}</span><b>${value}</b></div>`).join("")}
      </div>
      <div class="${TW.placeMini} plan-place-mini">
        <div class="plan-place-head">
          <b>${escapeHTML(match.poi.name)}</b>
          <span>${match.poi.distance_km}km</span>
        </div>
        <p>${escapeHTML(match.poi.sub_category)} · 等待 ${match.poi.wait_time_min}min · ${match.poi.rating}分</p>
        <div class="plan-price-row">
          <span>券后约 ¥${pricing.perPerson}/人</span>
          ${priceTag}
          ${pricing.saved > 0 ? `<em>省 ¥${pricing.saved}</em>` : ""}
        </div>
      </div>
      ${appState.developerMode ? `<details class="${TW.whyDetails} dev-details" ${index === 0 ? "open" : ""}>
        <summary>为什么是这家店 / 这个人 / 这个时间</summary>
        <ul>
          <li><b>地点</b>：${escapeHTML(match.poi.name)}，${escapeHTML(match.poi.sub_category)}，门店均价 ¥${match.poi.avg_price}，券后约 ¥${pricing.perPerson}/人，等待 ${match.poi.wait_time_min} 分钟${match.poi.hot_score > 80 ? "，当前热度高" : ""}</li>
          <li><b>搭子</b>：${escapeHTML(match.user.nickname)}，${escapeHTML(match.user.social_style)}，预算 ¥${match.user.budget_min}–${match.user.budget_max}，距你 ${match.user.distance_km}km</li>
          <li><b>时间</b>：${escapeHTML(match.suggested_time)}，${userLikesCat ? "对方偏爱" : "双方都对"} ${escapeHTML(match.intent.category_preference)}，社交风格契合度高</li>
          <li><b>判断</b>：${escapeHTML(match.explanation || "综合预算、距离、品类偏好三维匹配")}</li>
          ${director.score_reason ? `<li><b>评分依据</b>：${escapeHTML(director.score_reason)}</li>` : ""}
        </ul>
        ${personalizedReasonLines(match).length ? `
          <div style="margin-top:8px;padding:8px 10px;background:#F5F5F5;border-radius:10px;border:1px solid #EBEBEB;">
            <p style="font-size:11px;font-weight:700;color:#757575;margin-bottom:4px;">基于你的偏好</p>
            <ul style="margin:0;padding-left:14px;">
              ${personalizedReasonLines(match).map((line) => `<li style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHTML(line)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </details>` : ""}
      <div class="${TW.planCopy} plan-copy-card">
        <b>${escapeHTML(planTitle)}</b>
        <p>${escapeHTML(planCopy)}</p>
        ${canShowDeveloperControls() && appState.developerMode && director.risk ? `<p style="margin-top:6px;color:#6b7280;">风险预判：${escapeHTML(director.risk)}</p>` : ""}
        ${director.conversion_prompt ? `<p class="plan-conversion-prompt">${escapeHTML(director.conversion_prompt)}</p>` : ""}
      </div>
      ${canShowDeveloperControls() && appState.developerMode ? `<div class="${TW.adjustRow} dev-only">
        <button class="${TW.textButton}" data-adjust="${index}" data-patch="cheaper">更便宜</button>
        <button class="${TW.textButton}" data-adjust="${index}" data-patch="closer">更近</button>
        <button class="${TW.textButton}" data-adjust="${index}" data-patch="quieter">更安静</button>
        <button class="${TW.textButton}" data-adjust="${index}" data-patch="change_time">换时间</button>
        <button class="${TW.textButton}" data-adjust="${index}" data-patch="verified_only">只看已验证</button>
      </div>
      <div class="${TW.feedbackRow} dev-only">
        <span style="font-size:11px;color:#9ca3af;align-self:center;">告诉我：</span>
        <button class="${TW.feedbackChip} like" data-agent-feedback="like" data-feedback-plan="${index}">喜欢这个</button>
        <button class="${TW.feedbackChip}" data-agent-feedback="too_far" data-feedback-plan="${index}">太远了</button>
        <button class="${TW.feedbackChip}" data-agent-feedback="too_noisy" data-feedback-plan="${index}">太嘈杂</button>
        <button class="${TW.feedbackChip}" data-agent-feedback="too_expensive" data-feedback-plan="${index}">预算太高</button>
        <button class="${TW.feedbackChip}" data-agent-feedback="less_like_this" data-feedback-plan="${index}">少推这类</button>
      </div>` : ""}
      ${renderDevReasoning(match, index)}
      <button class="${TW.primaryButton} ${TW.wide}" data-invite-match="${index}" data-select-match="${index}" style="margin-top:4px;">发出邀约</button>
    </article>
  `;
}

function renderDevReasoning(match, index) {
  const director = match.ai_director || {};
  const bd = match.score_breakdown || {};
  const intent = match.intent || appState.parsedIntent || {};
  const filter = appState.aiDirector?.poi_filter;
  const pricing = computeDealPricing(match);

  const bdRows = [
    ["时间契合", bd.time], ["距离", bd.distance], ["预算", bd.budget],
    ["品类", bd.category], ["社交风格", bd.social_style], ["兴趣", bd.interest],
    ["地点综合", bd.place], ["信誉", bd.reputation]
  ].filter(([, v]) => v != null);

  const intentLayer = intent.parse_layer === "agent_enriched" ? "Gemini 增强" :
    intent.parse_layer === "low_confidence" ? "低置信度" : "规则层";

  return `
    <details class="dev-reasoning-details">
      <summary class="dev-reasoning-summary">
        <span class="dev-reasoning-icon">⚙</span>
        <span>Agent 推理过程</span>
        <span class="dev-reasoning-chevron">›</span>
      </summary>
      <div class="dev-reasoning-body">

        ${filter?.reasoning || filter?.categories?.length ? `
          <div class="dev-section">
            <p class="dev-section-label">🔍 商家过滤</p>
            ${filter.reasoning ? `<p class="dev-section-text">${escapeHTML(filter.reasoning)}</p>` : ""}
            <div class="dev-chip-row">
              ${(filter.categories || []).map((c) => `<span class="dev-chip dev-chip-cat">${escapeHTML(c)}</span>`).join("")}
              ${(filter.search_tags || []).map((t) => `<span class="dev-chip dev-chip-tag">#${escapeHTML(t)}</span>`).join("")}
            </div>
          </div>
        ` : ""}

        <div class="dev-section">
          <p class="dev-section-label">📊 评分明细（总分 ${match.total_score}）</p>
          <div class="dev-bd-grid">
            ${bdRows.map(([label, val]) => `
              <div class="dev-bd-row">
                <span>${escapeHTML(label)}</span>
                <div class="dev-bd-bar-wrap">
                  <div class="dev-bd-bar" style="width:${Math.min(100, val)}%"></div>
                </div>
                <b>${val}</b>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="dev-section">
          <p class="dev-section-label">🎯 意图解析 <span class="dev-layer-tag">${intentLayer}</span></p>
          <div class="dev-intent-grid">
            <span><b>活动</b> ${escapeHTML(intent.activity_type || "-")}</span>
            <span><b>品类</b> ${escapeHTML(intent.category_preference || "-")}</span>
            <span><b>预算</b> ¥${intent.budget_min}–${intent.budget_max}</span>
            <span><b>社交</b> ${escapeHTML(intent.social_style || "-")}</span>
            <span><b>时间</b> ${escapeHTML(intent.target_time || "-")}</span>
            <span><b>距离</b> ${intent.distance_tolerance_km}km</span>
            <span><b>置信度</b> ${Math.round((intent.parse_confidence || 0.8) * 100)}%</span>
            <span><b>券后</b> ¥${pricing.perPerson}/人</span>
          </div>
        </div>

        ${director.explanation || director.score_reason ? `
          <div class="dev-section">
            <p class="dev-section-label">💡 Gemini 说明</p>
            ${director.explanation ? `<p class="dev-section-text">${escapeHTML(director.explanation)}</p>` : ""}
            ${director.score_reason ? `<p class="dev-section-text dev-section-sub">${escapeHTML(director.score_reason)}</p>` : ""}
          </div>
        ` : ""}

        ${director.risk ? `
          <div class="dev-section">
            <p class="dev-section-label">⚠️ 风险预判</p>
            <p class="dev-section-text">${escapeHTML(director.risk)}</p>
          </div>
        ` : ""}

        <div class="dev-section dev-section-meta">
          <span>方案 ${index + 1} / match_id: ${escapeHTML(String(match.match_id || "-").slice(0, 20))}</span>
          <span>user_score ${match.user_score} · place_score ${match.place_score}</span>
        </div>
      </div>
    </details>
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
    overlay.className = "modal-overlay invite-modal-overlay";
    overlay.innerHTML = `
      <div class="${TW.modalSheet} invite-sheet">
        <div class="${TW.modalHeader} invite-header">
          <div>
            <p class="${TW.eyebrow}">一键约局邀请</p>
            <h2>确认发给 ${escapeHTML(match.user.nickname)}</h2>
          </div>
          <button class="${TW.modalClose}" id="closeInviteModal">关闭</button>
        </div>
        <div class="invite-body">
          <div class="invite-plan-card">
            <div class="invite-place-cover" style="background-image:url('${poiCoverImage(match.poi)}')"></div>
            <div class="invite-place-body">
              <span>${escapeHTML(match.intent.activity_type)}</span>
              <b>${escapeHTML(match.poi.name)}</b>
              <p>${escapeHTML(currentTime)} · ${escapeHTML(match.intent.group_size)} · ${escapeHTML(match.intent.social_style)}</p>
            </div>
          </div>
          <div class="invite-detail-list">
            <div><span>团购</span><b>${escapeHTML(deal ? deal.title : match.poi.deal_text)}</b></div>
            <div><span>预算</span><b>¥${match.intent.budget_min}–${match.intent.budget_max}</b></div>
            <div><span>到店</span><b>${match.poi.distance_km}km · 等待 ${match.poi.wait_time_min}min</b></div>
          </div>
          <p class="invite-note">对方接受后直接进入约局确认页，双方都确认后再进入活动页。</p>
          <div class="${TW.modalActions} invite-actions">
            <button type="button" class="${TW.secondaryButton}" id="inviteChangeTime">换一个时间</button>
            <button type="button" class="${TW.primaryButton}" id="inviteSend">发出邀约</button>
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

function showMatchSuccessAnimation(match, options = {}) {
  const destination = options.destination || "chat";

  if (destination === "chat") {
    // Called from invite modal: need to set up chat state from scratch
    appState.selectedMatch = { ...match };
    appState.depositSheetVisible = false;
    appState.depositAgreementChecked = false;
    appState.depositLocked = false;
    appState.selectedDeal = null;
    appState.fallbackSuggestion = "";
    appState.debugMeta = match.concurrency || appState.debugMeta;
    setPlanStatus(PLAN_STATUS.MATCHED);
    appState.pendingSuccess = false;
    appState.replanningNotice = "";
    appState.chatThread = buildChatThread(appState.selectedMatch);
    appState.viewingGroupChatId = "__active__";
  }
  // destination === "success": state already set by confirmMatch/simulatePeerConfirm

  const me = window.mockData?.currentUser || {};
  const myInitial = (me.nickname || "我")[0];
  const theirInitial = match.user.nickname[0];
  const activity = match.intent?.activity_type || "饭搭子";
  const actEmoji = { KTV搭子: "🎤", 咖啡搭子: "☕", 酒吧搭子: "🍸", 夜宵搭子: "🌙", 攀岩搭子: "🧗", 骑行搭子: "🚴", 桌游搭子: "🎲" }[activity] || "🍜";

  // Generate confetti particles
  const CONFETTI_COLORS = ["#FFC400", "#FF6B35", "#22A06B", "#FF2442", "#8B5CF6", "#2F7EF7", "#fff"];
  const confetti = Array.from({ length: 24 }, (_, i) => {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const isCircle = i % 3 === 1;
    const size = 6 + (i % 4) * 2;
    return `<div class="mso-particle" style="
      left:${(i * 4.2 + 1) % 100}%;
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:${isCircle ? "50%" : "3px"};
      animation-delay:${(i * 0.13).toFixed(2)}s;
      animation-duration:${(2.2 + (i % 5) * 0.3).toFixed(1)}s;
    "></div>`;
  }).join("");

  const overlay = document.createElement("div");
  overlay.id = "matchSuccessOverlay";
  overlay.className = "mso-overlay";
  overlay.innerHTML = `
    <div class="mso-bg">
      <div class="mso-confetti" aria-hidden="true">${confetti}</div>

      <div class="mso-avatars">
        <div class="mso-avatar mso-avatar-left">
          <div class="mso-ring mso-ring-me">${escapeHTML(myInitial)}</div>
          <span class="mso-avatar-name">我</span>
        </div>
        <div class="mso-spark-wrap">
          <div class="mso-spark">${actEmoji}</div>
          <div class="mso-spark-glow"></div>
        </div>
        <div class="mso-avatar mso-avatar-right">
          <div class="mso-ring mso-ring-them">${escapeHTML(theirInitial)}</div>
          <span class="mso-avatar-name">${escapeHTML(match.user.nickname)}</span>
        </div>
      </div>

      <div class="mso-text-block">
        <h1 class="mso-title">成局了！</h1>
        <p class="mso-subtitle">${destination === "success" ? `双方已确认，约定成功！` : `${escapeHTML(match.user.nickname)} 接受了你的邀约`}</p>
      </div>

      <div class="mso-poi-card">
        <span class="mso-poi-icon">📍</span>
        <div>
          <b>${escapeHTML(match.poi.name)}</b>
          <p>${escapeHTML(match.suggested_time)} · ¥${match.poi.avg_price}/人</p>
        </div>
      </div>

      <button type="button" class="mso-cta" id="matchSuccessCTA">${destination === "success" ? "查看成局详情 →" : "开始聊天 →"}</button>
      <div class="mso-progress" id="matchSuccessProgress"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  function goNext() {
    if (overlay._gone) return;
    overlay._gone = true;
    overlay.classList.add("mso-exit");
    setTimeout(() => {
      overlay.remove();
      if (destination === "success") {
        appState.pendingSuccess = false;
        appState.currentPage = "success";
        render();
      } else {
        setPage("chat");
      }
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }, 380);
  }

  document.getElementById("matchSuccessCTA").addEventListener("click", goNext);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) goNext(); });

  const AUTO_MS = 3600;
  const timer = setTimeout(goNext, AUTO_MS);
  // Cancel auto-advance if user taps CTA first
  overlay.addEventListener("click", () => clearTimeout(timer), { once: true });
}
