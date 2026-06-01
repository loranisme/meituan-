const mockData = (() => {
  const area = "本地生活圈";
  const areaShort = "生活圈";

  /** 品牌：口语邀请感，三字好记（广告如：饭点走起不？） */
  const brand = {
    name: "走起不",
    tagline: "想出门，就走起不",
    slogans: [
      "一个人无聊？附近有人也想逛",
      "不组局也行，先出门碰碰运气",
      "顺路、随性，走起不"
    ]
  };

  // 美团上海科技中心 · 杨浦滨江南段（GCJ-02，高德地图坐标系）
  const MAP_CENTER = { lat: 31.252634, lng: 121.549153 };

  /** 可切换的生活圈（演示：不同范围/主题筛店） */
  const lifeCircles = [
    {
      id: "near",
      shortName: "生活圈",
      name: "附近 · 生活圈",
      tagline: "以你为中心约 2km · 日常最常逛",
      vibe: "慢节奏",
      radius_km: 2,
      center_lat: MAP_CENTER.lat,
      center_lng: MAP_CENTER.lng,
      accent: "#FF6B35",
      tint: "#FFF8E6",
      matchTags: ["下班顺路", "一个人也行", "步行就到"],
      hotScenes: ["饭搭子", "咖啡搭子", "夜宵搭子"],
      trends: ["安静咖啡坐一会", "轻食不尬聊", "散个步顺便吃饭"],
      filter: (p) => (p.distance_km ?? 99) <= 2.5
    },
    {
      id: "eat",
      shortName: "吃喝圈",
      name: "美食热力圈",
      tagline: "餐厅 · 咖啡 · 夜宵 · 酒吧",
      vibe: "烟火气",
      radius_km: 3,
      center_lat: MAP_CENTER.lat,
      center_lng: MAP_CENTER.lng,
      trends: ["人均 80 内", "排队别太久", "小酌一杯"],
      accent: "#FF2442",
      tint: "#FFF0F0",
      matchTags: ["人均透明", "等位可见", "团购可拼"],
      hotScenes: ["饭搭子", "咖啡搭子", "酒吧搭子"],
      filter: (p) => ["餐厅", "咖啡", "夜宵", "酒吧"].includes(p.category)
    },
    {
      id: "play",
      shortName: "玩乐圈",
      name: "夜玩活力圈",
      tagline: "KTV · 桌游 · 周末局更多",
      vibe: "热闹劲",
      radius_km: 4,
      center_lat: MAP_CENTER.lat,
      center_lng: MAP_CENTER.lng,
      trends: ["周末开嗓", "狼人 4 人局", "包厢别太贵"],
      accent: "#8B5CF6",
      tint: "#F5F0FF",
      matchTags: ["多人局友好", "包厢可查", "周末档热门"],
      hotScenes: ["KTV搭子", "聚会桌游搭子", "跑团搭子"],
      filter: (p) => ["KTV", "桌游", "酒吧"].includes(p.category)
    },
    {
      id: "sport",
      shortName: "运动圈",
      name: "动起来圈",
      tagline: "攀岩 · 骑行 · 户外轻社交",
      vibe: "透口气",
      radius_km: 5,
      center_lat: MAP_CENTER.lat,
      center_lng: MAP_CENTER.lng,
      trends: ["新手友好抱石", "休闲骑 10km", "户外拍照走走"],
      accent: "#2F7EF7",
      tint: "#EFF5FF",
      matchTags: ["新手友好", "装备可租", "节奏可协商"],
      hotScenes: ["攀岩搭子", "骑行搭子"],
      filter: (p) => ["攀岩", "骑行"].includes(p.category)
    }
  ];
  const sceneCatalog = {
    "饭搭子": { abbr: "饭", tagline: "一起吃饭", groupId: "eat" },
    "咖啡搭子": { abbr: "咖", tagline: "咖啡聊聊", groupId: "eat" },
    "夜宵搭子": { abbr: "夜", tagline: "深夜食堂", groupId: "eat" },
    "酒吧搭子": { abbr: "酒", tagline: "小酌一杯", groupId: "eat" },
    "KTV搭子": { abbr: "K", tagline: "欢唱组局", groupId: "play" },
    "攀岩搭子": { abbr: "攀", tagline: "抱石攀岩", groupId: "sport" },
    "骑行搭子": { abbr: "骑", tagline: "一起骑", groupId: "sport" },
    "聚会桌游搭子": { abbr: "局", tagline: "狼人阿瓦隆", groupId: "board" },
    "RPG桌游搭子": { abbr: "R", tagline: "美式 RPG", groupId: "board" },
    "跑团搭子": { abbr: "团", tagline: "TRPG 剧本", groupId: "board" },
    "桌游搭子": { abbr: "游", tagline: "桌游综合", groupId: "board" }
  };

  const sceneGroups = [
    { id: "eat", label: "吃喝", subtitle: "举杯上桌", abbr: "食", accent: "#FF6B35", tint: "#FFF4ED", scenes: ["饭搭子", "咖啡搭子", "夜宵搭子", "酒吧搭子"] },
    { id: "play", label: "玩乐", subtitle: "嗨玩一晚", abbr: "玩", accent: "#8B5CF6", tint: "#F5F0FF", scenes: ["KTV搭子"] },
    { id: "sport", label: "运动", subtitle: "动起来", abbr: "动", accent: "#2F7EF7", tint: "#EFF5FF", scenes: ["攀岩搭子", "骑行搭子"] },
    { id: "board", label: "桌游", subtitle: "沉浸一晚", abbr: "桌", accent: "#22A06B", tint: "#ECFAF3", scenes: ["聚会桌游搭子", "RPG桌游搭子", "跑团搭子", "桌游搭子"] }
  ];

  const scenes = [
    "全部",
    ...sceneGroups.flatMap((g) => g.scenes)
  ];

  /** 示意地图坐标说明（非高德经纬度） */
  const MAP_LAYOUT = {
    type: "schematic_percent",
    description: "x、y 为商圈示意图上的百分比位置（0–100），左上为 (0,0)。与 distance_km（直线距离/mock）独立。",
    user_pin: { x: 48, y: 54, label: "你在这里（示意）" },
    zones: {
      eat: { label: "餐饮区", x: "35–75", y: "25–65" },
      play: { label: "文娱区", x: "10–30", y: "10–35" },
      sport: { label: "运动区", x: "8–35", y: "50–90" },
      board: { label: "桌游区", x: "60–92", y: "12–55" }
    }
  };

  const sceneIntentSamples = {
    "饭搭子": "今晚想找一个人吃韩餐，预算 80 元以内，不想太尴尬，最好轻松聊聊。",
    "攀岩搭子": "周末想找抱石搭子，新手 V3，预算 120 元以内，装备可租。",
    "骑行搭子": "周末沿河休闲骑行 15km，预算 60 元以内，节奏别太快。",
    "跑团搭子": "周六晚上跑团局，克苏鲁模组，缺 1 人，预算 100 元以内。",
    "RPG桌游搭子": "想玩美式 RPG / DND 新手局，预算 90 元以内，有主持人更好。",
    "聚会桌游搭子": "今晚狼人阿瓦隆桌游，3-4 人，预算 70 元以内，轻松破冰。"
  };

  const pois = [
    ["poi_001", "Seoul Bowl 韩式简餐", "餐厅", "韩餐", 0.8, 20, 4.6, 12, "双人套餐立减 $6", 7, 92, 58, 36, ["韩餐", "豆腐汤", "轻松聊天", "适合1v1"]],
    ["poi_002", "Korean Bowl", "餐厅", "韩餐", 0.9, 18, 4.5, 5, "双人石锅饭套餐 $32", 5, 86, 70, 50, ["韩餐", "低等待", "快吃", "低压力"]],
    ["poi_003", "Little Sheep Hotpot", "餐厅", "火锅", 1.3, 32, 4.7, 24, "四人火锅拼桌套餐 $88", 10, 96, 42, 60, ["火锅", "多人局", "拼桌", "热闹"]],
    ["poi_004", "UCLA Sunset Cafe", "咖啡", "咖啡", 0.6, 14, 4.8, 3, "第二杯半价", 4, 74, 26, 32, ["咖啡", "学习", "安静陪伴", "轻社交"]],
    ["poi_005", "Echo KTV", "KTV", "KTV", 1.1, 28, 4.4, 8, "3 小时欢唱券 $99", 8, 91, 18, 66, ["KTV", "唱歌", "多人热闹", "学生"]],
    ["poi_006", "Village Tap Bar", "酒吧", "酒吧", 1.0, 26, 4.3, 0, "双人饮品券 $22", 5, 82, 55, 76, ["酒吧", "小酌", "喝酒", "认识新朋友"]],
    ["poi_007", "Late Night Skewer", "夜宵", "烧烤", 1.5, 16, 4.5, 12, "夜宵双人串串 $29", 6, 84, 82, 28, ["夜宵", "烧烤", "低预算", "小组"]],
    ["poi_008", "Quest Board Game", "桌游", "聚会桌游", 1.0, 18, 4.6, 0, "四人桌游券 $48", 3, 66, 66, 38, ["桌游", "破冰", "周末", "小组"]],
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
    ["poi_027", "Escape Archive", "桌游", "密室", 1.1, 42, 4.6, 0, "四人密室券 $128", 3, 67, 74, 28, ["密室", "周末", "小组"]],
    ["poi_028", "Switch House", "桌游", "游戏馆", 1.3, 20, 4.4, 0, "双人游戏券 $25", 3, 60, 84, 48, ["游戏", "破冰", "小组"]],
    ["poi_029", "Midnight Congee", "夜宵", "夜宵", 1.0, 14, 4.5, 5, "夜宵粥品双人餐 $22", 4, 71, 51, 90, ["夜宵", "深夜", "安静陪伴"]],
    ["poi_030", "Crispy Chicken Club", "夜宵", "炸鸡", 1.4, 18, 4.3, 9, "炸鸡啤酒双人券 $31", 4, 69, 79, 92, ["夜宵", "炸鸡", "聊天"]],
    ["poi_031", "Boulder Lab 抱石馆", "攀岩", "抱石", 0.9, 22, 4.7, 0, "双人体验课 ¥168", 5, 74, 18, 62, ["攀岩", "抱石", "新手友好", "周末"]],
    ["poi_032", "Vertical Peak 攀岩中心", "攀岩", "运动攀岩", 1.3, 28, 4.6, 0, "岩壁日票 ¥198", 4, 71, 28, 72, ["攀岩", "顶绳", "进阶", "小组"]],
    ["poi_033", "Campus Climb Studio", "攀岩", "新手体验", 0.7, 18, 4.5, 0, "入门双人课 ¥128", 6, 68, 12, 52, ["攀岩", "体验课", "低压力", "1v1"]],
    ["poi_034", "Riverside Ride Hub", "骑行", "休闲骑行", 1.0, 16, 4.6, 0, "沿河骑行券 ¥58", 4, 65, 22, 78, ["骑行", "休闲", "周末", "轻松聊天"]],
    ["poi_035", "Night Wheel 夜骑驿站", "骑行", "夜骑路线", 1.2, 14, 4.4, 0, "夜骑领队 ¥48", 5, 72, 32, 68, ["骑行", "夜骑", "小组", "认识新朋友"]],
    ["poi_036", "Trail Cycle Park", "骑行", "郊野骑行", 1.8, 24, 4.5, 0, "25km 路线套餐 ¥88", 3, 58, 8, 86, ["骑行", "长途", "运动", "周末"]],
    ["poi_037", "D&D Den 跑团吧", "桌游", "跑团", 1.1, 26, 4.7, 0, "四人跑团包厢 ¥168", 4, 70, 72, 22, ["跑团", "TRPG", "克苏鲁", "小组"]],
    ["poi_038", "Mana RPG House", "桌游", "RPG", 0.9, 22, 4.6, 0, "美式 RPG 局 ¥98", 5, 67, 82, 35, ["RPG", "美式桌游", "角色扮演", "周末"]],
    ["poi_039", "Party Board Cafe", "桌游", "聚会桌游", 0.8, 16, 4.5, 0, "狼人阿瓦隆畅玩 ¥68", 7, 79, 68, 42, ["桌游", "狼人杀", "破冰", "聚会"]],
    ["poi_040", "Dice & Story TRPG", "桌游", "跑团", 1.4, 30, 4.8, 0, "六人剧本跑团 ¥228", 3, 64, 88, 18, ["跑团", "剧本", "沉浸", "小组"]],
    ["poi_041", "HeroQuest RPG Club", "桌游", "RPG", 1.2, 24, 4.5, 0, "DND 新手局 ¥118", 4, 61, 76, 52, ["RPG", "DND", "新手", "低压力"]],
    ["poi_042", "Board Social Loft", "桌游", "聚会桌游", 1.0, 14, 4.4, 0, "三小时桌游通票 ¥52", 6, 73, 62, 38, ["桌游", "卡牌", "轻松聊天", "周末"]]
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
    y,
    // 真实地图坐标：以美团上海总部为中心，由 x/y 示意百分比换算（GCJ-02）
    lng: Number((MAP_CENTER.lng + (x - 50) / 50 * 0.022).toFixed(6)),
    lat: Number((MAP_CENTER.lat - (y - 50) / 50 * 0.018).toFixed(6)),
    map_zone: category === "攀岩" || category === "骑行" ? "运动区" : category === "桌游" ? "桌游区" : category === "KTV" || category === "酒吧" ? "文娱区" : "餐饮区",
    cover_image: `./assets/merchants/${poi_id}.jpg`,
    address: `${area} · ${sub_category}`,
    business_hours: wait_time_min > 20 ? "11:00-23:00" : category === "攀岩" ? "10:00-22:00" : category === "骑行" ? "08:00-21:00" : category === "桌游" ? "12:00-24:00" : "10:00-22:00",
    venue_extra: buildVenueExtra(category, sub_category, tags)
  }));

  function buildVenueExtra(category, sub_category, tags) {
    if (category === "攀岩") {
      const grade = sub_category === "抱石" ? "V2–V5" : sub_category === "运动攀岩" ? "5.9–5.11" : "入门 V0–V3";
      return { climb_grade: grade, gear_rental: "攀岩鞋/镁粉/安全带可租", session_duration: "单次 2–3 小时" };
    }
    if (category === "骑行") {
      const route = sub_category === "郊野骑行" ? "约 25 km" : sub_category === "夜骑路线" ? "约 8 km 夜骑" : "约 12–15 km 沿河";
      return { route_length: route, bike_rental: "公路/山地车可租", meet_point: "门店集合出发" };
    }
    if (category === "桌游") {
      const isTrpg = sub_category === "跑团" || tags.includes("跑团");
      const isRpg = sub_category === "RPG" || tags.includes("RPG");
      return {
        private_room: isTrpg || isRpg ? "4–8 人包厢" : "2–6 人大厅/半包",
        avg_session_hours: isTrpg ? "3–5 小时/局" : isRpg ? "2–4 小时/局" : "2–3 小时畅玩",
        game_focus: isTrpg ? "TRPG/剧本跑团" : isRpg ? "美式 RPG / DND" : "聚会桌游/卡牌"
      };
    }
    return null;
  }

  const reputationFromStats = (completed, noShowRate, peerRating) => {
    const completion = Math.min(100, Math.max(40, (completed / 20) * 100));
    const punctual = Math.min(100, Math.max(30, 100 - noShowRate * 200));
    const reviews = Math.min(100, Math.max(60, (peerRating / 5) * 100));
    return Math.round(completion * 0.4 + punctual * 0.35 + reviews * 0.25);
  };

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
      completed_plans: 12,
      no_show_rate: 0.04,
      peer_rating: 4.7,
      avatar_url: "https://api.dicebear.com/7.x/notionists/svg?seed=user027",
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
    },
    {
      user_id: "user_051",
      nickname: "C-51",
      area,
      distance_km: 0.8,
      available_time_start: "10:00",
      available_time_end: "14:00",
      budget_min: 80,
      budget_max: 160,
      preferred_categories: ["抱石", "运动攀岩"],
      interest_labels: ["攀岩", "健身", "周末", "低压力社交"],
      social_style: "低压力社交",
      group_preference: "1v1",
      distance_tolerance_km: 2,
      verified_status: true,
      safety_level: "normal",
      completed_plans: 9,
      no_show_rate: 0.05,
      peer_rating: 4.6,
      avatar_url: "https://api.dicebear.com/7.x/notionists/svg?seed=user051",
      mock_meituan_behavior: { recent_views: ["攀岩", "抱石"], saved_places: ["Boulder Lab 抱石馆"], past_orders: ["攀岩"], avg_spend: 22, frequent_area: area, deal_preference: "体验课优先" }
    },
    {
      user_id: "user_052",
      nickname: "R-52",
      area,
      distance_km: 1.0,
      available_time_start: "18:00",
      available_time_end: "22:00",
      budget_min: 40,
      budget_max: 90,
      preferred_categories: ["休闲骑行", "夜骑路线"],
      interest_labels: ["骑行", "运动", "周末", "轻松聊天"],
      social_style: "轻松聊天",
      group_preference: "小组",
      distance_tolerance_km: 2.5,
      verified_status: true,
      safety_level: "normal",
      completed_plans: 11,
      no_show_rate: 0.03,
      peer_rating: 4.8,
      avatar_url: "https://api.dicebear.com/7.x/notionists/svg?seed=user052",
      mock_meituan_behavior: { recent_views: ["骑行", "夜骑"], saved_places: ["Riverside Ride Hub"], past_orders: ["骑行"], avg_spend: 16, frequent_area: area, deal_preference: "路线套餐" }
    },
    {
      user_id: "user_053",
      nickname: "T-53",
      area,
      distance_km: 0.9,
      available_time_start: "13:00",
      available_time_end: "23:00",
      budget_min: 50,
      budget_max: 120,
      preferred_categories: ["跑团", "RPG"],
      interest_labels: ["跑团", "TRPG", "桌游", "小组"],
      social_style: "多人热闹",
      group_preference: "小组",
      distance_tolerance_km: 2,
      verified_status: true,
      safety_level: "normal",
      completed_plans: 15,
      no_show_rate: 0.02,
      peer_rating: 4.9,
      avatar_url: "https://api.dicebear.com/7.x/notionists/svg?seed=user053",
      mock_meituan_behavior: { recent_views: ["跑团", "RPG"], saved_places: ["D&D Den 跑团吧"], past_orders: ["桌游"], avg_spend: 26, frequent_area: area, deal_preference: "包厢优先" }
    },
    {
      user_id: "user_054",
      nickname: "B-54",
      area,
      distance_km: 0.7,
      available_time_start: "14:00",
      available_time_end: "22:00",
      budget_min: 35,
      budget_max: 80,
      preferred_categories: ["聚会桌游"],
      interest_labels: ["桌游", "狼人杀", "破冰", "轻松聊天"],
      social_style: "轻松聊天",
      group_preference: "小组",
      distance_tolerance_km: 1.8,
      verified_status: true,
      safety_level: "normal",
      completed_plans: 8,
      no_show_rate: 0.06,
      peer_rating: 4.5,
      avatar_url: "https://api.dicebear.com/7.x/notionists/svg?seed=user054",
      mock_meituan_behavior: { recent_views: ["桌游", "聚会桌游"], saved_places: ["Party Board Cafe"], past_orders: ["桌游"], avg_spend: 16, frequent_area: area, deal_preference: "畅玩票" }
    }
  ];

  const categoryPool = ["韩餐", "火锅", "KTV", "酒吧", "咖啡", "甜品", "烧烤", "夜宵", "日料", "桌游", "抱石", "骑行", "跑团", "RPG", "聚会桌游"];
  const stylePool = ["轻松聊天", "安静陪伴", "多人热闹", "低压力社交"];
  const interestPool = ["电影", "健身", "摄影", "游戏", "音乐", "学习", "旅行", "探店", "韩餐", "KTV", "咖啡", "夜宵", "桌游", "小酌", "攀岩", "骑行", "跑团", "RPG", "狼人杀"];
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
        completed_plans: 3 + (index % 12),
        no_show_rate: Number((0.04 + (index % 7) * 0.015).toFixed(2)),
        peer_rating: Number((4.2 + (index % 8) * 0.08).toFixed(1)),
        avatar_url: `https://api.dicebear.com/7.x/notionists/svg?seed=u${100 + n}`,
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
  ].map((user) => ({
    ...user,
    reputation_score: user.reputation_score != null ? user.reputation_score : reputationFromStats(user.completed_plans || 5, user.no_show_rate || 0.08, user.peer_rating || 4.5)
  }));

  const currentUser = {
    user_id: "user_me",
    nickname: "小团",
    area,
    avatar_url: "https://api.dicebear.com/7.x/notionists/svg?seed=meituan-together",
    reputation_score: reputationFromStats(14, 0.03, 4.8),
    completed_plans: 14,
    no_show_rate: 0.03,
    peer_rating: 4.8,
    verified_status: true,
    interest_labels: ["韩餐", "咖啡", "轻松聊天", "探店"],
    social_style: "轻松聊天"
  };

  const backgroundUsers = Array.from({ length: 168 }, (_, index) => ({
    bg_user_id: `bg_${String(index + 1).padStart(3, "0")}`,
    activity_type: ["饭搭子", "KTV搭子", "酒吧搭子", "咖啡搭子", "夜宵搭子", "攀岩搭子", "骑行搭子", "桌游搭子", "跑团搭子", "聚会桌游搭子"][index % 10],
    linked_poi_id: pois[index % pois.length].poi_id
  }));

  const activityFromPoi = (poi) => {
    if (poi.category === "KTV") return "KTV搭子";
    if (poi.category === "酒吧") return "酒吧搭子";
    if (poi.category === "咖啡") return "咖啡搭子";
    if (poi.category === "夜宵") return "夜宵搭子";
    if (poi.category === "攀岩") return "攀岩搭子";
    if (poi.category === "骑行") return "骑行搭子";
    if (poi.category === "桌游") {
      if (poi.sub_category === "跑团" || (poi.tags || []).includes("跑团")) return "跑团搭子";
      if (poi.sub_category === "RPG" || (poi.tags || []).includes("RPG")) return "RPG桌游搭子";
      if (poi.sub_category === "聚会桌游") return "聚会桌游搭子";
      return "桌游搭子";
    }
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
      note: `${target_time} 想去 ${poi.name}，偏好${poi.suitable_social_styles[0]}，预算 ¥${Math.max(8, poi.avg_price - 8)}-¥${poi.avg_price + 10}。`,
      status: index % 11 === 0 ? "matched" : "waiting",
      created_at: `2026-05-08 ${String(16 + (index % 5)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}`
    };
  });

  buddyDemands.unshift(
    {
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
    },
    {
      demand_id: "demand_climb_001",
      user_id: "user_051",
      poi_id: "poi_031",
      activity_type: "攀岩搭子",
      target_time: "周末 10:30",
      budget_min: 80,
      budget_max: 140,
      social_style: "低压力社交",
      group_size: "1v1",
      note: "想找抱石搭子，新手 V3 左右，装备可租。",
      status: "waiting",
      created_at: "2026-05-08 09:20"
    },
    {
      demand_id: "demand_ride_001",
      user_id: "user_052",
      poi_id: "poi_034",
      activity_type: "骑行搭子",
      target_time: "周末 15:00",
      budget_min: 40,
      budget_max: 80,
      social_style: "轻松聊天",
      group_size: "小组",
      note: "沿河休闲骑 12km，节奏不要太快。",
      status: "waiting",
      created_at: "2026-05-08 14:05"
    },
    {
      demand_id: "demand_trpg_001",
      user_id: "user_053",
      poi_id: "poi_037",
      activity_type: "跑团搭子",
      target_time: "周六 19:00",
      budget_min: 60,
      budget_max: 120,
      social_style: "多人热闹",
      group_size: "小组",
      note: "缺 1 位玩家，克苏鲁模组，有 DM。",
      status: "waiting",
      created_at: "2026-05-08 16:40"
    },
    {
      demand_id: "demand_board_001",
      user_id: "user_054",
      poi_id: "poi_039",
      activity_type: "聚会桌游搭子",
      target_time: "今晚 20:00",
      budget_min: 35,
      budget_max: 70,
      social_style: "轻松聊天",
      group_size: "小组",
      note: "狼人/阿瓦隆局，3-4 人即可开。",
      status: "waiting",
      created_at: "2026-05-08 18:00"
    },
    {
      demand_id: "demand_climb_002",
      user_id: "user_112",
      poi_id: "poi_032",
      activity_type: "攀岩搭子",
      target_time: "周六 11:00",
      budget_min: 90,
      budget_max: 150,
      social_style: "多人热闹",
      group_size: "小组",
      note: "顶绳区组队，想要进阶线路搭子。",
      status: "waiting",
      created_at: "2026-05-08 10:15"
    },
    {
      demand_id: "demand_climb_003",
      user_id: "user_118",
      poi_id: "poi_033",
      activity_type: "攀岩搭子",
      target_time: "周末 09:30",
      budget_min: 60,
      budget_max: 100,
      social_style: "低压力社交",
      group_size: "1v1",
      note: "第一次攀岩，求新手友好搭子。",
      status: "waiting",
      created_at: "2026-05-08 08:40"
    },
    {
      demand_id: "demand_ride_002",
      user_id: "user_122",
      poi_id: "poi_035",
      activity_type: "骑行搭子",
      target_time: "今晚 21:00",
      budget_min: 35,
      budget_max: 65,
      social_style: "认识新朋友",
      group_size: "小组",
      note: "夜骑 8km，有头盔即可。",
      status: "waiting",
      created_at: "2026-05-08 19:30"
    },
    {
      demand_id: "demand_ride_003",
      user_id: "user_127",
      poi_id: "poi_036",
      activity_type: "骑行搭子",
      target_time: "周日 08:00",
      budget_min: 70,
      budget_max: 120,
      social_style: "轻松聊天",
      group_size: "小组",
      note: "郊野 25km，均速 18 左右。",
      status: "waiting",
      created_at: "2026-05-08 07:20"
    },
    {
      demand_id: "demand_trpg_002",
      user_id: "user_053",
      poi_id: "poi_040",
      activity_type: "跑团搭子",
      target_time: "周日 14:00",
      budget_min: 80,
      budget_max: 150,
      social_style: "多人热闹",
      group_size: "小组",
      note: "剧本杀式长团，接受新手。",
      status: "waiting",
      created_at: "2026-05-08 13:00"
    },
    {
      demand_id: "demand_rpg_001",
      user_id: "user_131",
      poi_id: "poi_038",
      activity_type: "RPG桌游搭子",
      target_time: "周五 19:30",
      budget_min: 50,
      budget_max: 100,
      social_style: "低压力社交",
      group_size: "小组",
      note: "DND 模组已备好，缺 1 位玩家。",
      status: "waiting",
      created_at: "2026-05-08 17:45"
    },
    {
      demand_id: "demand_rpg_002",
      user_id: "user_135",
      poi_id: "poi_041",
      activity_type: "RPG桌游搭子",
      target_time: "周六 16:00",
      budget_min: 55,
      budget_max: 95,
      social_style: "轻松聊天",
      group_size: "小组",
      note: "美式 RPG 新手局，主持人可带。",
      status: "waiting",
      created_at: "2026-05-08 15:10"
    },
    {
      demand_id: "demand_board_002",
      user_id: "user_054",
      poi_id: "poi_042",
      activity_type: "聚会桌游搭子",
      target_time: "周末 17:00",
      budget_min: 30,
      budget_max: 60,
      social_style: "轻松聊天",
      group_size: "小组",
      note: "卡牌局，2-4 人，畅玩票已买。",
      status: "waiting",
      created_at: "2026-05-08 16:20"
    },
    {
      demand_id: "demand_board_003",
      user_id: "user_140",
      poi_id: "poi_008",
      activity_type: "聚会桌游搭子",
      target_time: "今晚 19:30",
      budget_min: 40,
      budget_max: 75,
      social_style: "多人热闹",
      group_size: "小组",
      note: "桌游吧破冰局，欢迎新手。",
      status: "waiting",
      created_at: "2026-05-08 18:30"
    }
  );
  buddyDemands.splice(95);

  const matchPlans = [
    ["match_001", "user_027", "poi_001", "poi_002", 89, "今晚 18:30", "你们都想今晚吃韩餐，预算都在 $20 左右，并且都选择轻松聊天模式。"],
    ["match_002", "user_018", "poi_005", "poi_022", 91, "今晚 20:00", "你们都想唱歌，偏好多人热闹，预算和距离匹配。"],
    ["match_003", "user_042", "poi_017", "poi_004", 88, "周末 15:30", "你们都偏好咖啡和安静学习，适合低压力见面。"],
    ["match_004", "user_031", "poi_007", "poi_029", 87, "今晚 22:30", "你们都想吃夜宵烧烤，预算较低且可接受小组局。"],
    ["match_005", "user_112", "poi_003", "poi_012", 86, "今晚 19:00", "火锅拼桌需求匹配，适合多人热闹。"],
    ["match_006", "user_118", "poi_006", "poi_024", 85, "今晚 21:00", "酒吧小酌需求和社交风格匹配。"],
    ["match_007", "user_122", "poi_008", "poi_028", 84, "周末 16:00", "桌游破冰小组局匹配。"],
    ["match_008", "user_127", "poi_018", "poi_009", 83, "周末 15:00", "甜品探店和拍照兴趣匹配。"],
    ["match_009", "user_051", "poi_031", "poi_033", 88, "周末 10:30", "抱石新手局，预算与时段匹配。"],
    ["match_010", "user_052", "poi_034", "poi_035", 86, "周末 15:00", "休闲骑行路线与社交风格匹配。"],
    ["match_011", "user_053", "poi_037", "poi_040", 90, "周六 19:00", "跑团小组局，偏好 TRPG 一致。"],
    ["match_012", "user_054", "poi_039", "poi_042", 85, "今晚 20:00", "聚会桌游破冰局匹配。"]
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

  const deals = pois
    .filter((p, index) => ["攀岩", "骑行", "桌游"].includes(p.category) || index % 2 === 0)
    .map((poi, index) => ({
    deal_id: `deal_${String(index + 1).padStart(3, "0")}`,
    poi_id: poi.poi_id,
    deal_type: poi.category === "KTV" ? "多人套餐" : poi.category === "酒吧" ? "饮品券" : poi.category === "攀岩" || poi.category === "骑行" ? "体验券" : poi.category === "桌游" ? "畅玩券" : "双人套餐",
    title: poi.deal_text,
    original_price: Math.round(poi.avg_price * (poi.category === "KTV" ? 4.2 : 2.4)),
    discount_price: Math.round(poi.avg_price * (poi.category === "KTV" ? 3.2 : 1.9)),
    suitable_group_size: poi.category === "KTV" || poi.category === "桌游" || poi.category === "攀岩" ? "3-4人" : poi.category === "骑行" ? "2-6人" : "2人",
    valid_time: index % 3 === 0 ? "今晚可用" : "本周可用",
    conversion_cta: poi.category === "KTV" ? "购买欢唱券" : poi.category === "攀岩" || poi.category === "骑行" ? "购买体验券" : poi.category === "桌游" ? "购买畅玩券" : "购买团购券"
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

  const circleWeather = {
    temp: 22,
    label: "微风",
    tip: "适合出门走走，店里普遍不用排队太久"
  };

  return {
    area,
    areaShort,
    brand,
    circleWeather,
    lifeCircles,
    scenes,
    sceneGroups,
    sceneCatalog,
    sceneIntentSamples,
    MAP_LAYOUT,
    mapCenter: MAP_CENTER,
    pois,
    users,
    currentUser,
    backgroundUsers,
    buddyDemands,
    matchPlans,
    chatThreads,
    deals,
    replanningEvents,
    sparseSupply
  };
})();

window.mockData = mockData;
