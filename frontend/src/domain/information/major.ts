export type MajorCategoryId =
  | "computing"
  | "business"
  | "science"
  | "social-science"
  | "arts"
  | "health"
  | "engineering";

export interface MajorAdjacentProfile {
  slug: string;
  nameZh: string;
  difference: string;
}

export interface MajorDefinition {
  slug: string;
  nameZh: string;
  nameEn: string;
  category: MajorCategoryId;
  aliases: readonly string[];
  summary: string;
  boundary: string;
  adjacent: readonly MajorAdjacentProfile[];
}

export const MAJOR_CATEGORIES: Record<MajorCategoryId, string> = {
  computing: "计算与数据",
  business: "商科与应用社会科学",
  science: "自然科学与数学",
  "social-science": "社会科学与公共政策",
  arts: "艺术与设计",
  health: "健康与生命科学",
  engineering: "工程",
};

const MAJOR_DEFINITIONS: readonly MajorDefinition[] = [
  {
    slug: "computer-science",
    nameZh: "计算机科学",
    nameEn: "Computer Science",
    category: "computing",
    aliases: ["Computer Science", "Computer and Information Sciences, General", "Computer and Information Science"],
    summary: "研究算法、计算系统、软件工程与数学化建模，是技术方向中通用性最强的本科基础之一。",
    boundary: "本档案指大学系科意义上的 Computer Science，关注理论、算法、系统和软件；不等同于职业编程培训，也不把所有会写代码的方向都归入 CS。",
    adjacent: [
      { slug: "computer-engineering", nameZh: "计算机工程", difference: "计算机工程更强调硬件、嵌入式系统、数字电路与软硬件交界；CS 更偏算法、软件与计算理论。" },
      { slug: "data-science", nameZh: "数据科学", difference: "数据科学以统计推断、数据处理和业务建模为核心；CS 提供实现工具，但不是所有 CS 课程都深入统计建模。" },
    ],
  },
  {
    slug: "data-science",
    nameZh: "数据科学",
    nameEn: "Data Science",
    category: "computing",
    aliases: ["Data Science", "Analytics", "Data Analytics"],
    summary: "结合统计、计算与领域问题，训练数据清洗、建模、解释与决策支持能力。",
    boundary: "本档案收录明确命名为 Data Science / Analytics 的项目。商业分析、金融分析与运筹项目可能有交集，但未在无来源依据时合并进来。",
    adjacent: [
      { slug: "computer-science", nameZh: "计算机科学", difference: "CS 的主干是计算系统与算法；数据科学的主干是统计推断、数据管线和模型解释。" },
      { slug: "economics", nameZh: "经济学", difference: "经济学关注机制、因果与市场行为；数据科学关注从数据到预测和决策的工程化流程。" },
    ],
  },
  {
    slug: "economics",
    nameZh: "经济学",
    nameEn: "Economics",
    category: "social-science",
    aliases: ["Economics", "Economics, General", "Econometrics and Quantitative Economics"],
    summary: "研究资源配置、市场机制、因果推断与量化分析，兼具社会科学理论与数理训练。",
    boundary: "本档案包含经济学与计量/量化经济学。商业经济学、农业经济学等更专门方向若未被学校标记为经济学主项目，不自动并入。",
    adjacent: [
      { slug: "finance", nameZh: "金融", difference: "金融更贴近资本市场、公司金融、投资与风险管理；经济学更偏机制、政策和因果解释。" },
      { slug: "data-science", nameZh: "数据科学", difference: "数据科学以通用数据管线与预测建模为主；经济学强调经济模型、识别策略与理论假设。" },
    ],
  },
  {
    slug: "finance",
    nameZh: "金融",
    nameEn: "Finance",
    category: "social-science",
    aliases: ["Finance", "Finance, General"],
    summary: "围绕估值、投资、公司金融、风险与金融市场运行展开，是就业导向较强的商科方向。",
    boundary: "本档案只对应 Finance / Finance, General 标签。金融工程、定量金融和房地产金融属于更专门项目，不能无来源合并。",
    adjacent: [
      { slug: "economics", nameZh: "经济学", difference: "经济学解释市场与政策机制；金融聚焦资金定价、投资决策与金融机构实践。" },
      { slug: "business-administration", nameZh: "工商管理", difference: "工商管理覆盖组织、运营、营销等企业管理面；金融更集中在资本市场与资金管理。" },
    ],
  },
  {
    slug: "business-administration",
    nameZh: "工商管理",
    nameEn: "Business Administration",
    category: "business",
    aliases: ["Business Administration and Management, General", "Business Administration", "Business/Commerce, General", "Commerce", "Management"],
    summary: "学习组织管理、战略、运营、营销与领导力，适合作为跨职能商业基础。",
    boundary: "本档案指 General Business Administration / Management，不把会计、市场营销、供应链等专门主修自动并入。",
    adjacent: [
      { slug: "finance", nameZh: "金融", difference: "金融是专业化资金与投资方向；工商管理是更宽的企业管理基础。" },
      { slug: "economics", nameZh: "经济学", difference: "经济学偏理论和公共机制分析；工商管理偏组织决策与商业执行。" },
    ],
  },
  {
    slug: "biology",
    nameZh: "生物科学",
    nameEn: "Biology / Biological Sciences",
    category: "arts",
    aliases: ["Biology/Biological Sciences, General", "Biology", "Human Biology", "Cell/Cellular and Molecular Biology"],
    summary: "从分子、细胞、生理到生态层面理解生命系统，是医学、科研与生物技术路线的基础。",
    boundary: "本档案包含普通生物、人类生物与细胞/分子生物标签。神经科学、公共卫生和解剖学属于相邻但独立方向。",
    adjacent: [
      { slug: "psychology", nameZh: "心理学", difference: "心理学研究行为与认知过程；生物科学以生命系统的结构与机制为核心。" },
      { slug: "biomedical-engineering", nameZh: "生物医学工程", difference: "生医工程用工程方法解决医疗设备、生物材料与系统问题；生物科学更偏生命现象本身。" },
    ],
  },
  {
    slug: "psychology",
    nameZh: "心理学",
    nameEn: "Psychology",
    category: "science",
    aliases: ["Psychology, General", "Psychology", "Experimental Psychology", "Research and Experimental Psychology, Other"],
    summary: "研究认知、情绪、行为、发展与社会互动，兼顾科学研究与助人应用场景。",
    boundary: "本档案包含普通心理学与实验/研究心理学。神经科学更偏生物基础，咨询与社会工作属于职业路径，不自动并入。",
    adjacent: [
      { slug: "biology", nameZh: "生物科学", difference: "生物科学聚焦生命系统；心理学聚焦行为、认知与环境互动。" },
      { slug: "data-science", nameZh: "数据科学", difference: "实验心理学会使用统计方法，但学科问题仍以人类行为为核心，不是通用数据科学项目。" },
    ],
  },
  {
    slug: "nursing",
    nameZh: "护理",
    nameEn: "Nursing",
    category: "health",
    aliases: ["Registered Nursing/Registered Nurse", "Undergraduate Nursing Programs"],
    summary: "以临床护理、健康评估、循证实践与病人照护为核心，通常与执照路径和临床训练强相关。",
    boundary: "本档案仅对应注册护理 / 护理项目。公共卫生、健康管理与运动科学不能自动视为护理。",
    adjacent: [
      { slug: "biology", nameZh: "生物科学", difference: "生物科学偏基础生命机制；护理直接面向临床照护、执业能力与病人安全。" },
      { slug: "psychology", nameZh: "心理学", difference: "心理学关注行为与认知；护理以照护流程、临床判断与健康结果为中心。" },
    ],
  },
  {
    slug: "mechanical-engineering",
    nameZh: "机械工程",
    nameEn: "Mechanical Engineering",
    category: "engineering",
    aliases: ["Mechanical Engineering"],
    summary: "研究力学、热流体、机械设计、制造与机电系统，是覆盖面最宽的工程基础之一。",
    boundary: "本档案仅对应 Mechanical Engineering 标签。航空航天、材料与工业工程属于独立专业边界。",
    adjacent: [
      { slug: "biomedical-engineering", nameZh: "生物医学工程", difference: "机械工程面向广义机械与能量系统；生医工程把工程方法应用到医疗器械与生理系统。" },
      { slug: "electrical-engineering", nameZh: "电子工程", difference: "机械工程处理力、运动与热流；电子工程处理信号、电路、电能与信息系统。" },
    ],
  },
  {
    slug: "electrical-engineering",
    nameZh: "电子工程",
    nameEn: "Electrical Engineering",
    category: "engineering",
    aliases: ["Electrical Engineering", "Electrical and Electronics Engineering"],
    summary: "研究电路、信号、电子器件、电能系统、通信与控制系统。",
    boundary: "本档案对应 Electrical Engineering / Electrical and Electronics Engineering。Electrical and Computer Engineering 因同时覆盖计算机工程，未在无项目级来源时直接并入。",
    adjacent: [
      { slug: "computer-engineering", nameZh: "计算机工程", difference: "电子工程覆盖更宽的电气与电子系统；计算机工程聚焦计算机体系结构、嵌入式与软硬件接口。" },
      { slug: "mechanical-engineering", nameZh: "机械工程", difference: "两者都做系统设计，但机械以力和热流为主，电子以电荷、信号与能量转换为主。" },
    ],
  },
  {
    slug: "computer-engineering",
    nameZh: "计算机工程",
    nameEn: "Computer Engineering",
    category: "engineering",
    aliases: ["Computer Engineering", "Computer Engineering, General"],
    summary: "介于计算机科学与电子工程之间，关注计算机体系结构、嵌入式系统、硬件软件协同与数字系统。",
    boundary: "本档案仅对应 Computer Engineering 标签。Electrical and Computer Engineering 需要项目级课程来源后再判断归属。",
    adjacent: [
      { slug: "computer-science", nameZh: "计算机科学", difference: "计算机科学偏算法与软件系统；计算机工程偏处理器、嵌入式与硬件实现。" },
      { slug: "electrical-engineering", nameZh: "电子工程", difference: "电子工程覆盖更广的电气系统；计算机工程更聚焦计算机硬件与软硬件边界。" },
    ],
  },
  {
    slug: "biomedical-engineering",
    nameZh: "生物医学工程",
    nameEn: "Biomedical Engineering",
    category: "engineering",
    aliases: ["Biomedical Engineering", "Bioengineering and Biomedical Engineering", "Bioengineering Concentration"],
    summary: "将工程分析、设计与制造方法应用于医疗器械、生物材料、成像与生理系统建模。",
    boundary: "本档案对应 Biomedical Engineering / Bioengineering。普通生物、神经科学和公共卫生不是生医工程。",
    adjacent: [
      { slug: "biology", nameZh: "生物科学", difference: "生物科学解释生命机制；生医工程设计解决医疗问题的工程系统。" },
      { slug: "mechanical-engineering", nameZh: "机械工程", difference: "机械工程面向通用机械系统；生医工程面向医疗设备、生物相容性与生理约束。" },
    ],
  },
  {
    slug: "engineering",
    nameZh: "工程",
    nameEn: "Engineering",
    category: "engineering",
    aliases: [
      "Engineering",
      "Engineering, Other",
      "Engineering Science",
      "Undergraduate Engineering Programs (No Doctorate)",
    ],
    summary: "以数学、物理与系统方法解决设计、制造、能源、结构与产品工程问题。",
    boundary: "本档案是工程总入口，仅收录学校明确标记的通用工程项目；机械、电子、计算机、生医等具体方向保留独立档案，不在无课程来源时合并。",
    adjacent: [
      { slug: "computer-science", nameZh: "计算机科学", difference: "工程强调物理系统与设计流程；CS 更偏算法、软件与计算理论。" },
      { slug: "mathematics", nameZh: "数学", difference: "数学提供抽象结构与证明工具；工程把这些工具用于约束、制造和系统实现。" },
    ],
  },
  {
    slug: "mathematics",
    nameZh: "数学",
    nameEn: "Mathematics",
    category: "science",
    aliases: ["Mathematics", "Mathematics, General", "Applied Mathematics", "Applied Mathematics, General", "Statistics, General"],
    summary: "训练证明、分析、代数、概率与建模能力，是量化科学、工程与数据方向的共同基础。",
    boundary: "本档案收录 Mathematics / Applied Mathematics / Statistics 标签。数据科学、金融工程和精算属于应用方向，不能无课程来源直接并入数学。",
    adjacent: [
      { slug: "data-science", nameZh: "数据科学", difference: "数学关注结构与普适证明；数据科学关注数据采集、建模流程与决策解释。" },
      { slug: "computer-science", nameZh: "计算机科学", difference: "数学提供离散与连续抽象；CS 关注算法实现、系统与软件工程。" },
    ],
  },
  {
    slug: "chemistry",
    nameZh: "化学",
    nameEn: "Chemistry",
    category: "science",
    aliases: ["Chemistry", "Chemistry, General"],
    summary: "研究物质组成、反应机理、分子结构与实验分析，是药学、材料与生命科学的基础。",
    boundary: "本档案仅对应 Chemistry / Chemistry, General。化学工程、生物化学和材料科学属于相邻但独立方向。",
    adjacent: [
      { slug: "biology", nameZh: "生物科学", difference: "化学聚焦分子与反应；生物科学聚焦细胞、生命系统与演化机制。" },
      { slug: "engineering", nameZh: "工程", difference: "化学强调分子机理与实验；工程把成果扩展为流程、装置与产品。" },
    ],
  },
  {
    slug: "political-science",
    nameZh: "政治学",
    nameEn: "Political Science",
    category: "business",
    aliases: ["Political Science", "Political Science and Government, General", "International Relations and Affairs", "Public Policy Analysis, General"],
    summary: "研究权力、制度、政策、国际关系与政治行为，训练论证与实证分析能力。",
    boundary: "本档案包含 Political Science 及明确的政治 / 公共政策标签。国际关系与公共政策虽常设于相邻院系，仅在公开标签支持时合并；社会学与经济学保持独立。",
    adjacent: [
      { slug: "economics", nameZh: "经济学", difference: "经济学分析资源配置与激励；政治学关注权力、制度与公共政策过程。" },
      { slug: "communications", nameZh: "传播学", difference: "传播学研究信息与舆论形成；政治学研究权力、治理与政治行为。" },
    ],
  },
  {
    slug: "communications",
    nameZh: "传播学",
    nameEn: "Communications",
    category: "business",
    aliases: ["Communication", "Communication, General", "Communications", "Digital Communication and Media/Multimedia", "Speech Communication and Rhetoric", "Radio and Television", "Public Relations, Advertising, and Applied Communication"],
    summary: "研究信息生产、媒介效果、公共表达、舆论与数字内容传播。",
    boundary: "本档案包含 Communication / Digital Communication / Speech Communication 等明确传播标签。新闻、公关、广告和电影制作属于相关方向，只有在学校标签明确时才关联。",
    adjacent: [
      { slug: "political-science", nameZh: "政治学", difference: "传播学关注信息与媒介机制；政治学关注制度、权力和政策。" },
      { slug: "art-and-design", nameZh: "艺术与设计", difference: "传播学关注信息与受众；艺术与设计更强调视觉语言、创作与作品集。" },
    ],
  },
  {
    slug: "art-and-design",
    nameZh: "艺术与设计",
    nameEn: "Art and Design",
    category: "science",
    aliases: ["Art", "Design", "Visual and Performing Arts", "Fine Arts", "Studio Arts", "Graphic Design"],
    summary: "围绕视觉语言、studio 创作、作品集、媒介实验与设计问题解决展开。",
    boundary: "本档案是艺术与设计入口，包含明确 Art / Design / Visual Arts / Studio Arts 标签。艺术史、建筑、戏剧和音乐属于相邻方向，无项目来源不自动合并。",
    adjacent: [
      { slug: "communications", nameZh: "传播学", difference: "艺术与设计强调视觉表达与作品集；传播学强调信息、受众与媒介效果。" },
      { slug: "psychology", nameZh: "心理学", difference: "艺术与设计关注创作与视觉语言；心理学研究感知、行为与认知机制。" },
    ],
  },
];

const CORE_MAJOR_SLUGS = [
  "computer-science",
  "engineering",
  "business-administration",
  "economics",
  "mathematics",
  "data-science",
  "biology",
  "chemistry",
  "psychology",
  "political-science",
  "communications",
  "art-and-design",
] as const;

export const MAJOR_PROFILES: readonly MajorDefinition[] = [
  ...CORE_MAJOR_SLUGS.map((slug) =>
    MAJOR_DEFINITIONS.find((major) => major.slug === slug)!,
  ),
  ...MAJOR_DEFINITIONS.filter((major) =>
    !(CORE_MAJOR_SLUGS as readonly string[]).includes(major.slug),
  ),
];

export const MAJOR_SLUGS: readonly string[] = MAJOR_PROFILES.map((major) => major.slug);

export function findMajorDefinition(slug: string): MajorDefinition | null {
  const wanted = slug.trim().toLowerCase();
  return MAJOR_PROFILES.find((major) => major.slug === wanted) ?? null;
}

export function majorDefinitionBySlug(slug: string): MajorDefinition {
  const found = findMajorDefinition(slug);
  if (!found) throw new Error("UNKNOWN_MAJOR_SLUG:" + slug);
  return found;
}
