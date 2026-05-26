(function () {
  function parseIntent(input) {
    const text = String(input || "").trim();
    let activity_type = "饭搭子";
    let category_preference = "餐饮";
    let category_explicit = false;
    const parseSignals = [];

    if (/KTV|ktv|唱歌|K歌|欢唱/.test(text)) {
      activity_type = "KTV搭子";
      category_preference = "KTV";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/酒吧|小酌|喝酒|微醺|鸡尾酒/.test(text)) {
      activity_type = "酒吧搭子";
      category_preference = "酒吧";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/咖啡|学习|安静|拿铁|手冲/.test(text)) {
      activity_type = "咖啡搭子";
      category_preference = "咖啡";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/夜宵|烧烤|深夜|烤串|炸鸡/.test(text)) {
      activity_type = "夜宵搭子";
      category_preference = /烧烤|烤串/.test(text) ? "烧烤" : "夜宵";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/跑团|TRPG|克苏鲁|剧本杀|模组|地下城|DND|D&D/.test(text)) {
      activity_type = "跑团搭子";
      category_preference = "跑团";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/RPG|美式桌游|角色扮演|龙与地下城/.test(text)) {
      activity_type = "RPG桌游搭子";
      category_preference = "RPG";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/狼人|阿瓦隆|聚会桌游|UNO|卡牌局/.test(text)) {
      activity_type = "聚会桌游搭子";
      category_preference = "聚会桌游";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/桌游|board\s*game/i.test(text)) {
      activity_type = "桌游搭子";
      category_preference = "聚会桌游";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/攀岩|抱石|岩馆|攀登|顶绳/.test(text)) {
      activity_type = "攀岩搭子";
      category_preference = /抱石/.test(text) ? "抱石" : /新手|体验|入门/.test(text) ? "新手体验" : "运动攀岩";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/骑行|骑车|夜骑|自行车|单车|公路车/.test(text)) {
      activity_type = "骑行搭子";
      category_preference = /夜骑/.test(text) ? "夜骑路线" : /郊野|长途|越野/.test(text) ? "郊野骑行" : "休闲骑行";
      category_explicit = true;
      parseSignals.push("activity");
    } else if (/火锅/.test(text)) {
      category_preference = "火锅";
      category_explicit = true;
      parseSignals.push("category");
    } else if (/韩餐|韩国|部队锅|豆腐汤|拌饭/.test(text)) {
      category_preference = "韩餐";
      category_explicit = true;
      parseSignals.push("category");
    } else if (/日料|寿司|拉面/.test(text)) {
      category_preference = "日料";
      category_explicit = true;
      parseSignals.push("category");
    }

    let social_style = "轻松聊天";
    if (/多人|热闹|组局|认识新朋友/.test(text)) social_style = "多人热闹";
    if (/安静|不想说话|陪伴/.test(text)) social_style = "安静陪伴";
    if (/不尴尬|尴尬|轻松|随便聊|低压力/.test(text)) social_style = "轻松聊天";
    if (/多人|热闹|组局|认识新朋友|安静|不想说话|陪伴|轻松|低压力/.test(text)) parseSignals.push("style");

    let group_size = "1v1";
    if (/多人|几个人|三四|小组|组局|拼/.test(text)) group_size = activity_type === "KTV搭子" ? "多人局" : "小组";
    if (/1v1|一对一|一个人|找一个人|两个人/.test(text)) group_size = "1v1";
    if (/多人|几个人|三四|小组|组局|拼|1v1|一对一|一个人|找一个人|两个人/.test(text)) parseSignals.push("group");

    let target_time = "今晚";
    if (/现在|马上|立刻/.test(text)) target_time = "现在";
    if (/周末|周六|周日/.test(text)) target_time = "周末";
    if (/现在|马上|立刻|周末|周六|周日|今晚/.test(text)) parseSignals.push("time");

    const budget = parseBudget(text, activity_type);
    const distance_tolerance_km = parseDistance(text);
    if (/预算|人均|以内|不超过|别超过|控制在|[$￥¥]|\d+\s*(元|块|刀|美元|美金)/.test(text)) parseSignals.push("budget");
    if (/km|公里|步行|分钟|附近|不要太远|近一点/.test(text)) parseSignals.push("distance");
    const interest_labels = [...new Set([category_preference, social_style, activity_type, target_time])];
    const signalCount = parseSignals.length;
    const parse_confidence = clamp(0.45 + signalCount * 0.08 + Math.min(text.length, 40) / 200, 0.35, 0.96);
    const parse_layer = parse_confidence >= 0.7 ? "rule_parsed" : "low_confidence";
    return {
      activity_type,
      category_preference,
      category_explicit,
      budget_min: Math.max(5, budget - 10),
      budget_max: budget,
      social_style,
      group_size,
      target_time,
      distance_tolerance_km,
      interest_labels,
      parse_confidence,
      parse_layer
    };
  }

  function parseBudget(text, activity_type) {
    const match = text.match(/(?:预算|人均|以内|不超过|别超过|控制在|[$￥¥])\D{0,6}(\d{1,4})|(\d{1,4})\s*(刀|美元|美金|usd|USD|元|块|rmb|RMB)/);
    if (!match) {
      if (activity_type === "KTV搭子" || activity_type === "酒吧搭子") return 35;
      if (activity_type === "攀岩搭子") return 100;
      if (activity_type === "骑行搭子") return 50;
      if (/桌游|跑团|RPG/.test(activity_type)) return 40;
      return 25;
    }
    const raw = Number(match[1] || match[2]);
    return raw;
  }

  function parseDistance(text) {
    const km = text.match(/(\d+(?:\.\d+)?)\s*(?:km|公里)/i);
    if (km) return Number(km[1]);
    const walk = text.match(/步行\s*(\d{1,2})\s*分钟|(\d{1,2})\s*分钟内/);
    if (walk) return Number(((Number(walk[1] || walk[2]) / 12) * 0.9).toFixed(1));
    if (/不要太远|附近|近一点/.test(text)) return 1.5;
    return 3;
  }

  function calculateUserMatchScore(intent, user) {
    const time = timeScore(intent, user);
    const distance = clamp(100 - (user.distance_km / Math.max(intent.distance_tolerance_km, 0.6)) * 35, 20, 100);
    const budget = overlapScore([intent.budget_min, intent.budget_max], [user.budget_min, user.budget_max]);
    const category = user.preferred_categories.includes(intent.category_preference) ? 100 : user.interest_labels.includes(intent.category_preference) ? 82 : 42;
    const social = compatibleStyle(intent.social_style, user.social_style) ? (intent.social_style === user.social_style ? 100 : 82) : 40;
    const interest = clamp(user.interest_labels.filter((label) => [intent.category_preference, intent.social_style, intent.activity_type.replace("搭子", "")].includes(label)).length * 28 + 35, 35, 100);
    const total = Math.round(time * 0.25 + distance * 0.2 + budget * 0.15 + category * 0.15 + social * 0.15 + interest * 0.1);
    return { total, breakdown: { time: Math.round(time), distance: Math.round(distance), budget: Math.round(budget), category: Math.round(category), social_style: Math.round(social), interest: Math.round(interest) } };
  }

  function calculatePlaceScore(intent, poi) {
    const distance = clamp(100 - (poi.distance_km / Math.max(intent.distance_tolerance_km, 0.6)) * 30, 25, 100);
    const price = poi.avg_price <= intent.budget_max ? 100 : clamp(100 - (poi.avg_price - intent.budget_max) * 5, 20, 82);
    const exactMatch = poi.sub_category === intent.category_preference || poi.tags.includes(intent.category_preference);
    const broadMatch = poi.category === intent.category_preference;
    const activityMatch = activityMatchesPoi(intent.activity_type, poi);
    // When user explicitly stated a category, a mismatch is a near-hard constraint violation
    const categoryMismatch = !exactMatch && !broadMatch && !activityMatch;
    const category = exactMatch ? 100 : broadMatch ? 88 : activityMatch ? (intent.category_explicit ? 62 : 78) : (intent.category_explicit ? 15 : 35);
    const wait = clamp(100 - poi.wait_time_min * 3, 25, 100);
    const rating = clamp((poi.rating / 5) * 100, 60, 100);
    const heat = clamp(poi.hot_score, 30, 100);
    const total = Math.round(distance * 0.25 + price * 0.2 + category * 0.2 + wait * 0.15 + rating * 0.1 + heat * 0.1);
    return { total, breakdown: { distance: Math.round(distance), price: Math.round(price), category: Math.round(category), wait: Math.round(wait), rating: Math.round(rating), heat: Math.round(heat) }, categoryMismatch };
  }

  function computeReputationScore(user) {
    const completed = user.completed_plans != null ? user.completed_plans : 5;
    const noShowRate = user.no_show_rate != null ? user.no_show_rate : 0.08;
    const rating = user.peer_rating != null ? user.peer_rating : 4.6;
    const completion = clamp(completed / 20 * 100, 40, 100);
    const punctual = clamp(100 - noShowRate * 200, 30, 100);
    const reviews = clamp((rating / 5) * 100, 60, 100);
    return Math.round(completion * 0.4 + punctual * 0.35 + reviews * 0.25);
  }

  function runMatching(intent, users, pois, options) {
    const opts = options || {};
    const exclude = new Set(opts.excludeUserIds || []);
    const userCandidates = users
      .filter((user) => !exclude.has(user.user_id))
      .map((user) => ({ user, score: calculateUserMatchScore(intent, user) }))
      .filter(({ score }) => score.total >= 50)
      .sort((a, b) => b.score.total - a.score.total);
    // When category is explicit, first try strict match; widen to activity match only if < 3 results
    const strictFilter = (poi) => poi.sub_category === intent.category_preference || poi.category === intent.category_preference || poi.tags.includes(intent.category_preference);
    const broadFilter = (poi) => activityMatchesPoi(intent.activity_type, poi);
    const poisFiltered = intent.category_explicit
      ? (pois.filter(strictFilter).length >= 3 ? pois.filter(strictFilter) : pois.filter((p) => strictFilter(p) || broadFilter(p)))
      : pois.filter((poi) => broadFilter(poi) || strictFilter(poi));
    const placeCandidates = poisFiltered
      .map((poi) => ({ poi, score: calculatePlaceScore(intent, poi) }))
      .sort((a, b) => b.score.total - a.score.total);
    if (!userCandidates.length || !placeCandidates.length) return [];

    return userCandidates.slice(0, 8).map((userItem, index) => {
      const savedPlaces = userItem.user.mock_meituan_behavior?.saved_places || [];
      const savedPoi = placeCandidates.find(({ poi }) => savedPlaces.includes(poi.name));
      const preferredPoi = savedPoi || placeCandidates.find(({ poi }) => userItem.user.preferred_categories.includes(poi.sub_category) || userItem.user.interest_labels.includes(poi.sub_category)) || placeCandidates[index % placeCandidates.length] || placeCandidates[0];
      const user_score = userItem.score.total;
      const place_score = preferredPoi.score.total;
      const time_feasibility_score = timeFeasibilityScore(intent, userItem.user, preferredPoi.poi);
      const reputation_score = userItem.user.reputation_score != null ? userItem.user.reputation_score : computeReputationScore(userItem.user);
      const total_score = Math.round(user_score * 0.42 + place_score * 0.38 + time_feasibility_score * 0.15 + reputation_score * 0.05);
      const score_breakdown = { ...userItem.score.breakdown, place: place_score, time_feasibility: time_feasibility_score, reputation: reputation_score };
      return {
        match_id: `dynamic_${Date.now()}_${index}`,
        user: userItem.user,
        poi: preferredPoi.poi,
        user_score,
        place_score,
        total_score,
        score_breakdown,
        suggested_time: timeLabel(intent.target_time),
        backup_poi: findBackupPoi(intent, preferredPoi.poi, pois),
        explanation: generateExplanation(intent, userItem.user, preferredPoi.poi, score_breakdown, total_score)
      };
    }).sort((a, b) => b.total_score - a.total_score).slice(0, 3);
  }

  function generateExplanation(intent, user, poi, score_breakdown, totalScore) {
    const score = totalScore || score_breakdown.total || 89;
    const poiCategory = poi.sub_category || poi.category || "该场地";
    const userLikesPoi = user.preferred_categories.includes(poi.sub_category) || user.interest_labels.includes(poi.sub_category);
    const categoryNote = intent.category_explicit
      ? (poi.sub_category === intent.category_preference || poi.category === intent.category_preference
          ? `地点符合你的 ${intent.category_preference} 偏好`
          : `推荐 ${poiCategory} 类场地，与你的偏好接近`)
      : `推荐 ${poiCategory} 场地`;
    const userNote = userLikesPoi ? `，${user.nickname} 也偏好这类场所` : `，${user.nickname} 评分较高`;
    const styleNote = intent.social_style === user.social_style ? `，社交风格一致（${intent.social_style}）` : "";
    return `你和 ${user.nickname} 匹配度为 ${score}%。${categoryNote}${userNote}${styleNote}，因此推荐一起去 ${poi.name}。`;
  }

  function replanMatch(selectedMatch, eventType, pois) {
    const intent = selectedMatch.intent || parseIntent("");
    const currentPoi = selectedMatch.poi;
    const backup = selectedMatch.backup_poi || findBackupPoi(intent, currentPoi, pois);
    const candidates = pois
      .filter((poi) => poi.poi_id !== currentPoi.poi_id)
      .filter((poi) => activityMatchesPoi(intent.activity_type, poi) || poi.sub_category === currentPoi.sub_category)
      .filter((poi) => Math.abs(poi.avg_price - currentPoi.avg_price) <= 12)
      .sort((a, b) => a.wait_time_min - b.wait_time_min || b.rating - a.rating);
    const newPoi = backup && backup.wait_time_min < currentPoi.wait_time_min ? backup : candidates[0] || backup || currentPoi;
    const oldWait = eventType === "waiting_time_change" ? Math.max(currentPoi.wait_time_min, 35) : currentPoi.wait_time_min;
    const actionText = eventType === "change_place" ? "你选择了换一家。AI 已重新筛选同类型、价格接近且等待更短的地点。" : `检测到原餐厅等待时间从 ${currentPoi.wait_time_min} 分钟上升到 ${oldWait} 分钟。为了满足低等待和轻松成局需求，`;
    return {
      ...selectedMatch,
      poi: newPoi,
      backup_poi: findBackupPoi(intent, newPoi, pois),
      suggested_time: intent.target_time === "周末" ? "周末 15:45" : intent.target_time === "现在" ? "现在 + 10 分钟" : "今晚 18:40",
      replanning_notice: `${actionText}AI 推荐切换到 ${newPoi.name}，人均 ¥${newPoi.avg_price}，等待约 ${newPoi.wait_time_min} 分钟。`
    };
  }

  function findBackupPoi(intent, currentPoi, pois) {
    return pois
      .filter((poi) => poi.poi_id !== currentPoi.poi_id)
      .filter((poi) => activityMatchesPoi(intent.activity_type, poi) || poi.sub_category === currentPoi.sub_category || poi.sub_category === intent.category_preference)
      .sort((a, b) => Math.abs(a.avg_price - currentPoi.avg_price) - Math.abs(b.avg_price - currentPoi.avg_price) || a.wait_time_min - b.wait_time_min)[0];
  }

  function boardGameMatchesActivity(activity, poi) {
    if (poi.category !== "桌游") return false;
    const tags = poi.tags || [];
    if (activity === "桌游搭子") return true;
    if (activity === "跑团搭子") return poi.sub_category === "跑团" || tags.includes("跑团") || tags.includes("TRPG");
    if (activity === "RPG桌游搭子") return poi.sub_category === "RPG" || tags.includes("RPG");
    if (activity === "聚会桌游搭子") return poi.sub_category === "聚会桌游" || tags.includes("狼人杀") || tags.includes("桌游");
    return false;
  }

  function activityMatchesPoi(activity, poi) {
    if (activity === "KTV搭子") return poi.category === "KTV";
    if (activity === "酒吧搭子") return poi.category === "酒吧";
    if (activity === "咖啡搭子") return poi.category === "咖啡";
    if (activity === "夜宵搭子") return poi.category === "夜宵";
    if (activity === "攀岩搭子") return poi.category === "攀岩";
    if (activity === "骑行搭子") return poi.category === "骑行";
    if (/桌游|跑团|RPG/.test(activity)) return boardGameMatchesActivity(activity, poi);
    return poi.category === "餐厅";
  }

  function timeLabel(targetTime) {
    if (targetTime === "现在") return "现在 + 15 分钟";
    if (targetTime === "周末") return "周末 15:30";
    return "今晚 18:30";
  }

  function timeScore(intent, user) {
    if (intent.target_time === "现在") return user.available_time_start <= "18:00" ? 92 : 62;
    if (intent.target_time === "周末") return user.available_time_end >= "20:30" ? 82 : 70;
    return user.available_time_start <= "19:00" && user.available_time_end >= "20:00" ? 96 : 68;
  }

  function timeFeasibilityScore(intent, user, poi) {
    const base = timeScore(intent, user);
    const waitPenalty = Math.min(28, poi.wait_time_min * 1.5);
    return Math.round(clamp(base - waitPenalty + (poi.open_status === "营业中" ? 8 : -12), 30, 100));
  }

  function overlapScore(a, b) {
    const overlap = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
    const span = Math.max(1, Math.max(a[1], b[1]) - Math.min(a[0], b[0]));
    return clamp(38 + (overlap / span) * 72, 30, 100);
  }

  function compatibleStyle(a, b) {
    const soft = ["轻松聊天", "低压力社交", "安静陪伴"];
    const active = ["多人热闹", "认识新朋友"];
    return a === b || (soft.includes(a) && soft.includes(b)) || (active.includes(a) && active.includes(b));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  window.MatchingUtils = { parseIntent, runMatching, replanMatch, computeReputationScore, activityMatchesPoi };
})();
