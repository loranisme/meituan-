(function () {
  function parseIntent(input) {
    const text = String(input || "").trim();
    let activity_type = "饭搭子";
    let category_preference = "韩餐";
    const parseSignals = [];

    if (/KTV|ktv|唱歌|K歌|欢唱/.test(text)) {
      activity_type = "KTV搭子";
      category_preference = "KTV";
      parseSignals.push("activity");
    } else if (/酒吧|小酌|喝酒|微醺|鸡尾酒/.test(text)) {
      activity_type = "酒吧搭子";
      category_preference = "酒吧";
      parseSignals.push("activity");
    } else if (/咖啡|学习|安静|拿铁|手冲/.test(text)) {
      activity_type = "咖啡搭子";
      category_preference = "咖啡";
      parseSignals.push("activity");
    } else if (/夜宵|烧烤|深夜|烤串|炸鸡/.test(text)) {
      activity_type = "夜宵搭子";
      category_preference = /烧烤|烤串/.test(text) ? "烧烤" : "夜宵";
      parseSignals.push("activity");
    } else if (/火锅/.test(text)) {
      category_preference = "火锅";
      parseSignals.push("category");
    } else if (/韩餐|韩国|部队锅|豆腐汤|拌饭/.test(text)) {
      category_preference = "韩餐";
      parseSignals.push("category");
    } else if (/日料|寿司|拉面/.test(text)) {
      category_preference = "日料";
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
    if (!match) return activity_type === "KTV搭子" ? 35 : activity_type === "酒吧搭子" ? 35 : 25;
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
    const category = poi.sub_category === intent.category_preference || poi.tags.includes(intent.category_preference) ? 100 : poi.category === intent.category_preference ? 88 : activityMatchesPoi(intent.activity_type, poi) ? 78 : 35;
    const wait = clamp(100 - poi.wait_time_min * 3, 25, 100);
    const rating = clamp((poi.rating / 5) * 100, 60, 100);
    const heat = clamp(poi.hot_score, 30, 100);
    const total = Math.round(distance * 0.25 + price * 0.2 + category * 0.2 + wait * 0.15 + rating * 0.1 + heat * 0.1);
    return { total, breakdown: { distance: Math.round(distance), price: Math.round(price), category: Math.round(category), wait: Math.round(wait), rating: Math.round(rating), heat: Math.round(heat) } };
  }

  function runMatching(intent, users, pois) {
    const userCandidates = users
      .map((user) => ({ user, score: calculateUserMatchScore(intent, user) }))
      .filter(({ score }) => score.total >= 50)
      .sort((a, b) => b.score.total - a.score.total);
    const placeCandidates = pois
      .filter((poi) => activityMatchesPoi(intent.activity_type, poi) || poi.sub_category === intent.category_preference || poi.tags.includes(intent.category_preference))
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
      const total_score = Math.round(user_score * 0.45 + place_score * 0.40 + time_feasibility_score * 0.15);
      const score_breakdown = { ...userItem.score.breakdown, place: place_score, time_feasibility: time_feasibility_score };
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
    return `你和 ${user.nickname} 匹配度为 ${totalScore || score_breakdown.total || 89}%。你们预算接近，都偏好${intent.category_preference}，并且都选择${intent.social_style}模式，因此适合一起去 ${poi.name}。`;
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
      replanning_notice: `${actionText}AI 推荐切换到 ${newPoi.name}，人均 $${newPoi.avg_price}，等待约 ${newPoi.wait_time_min} 分钟。`
    };
  }

  function findBackupPoi(intent, currentPoi, pois) {
    return pois
      .filter((poi) => poi.poi_id !== currentPoi.poi_id)
      .filter((poi) => activityMatchesPoi(intent.activity_type, poi) || poi.sub_category === currentPoi.sub_category || poi.sub_category === intent.category_preference)
      .sort((a, b) => Math.abs(a.avg_price - currentPoi.avg_price) - Math.abs(b.avg_price - currentPoi.avg_price) || a.wait_time_min - b.wait_time_min)[0];
  }

  function activityMatchesPoi(activity, poi) {
    if (activity === "KTV搭子") return poi.category === "KTV";
    if (activity === "酒吧搭子") return poi.category === "酒吧";
    if (activity === "咖啡搭子") return poi.category === "咖啡";
    if (activity === "夜宵搭子") return poi.category === "夜宵";
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

  window.MatchingUtils = { parseIntent, runMatching, replanMatch };
})();
