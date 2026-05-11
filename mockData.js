const mockData = (() => {
  const area = "三里屯生活圈";
  const scenes = ["全部", "饭搭子", "KTV搭子", "酒吧搭子", "咖啡搭子", "夜宵搭子"];

  const pois = [
    ["poi_001", "Seoul Bowl 韩式简餐", "餐厅", "韩餐", 0.8, 20, 4.6, 12, "双人套餐立减 $6", 7, 92, 58, 36, ["韩餐", "豆腐汤", "轻松聊天", "适合1v1"]],
    ["poi_002", "Korean Bowl", "餐厅", "韩餐", 0.9, 18, 4.5, 5, "双人石锅饭套餐 $32", 5, 86, 70, 50, ["韩餐", "低等待", "快吃", "低压力"]],
    ["poi_003", "Little Sheep Hotpot", "餐厅", "火锅", 1.3, 32, 4.7, 24, "四人火锅拼桌套餐 $88", 10, 96, 42, 60, ["火锅", "多人局", "拼桌", "热闹"]],
    ["poi_004", "UCLA Sunset Cafe", "咖啡", "咖啡", 0.6, 14, 4.8, 3, "第二杯半价", 4, 74, 26, 32, ["咖啡", "学习", "安静陪伴", "轻社交"]],
    ["poi_005", "Echo KTV", "KTV", "KTV", 1.1, 28, 4.4, 8, "3 小时欢唱券 $99", 8, 91, 18, 66, ["KTV", "唱歌", "多人热闹", "学生"]],
    ["poi_006", "Village Tap Bar", "酒吧", "酒吧", 1.0, 26, 4.3, 0, "双人饮品券 $22", 5, 82, 55, 76, ["酒吧", "小酌", "喝酒", "认识新朋友"]],
    ["poi_007", "Late Night Skewer", "夜宵", "烧烤", 1.5, 16, 4.5, 12, "夜宵双人串串 $29", 6, 84, 82, 28, ["夜宵", "烧烤", "低预算", "小组"]],
    ["poi_008", "Quest Board Game", "桌游", "桌游", 1.0, 18, 4.6, 0, "四人桌游券 $48", 3, 66, 34, 18, ["桌游", "破冰", "周末", "小组"]],
    ["poi_009", "Mochi Lab", "咖啡", "甜品", 0.7, 12, 4.7, 4, "甜品双拼 $15", 3, 62, 66, 18, ["甜品", "探店", "拍照", "周末"]],
    ["poi_010", "Ramen Corner", "餐厅", "日料", 0.5, 19, 4.4, 15, "拉面加小食 $21", 2, 56, 23, 45, ["日料", "快吃", "安静陪伴"]],
    ["poi_011", "BCD Tofu House", "餐厅", "韩餐", 1.2, 22, 4.6, 16, "双人豆腐汤套餐 $38", 6, 88, 76, 38, ["韩餐", "豆腐汤", "轻松聊天"]],
    ["poi_012", "Northern Dumpling", "餐厅", "中餐", 0.9, 17, 4.3, 9, "双人饺子套餐 $28", 3, 61, 47, 42, ["中餐", "低预算", "快吃"]],
    ["poi_013", "Sushi West", "餐厅", "日料", 1.4, 31, 4.6, 14, "双人寿司套餐 $52", 4, 72, 78, 64, ["日料", "精致", "1v1"]],
    ["poi_014", "Thai Basil", "餐厅", "东南亚菜", 1.1, 24, 4.4, 10, "双人冬阴功套餐 $42", 4, 69, 35, 72, ["东南亚", "探店", "轻松聊天"]],
    ["poi_015", "Burger Study", "餐厅", "美式", 0.4, 15, 4.2, 6, "汉堡套餐 $13.9", 2, 52, 50, 24, ["快吃", "学生", "低预算"]],
    ["poi_016", "Pasta Lab", "餐厅", "西餐", 1.0, 27, 4.5, 17, "双人意面套餐 $49", 3, 63, 40, 82, ["西餐", "拍照", "轻社交"]],
    ["poi_017", "Powell Coffee", "咖啡", "咖啡", 0.5, 10, 4.5, 2, "咖啡甜点 $12", 5, 78, 61, 23, ["咖啡", "学习", "安静陪伴"]],
    ["poi_018", "Diddy Riese", "咖啡", "甜品", 0.6, 9, 4.7, 7, "冰淇淋曲奇 $6", 4, 76, 72, 22, ["甜品", "探店", "拍照"]],
    ["poi_019", "Espresso Corner", "咖啡", "咖啡", 1.2, 13, 4.4, 4, "手冲咖啡券 $8", 3, 58, 30, 78, ["咖啡", "工作", "安静"]],
    ["poi_020", "Study Tea House", "咖啡", "奶茶", 0.8, 11, 4.3, 5, "双人奶茶 $10", 4, 68, 86, 55, ["奶茶", "学习", "安静陪伴"]],
    ["poi_021", "Sing Room KTV", "KTV", "KTV", 1.4, 30, 4.2, 13, "小包 2 小时 $69", 6, 83, 14, 54, ["KTV", "唱歌", "多人热闹"]],
    ["poi_022", "Campus Karaoke", "KTV", "KTV", 1.6, 25, 4.3, 6, "晚场欢唱 $59", 5, 80, 20, 78, ["KTV", "学生", "多人局"]],
    ["poi_023", "LiveMic KTV", "KTV", "KTV", 1.8, 35, 4.5, 11, "四人欢唱套餐 $109", 4, 75, 12, 24, ["KTV", "设备好", "多人热闹"]],
    ["poi_024", "Bar 404", "酒吧", "酒吧", 1.2, 32, 4.4, 0, "双人鸡尾酒 $28", 5, 81, 36, 88, ["酒吧", "小酌", "认识新朋友"]],
    ["poi_025", "Low Proof Lab", "酒吧", "酒吧", 1.5, 29, 4.6, 0, "低酒精饮品券 $24", 4, 73, 67, 85, ["酒吧", "低压力", "下班后"]],
    ["poi_026", "Jazz Patio", "酒吧", "爵士酒吧", 1.7, 36, 4.7, 5, "Live 双人座 $49", 3, 70, 88, 74, ["爵士", "安静陪伴", "小酌"]],
    ["poi_027", "Escape Archive", "桌游", "密室", 1.1, 42, 4.6, 0, "四人密室券 $128", 3, 67, 31, 10, ["密室", "周末", "小组"]],
    ["poi_028", "Switch House", "桌游", "游戏馆", 1.3, 20, 4.4, 0, "双人游戏券 $25", 3, 60, 90, 42, ["游戏", "破冰", "小组"]],
    ["poi_029", "Midnight Congee", "夜宵", "夜宵", 1.0, 14, 4.5, 5, "夜宵粥品双人餐 $22", 4, 71, 51, 90, ["夜宵", "深夜", "安静陪伴"]],
    ["poi_030", "Crispy Chicken Club", "夜宵", "炸鸡", 1.4, 18, 4.3, 9, "炸鸡啤酒双人券 $31", 4, 69, 79, 92, ["夜宵", "炸鸡", "聊天"]]
  ].map(([poi_id, name, category, sub_category, distance_km, avg_price_usd, rating, wait_time_min, deal_text, buddy_demand_count, hot_score, x, y, tags]) => ({
    poi_id,
    name,
    category,
    sub_category,
    area,
    distance_km,
    avg_price: avg_price_usd * 5,
    rating,
    wait_time_min,
    open_status: "营业中",
    tags,
    suitable_social_styles: tags.includes("多人热闹") || tags.includes("多人局") ? ["多人热闹", "认识新朋友"] : tags.includes("安静陪伴") || tags.includes("安静") ? ["安静陪伴", "轻松聊天"] : ["轻松聊天", "低压力社交"],
    deal_available: true,
    deal_text,
    buddy_demand_count,
    hot_score,
    x,
    y
  }));

  const targetUsers = [
    {
      user_id: "user_027",
      nickname: "M-27",
      area,
      distance_km: 0.5,
      available_time_start: "18:00",
      available_time_end: "20:30",
      budget_min: 50,
      budget_max: 90,
      preferred_categories: ["韩餐", "咖啡"],
      interest_labels: ["电影", "健身", "韩餐", "轻松聊天"],
      social_style: "轻松聊天",
      group_preference: "1v1",
      distance_tolerance_km: 1.5,
      verified_status: true,
      safety_level: "normal",
      mock_meituan_behavior: { recent_views: ["韩餐", "豆腐汤", "咖啡"], saved_places: ["Seoul Bowl 韩式简餐"], past_orders: ["韩餐", "火锅"], avg_spend: 75, frequent_area: area, deal_preference: "喜欢团购" }
    },
    {
      user_id: "user_018",
      nickname: "K-18",
      area,
      distance_km: 1.1,
      available_time_start: "19:00",
      available_time_end: "23:30",
      budget_min: 80,
      budget_max: 150,
      preferred_categories: ["KTV", "火锅"],
      interest_labels: ["KTV", "音乐", "学生", "多人热闹"],
      social_style: "多人热闹",
      group_preference: "多人局",
      distance_tolerance_km: 3,
      verified_status: true,
      safety_level: "normal",
      mock_meituan_behavior: { recent_views: ["KTV", "火锅"], saved_places: ["Echo KTV"], past_orders: ["KTV"], avg_spend: 29, frequent_area: area, deal_preference: "喜欢套餐" }
    },
    {
      user_id: "user_042",
      nickname: "L-42",
      area,
      distance_km: 0.6,
      available_time_start: "14:00",
      available_time_end: "18:00",
      budget_min: 30,
      budget_max: 60,
      preferred_categories: ["咖啡", "甜品"],
      interest_labels: ["咖啡", "学习", "摄影", "安静陪伴"],
      social_style: "安静陪伴",
      group_preference: "1v1",
      distance_tolerance_km: 1.2,
      verified_status: true,
      safety_level: "normal",
      mock_meituan_behavior: { recent_views: ["咖啡", "甜品"], saved_places: ["Powell Coffee"], past_orders: ["咖啡"], avg_spend: 14, frequent_area: area, deal_preference: "更看重评分" }
    },
    {
      user_id: "user_031",
      nickname: "S-31",
      area,
      distance_km: 1.4,
      available_time_start: "21:00",
      available_time_end: "23:59",
      budget_min: 50,
      budget_max: 100,
      preferred_categories: ["烧烤", "夜宵"],
      interest_labels: ["夜宵", "电影", "聊天", "轻松聊天"],
      social_style: "轻松聊天",
      group_preference: "小组",
      distance_tolerance_km: 2,
      verified_status: true,
      safety_level: "normal",
      mock_meituan_behavior: { recent_views: ["夜宵", "烧烤"], saved_places: ["Late Night Skewer"], past_orders: ["夜宵"], avg_spend: 17, frequent_area: area, deal_preference: "喜欢低价团购" }
    }
  ];

  const categoryPool = ["韩餐", "火锅", "KTV", "酒吧", "咖啡", "甜品", "烧烤", "夜宵", "日料", "桌游"];
  const stylePool = ["轻松聊天", "安静陪伴", "多人热闹", "低压力社交"];
  const interestPool = ["电影", "健身", "摄影", "游戏", "音乐", "学习", "旅行", "探店", "韩餐", "KTV", "咖啡", "夜宵", "桌游", "小酌"];
  const users = [
    ...targetUsers,
    ...Array.from({ length: 46 }, (_, index) => {
      const n = index + 1;
      const first = categoryPool[(index + 1) % categoryPool.length];
      const second = categoryPool[(index + 4) % categoryPool.length];
      const social_style = stylePool[(index + 1) % stylePool.length];
      return {
        user_id: `user_${String(100 + n).padStart(3, "0")}`,
        nickname: `${["A", "B", "C", "D", "E", "F", "G", "H"][index % 8]}-${String(10 + n).padStart(2, "0")}`,
        area,
        distance_km: Number((0.3 + (index % 13) * 0.17).toFixed(1)),
        available_time_start: index % 4 === 0 ? "19:00" : index % 5 === 0 ? "21:00" : "18:00",
        available_time_end: index % 5 === 0 ? "23:59" : index % 3 === 0 ? "22:00" : "20:30",
        budget_min: 40 + (index % 5) * 15,
        budget_max: 80 + (index % 6) * 30,
        preferred_categories: [first, second],
        interest_labels: [first, social_style, interestPool[(index + 4) % interestPool.length], interestPool[(index + 9) % interestPool.length]],
        social_style,
        group_preference: index % 5 === 0 ? "多人局" : index % 3 === 0 ? "小组" : "1v1",
        distance_tolerance_km: index % 4 === 0 ? 3 : 1.5,
        verified_status: index % 7 !== 0,
        safety_level: index % 7 === 0 ? "basic" : "normal",
        mock_meituan_behavior: {
          recent_views: [first, second],
          saved_places: [pois[index % pois.length].name],
          past_orders: [first],
          avg_spend: 15 + (index % 7) * 6,
          frequent_area: area,
          deal_preference: index % 2 === 0 ? "喜欢团购" : "更看重距离"
        }
      };
    })
  ];

  const backgroundUsers = Array.from({ length: 168 }, (_, index) => ({
    bg_user_id: `bg_${String(index + 1).padStart(3, "0")}`,
    activity_type: ["饭搭子", "KTV搭子", "酒吧搭子", "咖啡搭子", "夜宵搭子"][index % 5],
    linked_poi_id: pois[index % pois.length].poi_id
  }));

  const activityFromPoi = (poi) => {
    if (poi.category === "KTV") return "KTV搭子";
    if (poi.category === "酒吧") return "酒吧搭子";
    if (poi.category === "咖啡") return "咖啡搭子";
    if (poi.category === "夜宵") return "夜宵搭子";
    return "饭搭子";
  };

  const buddyDemands = Array.from({ length: 80 }, (_, index) => {
    const poi = pois[index % pois.length];
    const user = users[(index * 7) % users.length];
    const activity_type = activityFromPoi(poi);
    const group_size = activity_type === "KTV搭子" ? "多人局" : index % 4 === 0 ? "小组" : "1v1";
    const target_time = activity_type === "夜宵搭子" ? "今晚 22:30" : index % 5 === 0 ? "现在" : index % 6 === 0 ? "周末 15:30" : `今晚 ${18 + (index % 3)}:${index % 2 ? "30" : "00"}`;
    return {
      demand_id: `demand_${String(index + 1).padStart(3, "0")}`,
      user_id: user.user_id,
      poi_id: poi.poi_id,
      activity_type,
      target_time,
      budget_min: Math.max(8, poi.avg_price - 8),
      budget_max: poi.avg_price + 10,
      social_style: poi.suitable_social_styles[index % poi.suitable_social_styles.length],
      group_size,
      note: `${target_time} 想去 ${poi.name}，偏好${poi.suitable_social_styles[0]}，预算 $${Math.max(8, poi.avg_price - 8)}-$${poi.avg_price + 10}。`,
      status: index % 11 === 0 ? "matched" : "waiting",
      created_at: `2026-05-08 ${String(16 + (index % 5)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}`
    };
  });

  buddyDemands.unshift({
    demand_id: "demand_main_001",
    user_id: "user_027",
    poi_id: "poi_001",
    activity_type: "饭搭子",
    target_time: "今晚 18:30",
    budget_min: 60,
    budget_max: 100,
    social_style: "轻松聊天",
    group_size: "1v1",
    note: "想找人一起吃韩餐，不想太尴尬，轻松聊聊。",
    status: "waiting",
    created_at: "2026-05-08 17:10"
  });
  buddyDemands.splice(80);

  const matchPlans = [
    ["match_001", "user_027", "poi_001", "poi_002", 89, "今晚 18:30", "你们都想今晚吃韩餐，预算都在 $20 左右，并且都选择轻松聊天模式。"],
    ["match_002", "user_018", "poi_005", "poi_022", 91, "今晚 20:00", "你们都想唱歌，偏好多人热闹，预算和距离匹配。"],
    ["match_003", "user_042", "poi_017", "poi_004", 88, "周末 15:30", "你们都偏好咖啡和安静学习，适合低压力见面。"],
    ["match_004", "user_031", "poi_007", "poi_029", 87, "今晚 22:30", "你们都想吃夜宵烧烤，预算较低且可接受小组局。"],
    ["match_005", "user_112", "poi_003", "poi_012", 86, "今晚 19:00", "火锅拼桌需求匹配，适合多人热闹。"],
    ["match_006", "user_118", "poi_006", "poi_024", 85, "今晚 21:00", "酒吧小酌需求和社交风格匹配。"],
    ["match_007", "user_122", "poi_008", "poi_028", 84, "周末 16:00", "桌游破冰小组局匹配。"],
    ["match_008", "user_127", "poi_018", "poi_009", 83, "周末 15:00", "甜品探店和拍照兴趣匹配。"]
  ].map(([match_id, matched_user_id, selected_poi_id, backup_poi_id, match_score, suggested_time, ai_explanation]) => ({
    match_id,
    current_user_id: "user_current",
    matched_user_id,
    selected_poi_id,
    backup_poi_id,
    match_score,
    suggested_time,
    ai_explanation,
    opening_message: `哈喽，我看到我们需求很接近，AI 推荐 ${suggested_time} 去 ${pois.find((p) => p.poi_id === selected_poi_id).name}，你觉得可以吗？`,
    status: "pending_confirmation"
  }));

  const chatThreads = matchPlans.slice(0, 6).map((plan, index) => ({
    chat_id: `chat_${String(index + 1).padStart(3, "0")}`,
    match_id: plan.match_id,
    messages: [
      { sender: "ai", text: plan.opening_message, timestamp: "18:05" },
      { sender: "user_current", text: "可以，我这个时间有空。", timestamp: "18:06" },
      { sender: "matched_user", text: "我也可以，这家离我也不远。", timestamp: "18:07" }
    ],
    plan_status: "pending",
    current_user_confirmed: false,
    matched_user_confirmed: false
  }));

  const deals = pois.filter((_, index) => index % 2 === 0).slice(0, 15).map((poi, index) => ({
    deal_id: `deal_${String(index + 1).padStart(3, "0")}`,
    poi_id: poi.poi_id,
    deal_type: poi.category === "KTV" ? "多人套餐" : poi.category === "酒吧" ? "饮品券" : "双人套餐",
    title: poi.deal_text,
    original_price: Math.round(poi.avg_price * (poi.category === "KTV" ? 4.2 : 2.4)),
    discount_price: Math.round(poi.avg_price * (poi.category === "KTV" ? 3.2 : 1.9)),
    suitable_group_size: poi.category === "KTV" || poi.category === "桌游" ? "3-4人" : "2人",
    valid_time: index % 3 === 0 ? "今晚可用" : "本周可用",
    conversion_cta: poi.category === "KTV" ? "购买欢唱券" : "购买团购券"
  }));

  const replanningEvents = [
    ["event_001", "match_001", "waiting_time_change", "等待时间 12 分钟", "等待时间 35 分钟", "18:12", "检测到原餐厅等待时间从 12 分钟上升到 35 分钟。为了满足低等待和轻松成局需求，AI 推荐切换到 Korean Bowl，人均 $18，等待约 5 分钟。", "poi_002", "今晚 18:40"],
    ["event_002", "match_002", "change_place", "Echo KTV 包厢紧张", "Campus Karaoke 有空包", "19:40", "原 KTV 包厢紧张，AI 推荐切换到 Campus Karaoke，价格更低且仍适合多人热闹。", "poi_022", "今晚 20:10"],
    ["event_003", "match_003", "waiting_time_change", "咖啡店满座", "Powell Coffee 有座", "15:10", "原地点座位不足，AI 推荐切换到 Powell Coffee，适合安静学习。", "poi_017", "周末 15:45"],
    ["event_004", "match_004", "change_place", "烧烤排队过长", "Midnight Congee 低等待", "22:20", "夜宵烧烤等待过久，AI 推荐切换到 Midnight Congee，预算和时间都符合。", "poi_029", "今晚 22:45"],
    ["event_005", "match_005", "user_delay", "对方晚到 20 分钟", "调整时间", "18:50", "一方晚到，AI 将见面时间顺延并保留当前地点。", "poi_003", "今晚 19:20"]
  ].map(([event_id, match_id, event_type, old_value, new_value, trigger_time, ai_replan_text, new_poi_id, new_suggested_time]) => ({
    event_id,
    match_id,
    event_type,
    old_value,
    new_value,
    trigger_time,
    ai_replan_text,
    new_poi_id,
    new_suggested_time
  }));

  const sparseSupply = {
    users: users.filter((u) => ["user_042", "user_031", "user_127"].includes(u.user_id)),
    pois: pois.filter((p) => ["poi_004", "poi_018", "poi_029"].includes(p.poi_id))
  };

  return { area, scenes, pois, users, backgroundUsers, buddyDemands, matchPlans, chatThreads, deals, replanningEvents, sparseSupply };
})();

window.mockData = mockData;
