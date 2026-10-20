# PathOS 企业级信息集合平台规划书

版本：2.0
日期：2026-10-15
执行分支：`codex/target-mode`
工作目录：`D:\pathOS\frontend`
文档性质：战略、产品、数据、工程、运营与 AI Agent 执行一体化规划书

---

## 0. 一页结论

PathOS 暂停付费优先路线，转型为**企业级留学信息集合与决策平台**。

目标不是做一个留学资讯网站，也不是继续堆叠零散工具，而是建立一条可持续运转的信息生产链：

```text
可信来源
  -> 抓取与解析
  -> 字段标准化
  -> 校验与去重
  -> 人工审核
  -> 事实库
  -> 学校 / 专业 / 成本 / 截止日 / 变化事件
  -> 搜索、对比、清单、报告
```

### 0.1 产品定位

> PathOS 把学校、专业、录取、成本、政策、截止日期、奖学金和机会动态全部结构化，让中国留学家庭可以搜索、比较、追踪和生成可追溯的决策报告。

一句话差异化：

> 别人给文章，PathOS 给可验证的事实、变化提醒和决策工具。

### 0.2 核心判断

当前 PathOS 的短板不是页面数量，而是信息生产系统。

现有资产已经包括：

- 62 所美本院校详情
- 904 条已验证记录
- 留学地图
- 学校详情页
- 搜索与筛选
- 对比
- 费用与 GPA 计算
- AI 评估与清单分析
- 选校清单
- 报告分享
- 登录、组织、顾问、学生关系
- 简易埋点与线索 CRM

但数据层仍是静态 Preview 为主：

- `news = 0`
- `regionMetrics = 0`
- 变化事件没有持续生产
- 各功能之间尚未共享一个标准化事实层
- 数据覆盖率与新鲜度不可系统度量

因此下一阶段的核心投资是：**事实层、来源层、审核层、变化层和覆盖率治理**。

### 0.3 阶段目标

| 阶段 | 时间 | 目标 | 结果 |
|---|---:|---|---|
| Phase 0 | 第 1-2 周 | 保护基线 | 冻结商业优先入口，固化测试基线与路由责任 |
| Phase 1 | 第 3-6 周 | 20 所可信学校 | 事实库、来源库、审核台、学校页 2.0 |
| Phase 2 | 第 7-10 周 | 62 所全量体验 | 专业、成本、截止日、信息流、覆盖率 |
| Phase 3 | 第 11-14 周 | 决策闭环 | 对比 2.0、清单、报告、个人工作台 |
| Phase 4 | 第 15-20 周 | 规模与增长 | Top 100、答案卡、SEO、周更运营 |

第一阶段不追求大而全。第一个可信里程碑是：

> 20 所学校、12 个优先字段、每个公开数字有来源、至少 10 条已审核变化事件、可对比、可算成本、可看截止日、可度量覆盖率。

### 0.4 企业级原则

1. **可信优先**：无来源不发布，无审核不公开，无年份不比较。
2. **缺失透明**：缺数据必须显示缺失，不能伪装成 0 或未知。
3. **事实复用**：所有功能读同一个事实层，禁止各自维护私有数据副本。
4. **历史可追溯**：事实修正必须保留修订历史。
5. **运营可持续**：平台必须能日抓取、周审核、月审计。
6. **体验一致**：继续沿用老版 PathOS UI 与设计 token，不做视觉大换血。
7. **商业冻结**：暂不做支付、付费墙、订阅和销售转化，但保留已有能力。
8. **Agent 可执行**：每个工作包必须有范围、任务、文件、测试和验收标准。

---

## 1. 文档定位与使用方式

### 1.1 文档关系

本文档是信息集合平台阶段的最高执行规划。若与旧 V2 文档冲突，以本文档为准。

旧文档仍可提供背景：

- `v2/V2-PRODUCT-STRATEGY.md`：旧商业与产品战略
- `v2/V2-IMPLEMENTATION-SPEC.md`：旧执行细节
- `v2/V2-EXEC-SPEC.md`：旧模块规范
- `v2/V2-UI-SPEC.md`：仅作参考，不引入现有页面

当前代码库仍是实现风格的真实权威。执行前必须先读相关文件，不得凭旧文档假设代码结构。

### 1.2 Agent 读取顺序

每次接手任务时按以下顺序阅读：

1. 本文档对应工作包
2. `src/domain/dataset.ts`
3. `src/services/pathos-data-source.ts`
4. `src/server/pathos-preview.ts`
5. `db/schema.sql`
6. 目标页面或 API 的现有实现
7. 相关测试文件

### 1.3 不可破坏约束

1. 不动 `main` 分支。
2. 只在 `codex/target-mode` 开发。
3. 不使用 `git add .`，必须精确添加文件。
4. 不使用 `git reset --hard` 或 `git checkout --`。
5. 不删除 P0/P1 已交付能力：
   - Magic Link
   - 组织 / 顾问 / 学生
   - 选校清单
   - 报告版本与撤销
   - CRM
   - 埋点
6. UI 必须沿用老版 PathOS 设计语言：
   - `h-control`
   - `rounded-control`
   - `text-text-primary`
   - `text-text-secondary`
   - `text-text-muted`
   - `border-border-soft`
   - `bg-surface-1`
   - `bg-surface-muted`
   - `text-cobalt`
   - `ring-focus-ring`
7. 不引入 V2 文档中的另一套 UI 规范。
8. 不伪造数据。
9. 不把社区内容当事实发布。
10. 不绕过网站认证、付费墙、验证码或访问限制。

---

## 2. 现状与企业级资产盘点

### 2.1 产品资产

| 能力 | 当前状态 | 企业级价值 | 下一步 |
|---|---|---|---|
| 留学地图 | 已上线 | 探索入口 | 保持，并接入更完整事实 |
| 学校详情 | 62 所 Preview | 学校档案基础 | 升级为事实驱动 |
| 搜索 | 已有 | 信息检索入口 | 升级全局搜索 |
| 对比 | 已有 | 决策核心 | 升级为跨域事实对比 |
| 计算器 | 费用 / GPA / ROI | 决策工具 | 接入成本事实层 |
| AI 评估 | 已有 | 顾问效率工具 | 只引用可验证事实 |
| 选校清单 | 已有 | 用户留存 | 接入截止日和变化提醒 |
| 报告 | 已有版本与分享 | 专业输出 | 引用事实版本 |
| 机会动态 | 页面已有 | 变化入口 | 由信息事件驱动 |
| 登录与组织 | 已有 | 协作基础 | 保持 |
| CRM | 已有 | 后台资产 | 暂停增强 |
| 埋点 | 已有 | 行为度量 | 服务新 KPI |

### 2.2 数据资产

当前 Preview 数据：

- `universities: 62`
- `university details: 62`
- 已验证记录：约 904 条
- `news: 0`
- `regionMetrics: 0`

数据库已有：

- `universities`
- `university_details`
- `news_articles`
- `region_envelope`
- P0/P1 的商业、认证、组织、报告、清单、埋点表

已有类型与契约：

- `PathOSDataSource`
- `UniversitySummary`
- `UniversityDetail`
- `SourceReference`
- `ProvenanceStatus`
- `DisplayTier`

### 2.3 主要缺口

| 缺口 | 影响 | 解决方案 |
|---|---|---|
| 无统一事实表 | 各功能数据口径不一致 | 建 `facts` 与 `fact_revisions` |
| 无来源注册表 | 抓取不可控 | 建 `sources` 与 `source_documents` |
| 无审核流程 | 公开数据风险高 | 建 `review_tasks` 与审核台 |
| 无变化检测 | 信息流为空 | 建标准 diff 与 `information_events` |
| 无覆盖率治理 | 不知道下一步补什么 | 建覆盖率矩阵和 dashboard |
| 专业数据弱 | 无法回答专业问题 | 建专业与项目档案 |
| 截止日缺失 | 无法行动 | 建标准 deadline 模型 |
| 成本口径弱 | 预算不可靠 | 拆分成本项并保留年份 |
| 测试基线有旧失败 | 回归不可见 | 固化基线并逐步清零 |

### 2.4 当前质量基线

已知最近完整测试结果为：

```text
Test Files: 6 failed / 24 passed
Tests:      33 failed / 662 passed
```

这是 Phase 0 前的已知基线。执行信息平台工作前必须重新运行并确认：

```powershell
npx vitest run
```

规则：

1. 不允许新增失败。
2. 未触碰的旧失败可以暂存。
3. 每个 phase 报告必须区分新问题和历史问题。
4. Phase 4 前应制定旧测试清零计划。

---

## 3. 战略层

### 3.1 使命

为留学家庭和顾问建立一个可信、透明、可持续更新的留学决策信息底座。

### 3.2 愿景

三年内成为中文留学场景中：

1. 数据结构最完整的学校与专业信息库
2. 来源最透明的留学决策平台
3. 顾问最愿意使用的选校与报告工具
4. 变化追踪能力最强的信息流系统

### 3.3 战略取舍

#### 做

- 做结构化事实
- 做来源追溯
- 做专业级对比
- 做变化检测
- 做申请行动清单
- 做顾问可复用报告
- 做覆盖率治理

#### 暂停

- 支付
- 订阅
- 付费墙
- 销售漏斗
- 大规模营销
- 多国家扩张
- 无来源 AI 内容生成

#### 永远不做

- 编造录取率、学费或截止日期
- 把社区传言包装成事实
- 混淆不同年份和适用人群
- 为页面好看而隐藏数据缺口

### 3.4 竞争定位

| 类型 | 常见弱点 | PathOS 机会 |
|---|---|---|
| 留学资讯媒体 | 内容分散、无法比较、更新慢 | 结构化事实与工具 |
| 学校官网 | 权威但分散、英文门槛高 | 聚合、翻译、标准化 |
| 排名站 | 指标单一、商业影响明显 | 多维数据与来源透明 |
| 留学中介 | 口径不透明、个案化 | 可追溯决策报告 |
| AI 聊天产品 | 易幻觉、无版本控制 | 事实库 + 审核链 |
| 选校工具 | 字段浅、无法解释 | 事实层 + 对比 + 报告 |

### 3.5 核心护城河

1. **事实库**：越用越完整的数据资产。
2. **来源治理**：公开数据可信、可追溯。
3. **变更历史**：知道学校政策如何变化。
4. **决策工具链**：从查信息到生成报告。
5. **顾问工作流**：报告和清单可复用。
6. **覆盖率系统**：持续知道缺什么、先补什么。

---

## 4. 用户与场景

### 4.1 目标用户

| 用户 | 核心诉求 | PathOS 提供价值 | 付费优先级 |
|---|---|---|---|
| 高中生 / 本科申请者 | 找到适合学校与专业 | 学校页、专业页、对比、清单 | 暂不付费 |
| 研究生申请者 | 明确项目要求和截止日 | 项目、先修课、考试、deadline | 暂不付费 |
| 家长 | 看懂成本、安全、录取概率 | 成本中心、地图、报告 | 暂不付费 |
| 顾问 / 老师 | 快速出严谨方案 | 对比、报告、清单、来源 | 后续 B 端 |
| 内容运营 | 持续更新数据 | 审核台、覆盖率、任务队列 | 内部 |
| 数据运营 | 保证来源可信 | 来源注册、抓取日志、冲突队列 | 内部 |

### 4.2 用户旅程

```text
发现问题
  -> 搜索学校 / 专业 / 问题
  -> 查看结构化档案
  -> 对比 2-5 个选项
  -> 计算成本与录取可能性
  -> 加入选校清单
  -> 跟踪 deadline 和政策变化
  -> 生成报告
  -> 持续复核与调整
```

### 4.3 关键场景

#### 场景 A：查一个学校

用户输入 `Carnegie Mellon University`。

PathOS 应返回：

1. 学校身份与地点
2. 录取率、标化区间、测试政策
3. 学费、生活费、预估总成本
4. CS、工程、商科等专业强弱
5. 毕业率、保留率、就业表现
6. 申请轮次和截止日期
7. 最近政策或项目变化
8. 每个数字的来源和年份

#### 场景 B：比较两个专业

用户输入 `UMich CS vs UIUC CS`。

PathOS 应返回：

1. 专业定位差异
2. 学校综合差异
3. 录取难度差异
4. 课程与方向差异
5. 成本差异
6. 就业与薪资差异
7. deadline 差异
8. 适合人群

#### 场景 C：估算家庭预算

用户选择学校、住宿方式、学制年限和汇率假设。

PathOS 应输出：

1. 官方直接成本
2. 地区生活成本
3. 四年或两年总成本区间
4. 奖学金可能性
5. 假设项和官方数据项分区展示

#### 场景 D：顾问生成报告

顾问选择学生清单。

PathOS 应输出：

1. 冲刺 / 匹配 / 保底结构
2. 每所学校关键事实
3. 风险与待核实问题
4. 成本对比
5. deadline 计划
6. 报告生成时使用的事实版本

---

## 5. 产品蓝图

### 5.1 产品结构

```text
PathOS 信息集合平台
├── 信息发现
│   ├── 首页信息台
│   ├── 全局搜索
│   ├── 信息流
│   ├── 机会动态
│   └── 答案卡
├── 信息档案
│   ├── 学校档案
│   ├── 专业档案
│   ├── 项目档案
│   ├── 地区档案
│   └── 奖学金档案
├── 决策工具
│   ├── 对比 2.0
│   ├── 成本中心
│   ├── 录取评估
│   ├── 申请日历
│   └── 选校清单
├── 输出协作
│   ├── 决策报告
│   ├── 顾问工作台
│   ├── 组织与邀请
│   └── 分享与撤销
└── 数据运营
    ├── 来源注册
    ├── 审核台
    ├── 冲突队列
    ├── 覆盖率 dashboard
    └── 抓取日志
```

### 5.2 首页信息台

首页不是营销页，而是信息入口。

必须包含：

1. 本周重要变化
2. 即将到来的 deadline
3. 热门学校入口
4. 热门专业入口
5. 成本与录取洞察
6. 对比与计算器入口
7. 数据覆盖率和更新时间
8. 来源标准说明

首页不应：

- 复制完整学校列表
- 复制完整地图
- 展示无来源的推荐
- 以付费转化为主 CTA

### 5.3 学校档案页

统一信息顺序：

1. 身份与地点
2. 录取现实
3. 成本与资助
4. 专业与项目
5. 学习成果
6. 申请截止日
7. 地理与生活
8. 最近变化
9. 来源与数据质量

展示规则：

- 每个事实可点开来源
- 显示适用年份
- 显示适用人群
- 显示审核状态
- 缺失字段显示原因
- 不同年份不得直接混排

### 5.4 专业档案页

首批 12 个专业：

1. Computer Science
2. Engineering
3. Business
4. Economics
5. Mathematics
6. Data Science
7. Biology
8. Chemistry
9. Psychology
10. Political Science
11. Communications
12. Art and Design

页面结构：

1. 专业定义与边界
2. 典型学位
3. 代表学校
4. 课程结构
5. 申请要求
6. 就业方向
7. 薪资与成果
8. 适合人群
9. 与相近专业差异

### 5.5 对比 2.0

预设视角：

| 视角 | 字段 |
|---|---|
| 录取 | 录取率、SAT/ACT、GPA、测试政策、国际生比例 |
| 成本 | 学费、住宿、生活、保险、总成本、奖学金 |
| 专业 | 专业开设、方向、排名、课程、先修课 |
| 成果 | 毕业率、保留率、就业率、起薪 |
| 地理 | 州、城市、安全、生活成本、交通、气候 |
| 时间 | 申请轮次、deadline、材料节点 |

规则：

1. 同一行必须是同一语义字段。
2. 单位必须标准化。
3. 学年不同必须提示。
4. 缺失不得显示为 0。
5. 来源冲突必须可见。

### 5.6 成本与奖学金中心

成本拆分：

- Tuition
- Fees
- Housing
- Food
- Insurance
- Books
- Transportation
- Personal expenses

输出：

1. 官方公布成本
2. 地区估计成本
3. 一年成本
4. 多年成本预测
5. 通胀与汇率敏感性
6. 奖学金和助学金

规则：

- 官方数据与假设必须分开。
- 缺失项不得默认为 0。
- 汇率必须显示时间和来源。
- 预测必须显示假设增长率。

### 5.7 申请日历

 deadline 类型：

- 申请轮次
- 奖学金
- 财务 aid
- 材料补交
- 押金
- 宿舍
- 考试送分

个人视图：

1. 从选校清单生成
2. 按紧急程度排序
3. 区分已过期 / 本周 / 本月
4. 显示时区
5. 标记历史推断数据

### 5.8 信息流

信息流不是新闻流，而是“变化流”。

合格事件：

- 学费变化
- deadline 变化
- 标化政策变化
- 专业新增或取消
- 奖学金更新
- 项目要求变化
- 官方招生政策变化

每个事件必须包含：

1. 变了什么
2. 原值
3. 新值
4. 为什么重要
5. 谁受影响
6. 截止行动时间
7. 来源
8. 发布时间

---

## 6. 信息与数据架构

### 6.1 四层架构

```text
来源层
  官方网站、CDS、IPEDS、政府与考试机构、奖学金页面
      |
      v
事实层
  标准化字段、来源、年份、适用范围、审核状态、修订历史
      |
      v
聚合层
  学校档案、专业档案、成本模型、deadline、对比行、覆盖率
      |
      v
体验层
  搜索、地图、详情页、对比、清单、报告、信息流
```

### 6.2 来源分级

| 级别 | 来源 | 用途 | 可否直接成为事实 |
|---|---|---|---|
| A | 学校官网、官方公告 | 核心事实 | 可，需审核 |
| B | Common Data Set | 标准化数据 | 可，需审核 |
| C | IPEDS / College Scorecard / 政府统计 | 区域与结果 | 可，需审核 |
| D | US News / QS / THE | 排名维度 | 仅排名字段 |
| E | 可靠媒体 | 变化线索 | 否，需官方确认 |
| F | 社区 / 社交内容 | 研究线索 | 否 |

### 6.3 核心实体

```text
University        学校
Program           项目
Major             专业
Location          地区
AdmissionRound    申请轮次
Deadline          截止日期
CostItem          成本项
Scholarship       奖学金
Opportunity       机会
InformationEvent  信息事件
Source            来源
SourceDocument    来源文档
Fact              事实
FactRevision      事实修订
ReviewTask        审核任务
```

### 6.4 事实契约

```ts
export type FactEntityType =
  | "university"
  | "program"
  | "major"
  | "location"
  | "scholarship"
  | "opportunity";

export type FactValueType =
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "text"
  | "boolean"
  | "enum"
  | "range"
  | "list";

export type FactReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "stale";

export interface Fact {
  id: string;
  entityType: FactEntityType;
  entityId: string;
  fieldKey: string;
  valueType: FactValueType;
  valueNumber?: number | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueRange?: { min: number; max: number } | null;
  valueList?: string[];
  unit?: string | null;
  currency?: "USD" | "CNY" | null;
  academicYear?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  applicantScope?:
    | "all"
    | "international"
    | "undergraduate"
    | "graduate"
    | null;
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;
  reviewedAt: string | null;
  reviewStatus: FactReviewStatus;
  confidence: "high" | "medium" | "low";
  nullReason?: string | null;
  notes?: string | null;
}
```

### 6.5 首批优先字段

```text
admission.acceptance_rate
admission.sat_25
admission.sat_75
admission.act_25
admission.act_75
admission.gpa_average
admission.test_policy
admission.english_policy
admission.application_platform

cost.tuition
cost.fees
cost.housing
cost.food
cost.insurance
cost.books
cost.estimated_total
aid.scholarship_available

outcome.graduation_rate
outcome.retention_rate
outcome.employment_rate
outcome.median_early_career_pay

profile.enrollment_undergraduate
profile.enrollment_graduate
profile.student_faculty_ratio
profile.city
profile.state
profile.school_type
profile.degree_type

program.offered_degrees
program.application_deadline
program.fall_deadline
program.spring_deadline
program.toefl_minimum
program.ielts_minimum
program.gre_policy
```

ontology 扩张必须在以上字段覆盖率达标后进行。

### 6.6 数据管线

```text
来源注册
  -> 定时抓取
  -> 文档解析
  -> 字段标准化
  -> 规则校验
  -> 去重
  -> 与已批准事实 diff
  -> 冲突识别
  -> 审核队列
  -> 批准发布
  -> 聚合缓存
  -> API / UI
```

### 6.7 数据库设计原则

新增迁移建议为：

```text
db/migrations/008-information-platform.sql
```

新增表：

- `sources`
- `source_documents`
- `facts`
- `fact_revisions`
- `review_tasks`
- `information_events`

原则：

1. 每条 `facts` 只有一个当前有效版本。
2. 修正写入 `fact_revisions`，不覆盖历史。
3. 公开查询只读 `approved` 且未过期事实。
4. 查询关键字段不放进 JSONB。
5. 解析中间态可放 JSONB，但不得作为公开契约。
6. `news_articles` 作为兼容读模型，`information_events` 成为事件事实源。
7. 迁移必须可重复执行。
8. 不破坏现有 P0/P1 表。

### 6.8 数据治理规则

#### 冲突处理

1. A 级来源优先于 B/C/D/E/F。
2. 同级冲突进入人工审核。
3. 新旧学年冲突不得互相覆盖。
4. 适用人群不同的事实不得视为冲突。
5. 高影响冲突必须人工复核。

#### 缺失处理

缺失原因至少分为：

- `not_reported`
- `not_applicable`
- `source_blocked`
- `source_unavailable`
- `source_review_not_completed`
- `requires_manual_review`

#### 新鲜度

| 数据类型 | 绿色 | 黄色 | 红色 |
|---|---:|---:|---:|
| deadline | <= 30 天 | 31-90 天 | > 90 天 |
| 学费 | <= 365 天 | 366-547 天 | > 547 天 |
| 录取数据 | <= 365 天 | 366-547 天 | > 547 天 |
| 政策 | <= 180 天 | 181-365 天 | > 365 天 |

---

## 7. 技术架构

### 7.1 当前技术约束

当前项目是 Next.js 14 应用，已有：

- React 18
- TypeScript
- Tailwind design tokens
- PostgreSQL / Supabase
- `pg` 连接池
- Vitest
- Playwright 依赖
- 现有 `PathOSDataSource` 抽象

转型策略：

1. 不推翻现有应用。
2. 不新建并行前端。
3. 不引入重后端框架。
4. 在现有 Next.js 内建立 domain / server / pipeline 分层。
5. UI 层只消费聚合服务，不直接解析来源。

### 7.2 目标代码结构

```text
src/domain/information/
  fact.ts                 事实类型与规则
  source.ts               来源类型与分级
  event.ts                信息事件类型
  coverage.ts             覆盖率类型

src/server/information/
  fact-repository.ts       事实读写
  source-repository.ts     来源与文档读写
  review-repository.ts     审核与审计
  aggregate-school.ts      学校聚合
  aggregate-major.ts       专业聚合
  aggregate-cost.ts        成本聚合
  aggregate-deadline.ts    截止日聚合
  coverage-service.ts      覆盖率计算

scripts/information/
  register-sources.ts      注册来源
  fetch-sources.ts         抓取来源
  normalize-documents.ts   标准化解析结果
  diff-facts.ts            生成差异
  coverage-report.ts       覆盖率报告

src/app/api/information/
  facts/                   只读事实 API
  events/                  信息事件 API
  coverage/                覆盖率 API

src/app/admin/information/
  page.tsx                 审核台
```

### 7.3 公共路由策略

优先复用现有路由：

| 需求 | 当前入口 | 目标入口 | 策略 |
|---|---|---|---|
| 地图 | `/entry/map` | 保持 | 接入事实层 |
| 学校 | `/university/[id]` | 保持 | 升级信息结构 |
| 专业 | `/s/majors` | 过渡到 `/majors` | 先兼容后迁移 |
| 对比 | `/compare`, `/s/compare` | `/compare` | 合并体验 |
| 计算器 | `/calculator` | 保持 | 接成本事实 |
| 机会 | `/opportunities` | 保持 | 事件驱动 |
| 搜索 | `/search` | 保持 | 全域搜索 |
| 工作台 | `/s/home` | 保持 | 个人信息中枢 |
| 审核 | 新增 | `/admin/information` | 顾问 / 管理员 |

### 7.4 API 原则

公共 API：

1. 只读
2. 版本化
3. 支持来源字段
4. 支持学年字段
5. 数据库不可用时显式失败
6. 可缓存但必须保留数据版本

内部 API：

1. 必须鉴权
2. 必须限流
3. 抓取任务幂等
4. 以来源文档 hash 去重
5. 不暴露数据库错误细节

### 7.5 抓取与解析原则

抓取前：

1. 来源必须注册。
2. 必须确认 robots 和条款。
3. 必须设置超时。
4. 必须限制响应大小。
5. 必须配置 User-Agent。

抓取后：

1. 记录 HTTP 状态。
2. 记录抓取时间。
3. 计算内容 hash。
4. 保存解析状态。
5. 失败不修改事实。

解析规则：

1. 不得从无关文本猜字段。
2. 不得用默认值填补缺失。
3. 必须保留原文片段。
4. 必须记录解析置信度。
5. 低置信度高影响字段进入人工审核。

### 7.6 安全要求

1. SQL 全部参数化。
2. 来源 URL 仅允许 `http` / `https`。
3. 禁止抓取私网地址。
4. 禁止绕过登录、付费墙、验证码和访问限制。
5. 不在日志输出 cookie、session、数据库连接串。
6. 内部 ingestion API 必须使用 advisor / owner 权限。
7. 用户 ID 不进入公开事实 API。
8. 所有输入在 domain boundary 校验。

### 7.7 隐私要求

允许处理：

- 公开院校信息
- 公开统计信息
- 用户主动提交的账号和清单数据

禁止：

- 存储第三方页面中的个人数据
- 未经授权公开学生成绩、文书、联系方式
- 将咨询对话变成公开内容
- 埋点存储原始 IP

### 7.8 法务与版权要求

1. 事实优先，少复制原文。
2. 引用只保留验证所需最小片段。
3. 排名必须标注排名机构、版本和链接。
4. 不移除来源归属。
5. 不大规模复制第三方数据库。
6. 社区内容不得无授权转载。
7. 来源许可不清晰时进入人工判断。

---

## 8. 运营与治理体系

### 8.1 组织角色

| 角色 | 责任 | 最小配置 |
|---|---|---:|
| Product Owner | 范围、优先级、验收 | 1 |
| Engineering Lead | 架构、发布、质量 | 1 |
| Full-stack Engineer | 页面、API、数据库 | 1 |
| Data Engineer | 管线、标准化、校验 | 1 |
| Content Reviewer | 事实审核、事件编写 | 1-2 |
| Data Analyst | 覆盖率、质量、KPI | 0.5 |
| QA / Verification | 测试与验收 | 0.5 |

当前如果由 AI Agent 承担工程执行，人类至少保留：

1. Product Owner
2. Content Reviewer
3. Legal / Trust Reviewer

### 8.2 RACI

| 决策 | R | A | C | I |
|---|---|---|---|---|
| 阶段范围 | Product Owner | Product Owner | Engineering / Data | 全体 |
| 字段模型 | Data Engineer | Product Owner | Engineering | 运营 |
| 来源准入 | Data Analyst | Product Owner | Legal | Engineering |
| 自动批准规则 | Data Engineer | Product Owner | Content | 全体 |
| 事实发布 | Content Reviewer | Product Owner | Data | 用户 |
| 信息事件发布 | Content Reviewer | Product Owner | Data | 用户 |
| Schema 迁移 | Engineering | Engineering Lead | Data | Product |
| UI 变更 | Engineering | Product Owner | Design | 全体 |
| 发布回滚 | Engineering | Engineering Lead | Product | 运营 |

### 8.3 日常运营节奏

#### 日运营

1. 执行注册来源抓取
2. 检查失败来源
3. 跑标准化和校验
4. 生成 diff
5. 高影响任务进入优先审核

#### 周运营

1. 审核 deadline、学费、政策变化
2. 发布信息事件
3. 查看覆盖率
4. 选择下一批补数据学校
5. 复盘搜索无结果词

#### 月运营

1. 来源许可审计
2. 死链和失效来源清理
3. 字段模型复盘
4. 数据质量抽样
5. KPI 复盘

### 8.4 审核规则

#### 自动可批准条件

全部满足才可考虑自动批准：

1. A 级来源
2. 解析置信度 high
3. 字段规则明确
4. 与旧值无异常跳变
5. 学年和范围匹配
6. 该来源历史准确率高

任何一项不满足则进入人工审核。

#### 必须人工审核

1. deadline
2. 政策变化
3. 专业新增或取消
4. 来源冲突
5. 奖学金
6. 金额异常变化
7. 影响超过 20 所学校的变化

### 8.5 信息事件发布标准

一个变化必须满足至少一项：

1. 影响是否申请
2. 影响预算
3. 影响专业选择
4. 影响材料准备
5. 影响时间安排
6. 影响录取判断

否则不发布。

---

## 9. 指标体系

### 9.1 North Star

```text
周 verified decision actions
= 学校页浏览后触发对比、清单、成本计算或报告的次数
```

### 9.2 数据指标

| 指标 | Phase 1 | Phase 2 | Phase 4 |
|---|---:|---:|---:|
| 学校数 | 20 | 62 | 100 |
| 优先字段覆盖率 | 80% | 85% | 90% |
| 有来源公开事实 | 100% | 100% | 100% |
| 审核队列年龄 | <= 3 天 | <= 3 天 | <= 2 天 |
| 每周信息事件 | >= 3 | >= 10 | >= 20 |
| 冲突解决时间 | <= 7 天 | <= 5 天 | <= 3 天 |

### 9.3 产品指标

| 指标 | 目的 |
|---|---|
| 搜索无结果率 | 发现信息缺口 |
| 搜索到学校页转化 | 判断检索质量 |
| 学校页到对比转化 | 判断决策价值 |
| 对比到清单转化 | 判断工具链衔接 |
| 清单到报告转化 | 判断专业价值 |
| 信息流点击率 | 判断变化相关性 |
| 7 日回访率 | 判断持续价值 |

### 9.4 工程指标

| 指标 | SLO |
|---|---:|
| 首页可用性 | 99.5% |
| 学校页可用性 | 99.5% |
| 公共 API p95 | < 500ms |
| 抓取任务成功率 | >= 90% |
| 构建成功率 | >= 95% |
| 新增 P0/P1 bug | 0 |

### 9.5 质量红线

以下情况禁止发布：

1. 公开事实没有来源
2. 公开事实没有审核状态
3. 缺失值显示为 0
4. 不同学年被静默比较
5. 未审核事件进入公共信息流
6. 社区内容被标记为已验证
7. 学校页出现虚构 placeholder

---

## 10. 风险管理

| 风险 | 等级 | 影响 | 缓解 | 负责人 |
|---|---|---|---|---|
| 数据伪造 | P0 | 信任崩塌 | 来源强制、审核强制、缺失显示 | Product / Content |
| 来源过期 | P0 | 错误决策 | 新鲜度状态、定期抓取 | Data |
| deadline 错误 | P0 | 用户损失 | 人工审核、时区、原文链接 | Content |
| 成本口径混乱 | P1 | 预算误判 | 成本项拆分、官方与假设分区 | Data |
| 冲突未处理 | P1 | 用户困惑 | 冲突队列、优先级规则 | Data |
| 抓取违规 | P0 | 法律风险 | 来源准入、robots、条款审核 | Legal |
| 审核瓶颈 | P1 | 更新慢 | 自动规则、批量操作、优先级 | Content |
| UI 漂移 | P1 | 品牌不一致 | 老 token、组件复用 | Product |
| 功能 sprawl | P1 | 价值稀释 | 全功能读事实层 | Product |
| 测试旧失败 | P1 | 回归风险 | 基线锁定、逐步清零 | Engineering |
| 数据库单点 | P2 | 服务不可用 | 降级状态、备份、迁移测试 | Engineering |
| AI 生成幻觉 | P0 | 错误信息 | AI 只引用事实库，不生成事实 | Engineering |

---

## 11. 发布、回滚与连续性

### 11.1 发布门

每个 WP 合并前必须满足：

1. 范围只包含该 WP
2. TypeScript 检查通过
3. 目标测试通过
4. 全量测试无新增失败
5. Build 通过
6. 迁移可重复执行
7. 公开事实有来源和审核状态
8. 缺失态、错误态、空态完整
9. UI 符合老版 PathOS
10. `git diff` 已人工审查
11. 精确 add 文件
12. Commit message 包含 WP 编号

### 11.2 回滚策略

1. 应用回滚使用 revert commit，不重写历史。
2. 新增表不自动 drop。
3. 事实历史永不因应用回滚删除。
4. 聚合层可单独降级。
5. 事件可下架，但必须留审计记录。
6. 破坏性数据库回滚必须先备份。

### 11.3 降级体验

当事实库不可用时：

1. 学校页显示“信息服务暂不可用”
2. 不回退到无来源数据
3. 计算器显示缺输入
4. 信息流显示不可用
5. 管理台显示具体依赖故障

---

## 12. 资源与容量规划

### 12.1 20 周人力容量

以 1 名工程 Agent、1 名人类 Product Owner、1 名内容审核者为最低假设：

| Phase | 工程 | 内容审核 | 产品 | 数据 |
|---|---:|---:|---:|---:|
| Phase 0 | 100% | 10% | 30% | 20% |
| Phase 1 | 100% | 40% | 30% | 50% |
| Phase 2 | 100% | 60% | 30% | 60% |
| Phase 3 | 100% | 40% | 40% | 30% |
| Phase 4 | 100% | 60% | 40% | 40% |

### 12.2 数据生产容量

Phase 1：

- 20 所学校
- 12 个字段
- 理论目标 240 个事实
- 可接受缺口：仅限官方未报告或来源不可用

Phase 2：

- 62 所学校
- 12 个字段
- 理论目标 744 个事实
- 覆盖率目标 85%

Phase 4：

- 100 所学校
- 12 个字段
- 理论目标 1200 个事实
- 覆盖率目标 90%

### 12.3 基础设施

当前优先：

1. PostgreSQL / Supabase
2. Next.js Render 部署
3. 定时抓取 worker
4. 来源与审核日志

暂缓：

1. 搜索引擎服务
2. 前端独立站
3. 后台独立站
4. 多区域部署
5. 复杂 AI RAG 基础设施

---

## 13. 企业级里程碑

### M0：可信开始

时间：第 2 周末

证明：

1. 基线锁定
2. 商业入口降权
3. 路由责任明确
4. 数据模型设计完成

### M1：20 所学校事实闭环

时间：第 6 周末

证明：

1. 事实表和修订历史可用
2. 来源注册和抓取日志可用
3. 审核台可用
4. 学校页读取事实层
5. 20 所学校 12 字段达标

### M2：62 所全量体验

时间：第 10 周末

证明：

1. 62 所学校进入事实层
2. 专业、成本、deadline 可用
3. 信息流有真实事件
4. 覆盖率 dashboard 可用

### M3：决策闭环

时间：第 14 周末

证明：

1. 对比 2.0
2. 清单与 deadline 联动
3. 报告引用事实版本
4. 个人工作台整合

### M4：规模化平台

时间：第 20 周末

证明：

1. Top 100 学校
2. 答案卡与 SEO
3. 周更运营稳定
4. 指标体系完整

---

## 14. 工作包执行手册

### 执行规则

1. 一次只做一个 WP。
2. 每个 WP 独立 commit。
3. 不把 UI、schema、爬虫、审核混在一个 commit。
4. 每个 WP 必须有测试。
5. 文档类变更可不跑 build，但必须跑 `git diff --check`。
6. 涉及代码必须跑 `npx tsc --noEmit`。
7. 涉及路由或组件必须跑 `npm run build`。
8. 涉及数据库必须有迁移测试。
9. 不允许跳过验收项。

---

### WP00：基线保护与商业降权

阶段：Phase 0
目标：让转型不破坏已上线能力。

任务：

1. 重新运行全量测试并记录基线。
2. 建立 `docs/INFORMATION-PLATFORM-BASELINE.md`。
3. 记录公共路由归属。
4. 首页和主导航降低 pricing / CRM / 商业入口优先级。
5. 增加信息平台 feature flag。
6. 不删除 P0/P1 功能。

输出：

```text
docs/INFORMATION-PLATFORM-BASELINE.md
src/lib/product-mode.ts
```

验证：

```powershell
npx tsc --noEmit
npx vitest run
npm run build
```

验收：

1. 测试失败数不高于基线。
2. Build 通过。
3. 商业功能仍可访问。
4. 首页主 CTA 不再指向付费。
5. 路由责任表完整。

---

### WP01：信息平台数据库 Schema

阶段：Phase 1
目标：建立事实、来源、审核和事件的事实源。

任务：

1. 新增 `008-information-platform.sql`。
2. 建 `sources`。
3. 建 `source_documents`。
4. 建 `facts`。
5. 建 `fact_revisions`。
6. 建 `review_tasks`。
7. 建 `information_events`。
8. 增加必要索引。
9. 增加 domain 类型。
10. 增加 repository 基础读写。

关键要求：

- 所有 `CREATE` 使用 `IF NOT EXISTS`
- 公共查询默认只读 approved
- 事实更新必须产生 revision
- 来源 URL 唯一约束
- 事件必须引用 fact revision

输出：

```text
db/migrations/008-information-platform.sql
src/domain/information/fact.ts
src/domain/information/source.ts
src/server/information/fact-repository.ts
src/server/information/source-repository.ts
src/test/unit/information-schema.test.ts
```

验证：

```powershell
npx tsc --noEmit
npx vitest run src/test/unit/information-schema.test.ts
npm run build
```

如 `DATABASE_URL` 存在：

```powershell
npm run db:migrate
```

如不存在，不得声称已验证线上迁移，只能报告“迁移 SQL 与 mock repository 测试通过”。

验收：

1. 插入事实自动生成 revision。
2. 第二次更新保留第一版。
3. pending / rejected / stale 不进入公共查询。
4. 相同来源 URL 不能重复注册。
5. 事件能追溯到 revision。

---

### WP02：来源注册与抓取基础

阶段：Phase 1
目标：来源可控、可审计、可失败。

任务：

1. 定义 `SourceRegistry`。
2. 支持 HTML / PDF / CSV / JSON。
3. 增加来源分级。
4. 增加抓取超时。
5. 增加响应大小限制。
6. 计算文档 hash。
7. 记录抓取结果。
8. 增加私网 URL 拦截。
9. 增加抓取失败状态。

输出：

```text
src/server/information/source-registry.ts
src/server/information/source-fetcher.ts
scripts/information/register-sources.ts
scripts/information/fetch-sources.ts
src/test/unit/source-registry.test.ts
src/test/unit/source-fetcher.test.ts
```

验收：

1. 未注册来源不能抓取。
2. 私网地址被拒绝。
3. 超时会记录。
4. 失败不改变 facts。
5. 成功记录 hash、状态、时间、大小。

---

### WP03：标准化、校验与差异

阶段：Phase 1
目标：把文档变成可信事实候选。

任务：

1. 建字段 normalizer。
2. 标准化百分比。
3. 标准化货币。
4. 标准化学年。
5. 标准化日期与时区。
6. 标准化 SAT / ACT 区间。
7. 建 validator。
8. 建 fact differ。
9. 建 null reason 分类。
10. 建冲突识别。

输出：

```text
src/domain/information/normalize.ts
src/domain/information/validate.ts
src/server/information/fact-differ.ts
src/test/unit/fact-normalizer.test.ts
src/test/unit/fact-validator.test.ts
src/test/unit/fact-differ.test.ts
```

验收：

1. `8%` 和 `0.08` 统一为 percent 8。
2. 录取率 120 被拒绝。
3. 日期保留原时区并输出 UTC。
4. 无变化不生成 revision。
5. 新变化生成 proposed revision。
6. 同级来源冲突进入 review。

---

### WP04：审核台

阶段：Phase 1
目标：人工可审核、可追溯、可下架。

任务：

1. 新增 `/admin/information`。
2. 建待审核队列。
3. 建冲突队列。
4. 建失败来源队列。
5. 支持 approve / reject / stale / recheck。
6. 记录 actor、时间、理由。
7. 使用 advisor / owner 鉴权。

输出：

```text
src/app/admin/information/page.tsx
src/components/admin/InformationReviewConsole.tsx
src/app/api/admin/information/review/route.ts
src/server/information/review-repository.ts
src/test/unit/information-review.test.ts
```

验收：

1. 未登录不能访问。
2. 学生不能访问。
3. 审核动作写入审计记录。
4. approve 后事实进入公共查询。
5. reject 后不进入公共查询。

---

### WP05：20 所学校数据种子

阶段：Phase 1
目标：跑通真实数据闭环。

学校选择原则：

1. 覆盖 Top 20 常见申请目标
2. 覆盖公立 / 私立
3. 覆盖不同地区
4. 覆盖大校 / 文理学院
5. 覆盖已有 guide 数据优先

任务：

1. 导入现有 62 所中的 20 所。
2. 补齐 12 个字段。
3. 每个字段登记来源。
4. 审核并发布。
5. 生成覆盖率报告。
6. 生成至少 10 条变化事件。

输出：

```text
scripts/information/seed-first-20.ts
docs/PHASE1-DATA-REPORT.md
```

验收：

1. 20 所学校全部有事实记录。
2. 每个公开事实有来源。
3. 优先字段覆盖率 >= 80%。
4. 至少 10 条 approved event。
5. 缺失字段有明确原因。

---

### WP06：学校档案 2.0

阶段：Phase 1
目标：学校页从静态 Preview 转为事实驱动。

任务：

1. 拆分学校页信息区。
2. 接入 `aggregate-school`。
3. 显示来源 popover。
4. 显示学年。
5. 显示适用范围。
6. 显示缺失原因。
7. 显示最近变化。
8. 保持老版 UI。

输出：

```text
src/server/information/aggregate-school.ts
src/components/university/UniversityFactSection.tsx
src/components/shared/SourcePopover.tsx
src/test/unit/school-profile.test.ts
```

验收：

1. 每个公开数字有来源。
2. 不同年份不混排。
3. 缺失不显示 0。
4. 事件可跳转。
5. 移动端无重叠。

---

### WP07：信息流与机会动态

阶段：Phase 2
目标：把审核后的变化变成用户可理解的信息流。

任务：

1. 建 events API。
2. 改造 opportunities 页面。
3. 增加学校、专业、类别、紧急度筛选。
4. 显示 old value / new value。
5. 显示 why it matters。
6. 显示 action deadline。
7. 支持关注学校过滤。

输出：

```text
src/app/api/information/events/route.ts
src/app/opportunities/page.tsx
src/components/information/InformationEventCard.tsx
src/test/unit/information-feed.test.ts
```

验收：

1. 只显示 approved event。
2. 事件必有来源。
3. 空态解释监控范围。
4. 关注学校过滤可用。

---

### WP08：覆盖率 Dashboard

阶段：Phase 2
目标：让数据补齐工作可管理。

任务：

1. 定义字段矩阵。
2. 计算覆盖率。
3. 计算新鲜度。
4. 显示审核 backlog。
5. 显示失败来源。
6. 生成数据任务清单。

输出：

```text
src/server/information/coverage-service.ts
src/app/admin/information/coverage/page.tsx
src/app/api/information/coverage/route.ts
src/test/unit/coverage.test.ts
```

验收：

1. 能定位每所学校缺失字段。
2. 能区分未报告与未采集。
3. 能显示来源年龄。
4. 能按影响排序。

---

### WP09：专业档案

阶段：Phase 2
目标：回答专业级问题。

任务：

1. 建专业 slug。
2. 映射学校 program 到 major。
3. 建首批 12 个专业页。
4. 展示代表学校。
5. 展示申请要求。
6. 展示就业与薪资。
7. 提供对比入口。

输出：

```text
src/domain/information/major.ts
src/server/information/aggregate-major.ts
src/app/majors/page.tsx
src/app/majors/[slug]/page.tsx
src/test/unit/major-profile.test.ts
```

验收：

1. 专业与学校关联来自数据。
2. 近似专业有边界提示。
3. 缺失字段不虚构。
4. 每个专业有对比入口。

---

### WP10：申请日历

阶段：Phase 2
目标：把信息变成行动时间表。

任务：

1. 建 deadline 类型。
2. 建申请轮次。
3. 建公共日历页。
4. 建个人清单日历。
5. 增加紧急度。
6. 显示时区和来源。

输出：

```text
src/domain/information/deadline.ts
src/server/information/aggregate-deadline.ts
src/app/deadlines/page.tsx
src/test/unit/deadlines.test.ts
```

验收：

1. 时间必须带时区。
2. 过期项与未来项分区。
3. 历史推断必须标注。
4. 个人日历按 deadline 排序。

---

### WP11：成本与奖学金中心

阶段：Phase 2
目标：输出可解释预算。

任务：

1. 建成本项模型。
2. 拆分直接与间接成本。
3. 建多年预测。
4. 接入奖学金。
5. 增加通胀假设。
6. 增加汇率敏感性。

输出：

```text
src/domain/information/cost.ts
src/server/information/aggregate-cost.ts
src/app/costs/page.tsx
src/test/unit/cost-model.test.ts
```

验收：

1. 官方值与假设值分区。
2. 缺失项不默认 0。
3. 假设增长率可见。
4. 输出最低 / 中位 / 最高区间。

---

### WP12：对比 2.0

阶段：Phase 3
目标：让对比成为核心决策面。

任务：

1. 接入事实聚合层。
2. 建 6 个对比视角。
3. 单位标准化。
4. 显示差异。
5. 显示缺失。
6. 显示来源冲突。
7. 支持导出。

输出：

```text
src/app/compare/page.tsx
src/components/compare/ComparisonMatrix.tsx
src/test/unit/compare.test.ts
```

验收：

1. 同行同语义。
2. 不同学年提示。
3. 单位一致。
4. 缺失可见。
5. 可导出事实清单。

---

### WP13：清单、工作台与报告闭环

阶段：Phase 3
目标：把信息沉淀为用户资产。

任务：

1. 选校清单读取学校事实。
2. 工作台显示 deadline 和变化。
3. 报告引用事实版本。
4. 报告显示来源。
5. 报告显示数据缺口。

输出：

```text
src/app/s/home/page.tsx
src/app/workbench/shortlists/[id]/page.tsx
src/lib/reports.ts
src/test/unit/report-information-integration.test.ts
```

验收：

1. 报告数字可追溯。
2. 清单能显示相关 deadline。
3. 工作台能显示相关事件。
4. 事实更新后报告保留生成版本。

---

### WP14：全局搜索 2.0

阶段：Phase 3
目标：一个搜索框覆盖全部信息资产。

任务：

1. 支持学校搜索。
2. 支持专业搜索。
3. 支持城市和州。
4. 支持信息事件。
5. 支持答案卡。
6. 记录无结果词。

输出：

```text
src/app/search/page.tsx
src/server/information/search-service.ts
src/test/unit/information-search.test.ts
```

验收：

1. 搜索结果有类型分组。
2. 无结果词入库。
3. 高频词生成补数据任务。
4. 搜索响应 p95 < 500ms。

---

### WP15：答案卡与 SEO

阶段：Phase 4
目标：承接高意图搜索流量。

任务：

1. 定义 answer card schema。
2. 从事实聚合生成答案。
3. 建主题页。
4. 建 sitemap。
5. 增加结构化数据。
6. 增加内部链接。

输出：

```text
src/domain/information/answer-card.ts
src/app/topics/[slug]/page.tsx
src/test/unit/answer-card.test.ts
```

验收：

1. 每张卡引用事实。
2. 事实变化卡同步更新。
3. 不生成事实库外结论。
4. sitemap 只含 canonical 页面。

---

### WP16：Top 100 扩张与质量加固

阶段：Phase 4
目标：从试点平台走向规模化平台。

任务：

1. 扩展到 Top 100。
2. 清理旧测试失败。
3. 建立 Playwright 主链路。
4. 建周更新 SOP。
5. 建来源审计报告。
6. 建数据抽样制度。

输出：

```text
tests/information-platform.spec.ts
docs/INFORMATION-PLATFORM-OPERATIONS.md
docs/INFORMATION-PLATFORM-SOURCE-AUDIT.md
```

验收：

1. 100 所学校覆盖。
2. 优先字段覆盖率 >= 90%。
3. E2E 主链路通过。
4. 周更新可重复执行。
5. 全量测试无 P0/P1 失败。

---

## 15. Agent 执行协议

### 15.1 标准执行流程

每次执行必须完成：

```text
读文档
  -> 读相关代码
  -> 列文件清单
  -> 小步修改
  -> 补测试
  -> 跑目标测试
  -> 跑 tsc
  -> 跑 build（如涉及 UI/API）
  -> 跑全量回归（如涉及共享层）
  -> git diff 审查
  -> 精确 add
  -> commit
  -> push codex/target-mode
  -> 汇报证据
```

### 15.2 禁止行为

1. 禁止一次性做多个 WP。
2. 禁止为了通过测试缩小需求。
3. 禁止伪造测试输出。
4. 禁止引入私有数据副本。
5. 禁止把 missing 改成 0。
6. 禁止删除用户已有修改。
7. 禁止提交临时脚本。
8. 禁止提交 `.env`。
9. 禁止改 `main`。
10. 禁止未经授权抓取新来源。

### 15.3 汇报格式

每个 WP 完成后必须汇报：

```text
WP:
Commit:
Changed files:
Implementation:
Verification:
New issues:
Known baseline issues:
Next WP:
```

### 15.4 直接可复制 Prompt

#### WP00 Prompt

> 阅读 `docs/INFORMATION-PLATFORM-AGENT-PLAN.md`，只执行 WP00。先重新跑完整 Vitest 并记录基线，建立基线文档和路由责任表，降低首页商业入口优先级，增加产品模式配置。不得修改数据库 schema，不得删除 P0/P1 功能。验证 tsc、vitest、build，精确提交并推送 `codex/target-mode`。

#### WP01 Prompt

> 阅读 `docs/INFORMATION-PLATFORM-AGENT-PLAN.md`，只执行 WP01。新增 `008-information-platform.sql`、信息 domain 类型、事实与来源 repository，并覆盖修订历史和公共查询过滤测试。不做 UI，不做爬虫。验证 targeted tests、tsc、build；如配置 DATABASE_URL 再跑迁移。精确提交并推送。

#### WP02 Prompt

> 阅读 `docs/INFORMATION-PLATFORM-AGENT-PLAN.md`，只执行 WP02。实现来源注册表和受控抓取器，包含来源分级、超时、大小限制、hash、抓取日志、私网拦截和失败状态。不得抓取未注册来源，不得新增真实大规模来源。补测试，精确提交并推送。

#### WP03 Prompt

> 阅读 `docs/INFORMATION-PLATFORM-AGENT-PLAN.md`，只执行 WP03。实现字段标准化、校验、缺失原因、diff 和冲突识别。不得发布事实。测试必须覆盖百分比、货币、日期、SAT 区间、无变化、新变化和同级冲突。精确提交并推送。

#### WP04 Prompt

> 阅读 `docs/INFORMATION-PLATFORM-AGENT-PLAN.md`，只执行 WP04。实现 `/admin/information` 审核台和审核 API，仅 advisor / owner 可访问，支持 approve、reject、stale、recheck，并记录审计。UI 沿用老版 PathOS token。补测试，精确提交并推送。

#### WP05 Prompt

> 阅读 `docs/INFORMATION-PLATFORM-AGENT-PLAN.md`，只执行 WP05。选择并导入 20 所学校，补 12 个优先字段和来源，生成覆盖率报告与至少 10 条 approved 事件。不得伪造数据，缺失必须写明原因。补脚本测试和数据报告，精确提交并推送。

### 15.5 判断任务完成的优先级

如果时间或上下文不足，按以下顺序保留价值：

1. 数据正确性
2. 来源可追溯
3. 修订历史
4. 权限安全
5. 缺失态
6. 聚合正确性
7. UI 体验
8. 视觉细节

不得为了 UI 速度牺牲前四项。

---

## 16. 最终完成定义

PathOS 信息集合平台完成，必须同时满足：

### 产品

1. 首页是信息台而不是营销页。
2. 学校、专业、成本、deadline、对比、清单、报告形成闭环。
3. 用户可以搜索、比较、保存、跟踪、导出。
4. 信息流由真实审核事件驱动。

### 数据

1. 公开数字全部来自 approved facts。
2. 每条事实有来源、年份、范围和审核状态。
3. 事实修订保留历史。
4. 覆盖率和新鲜度可度量。
5. 缺失原因明确。

### 运营

1. 日抓取可执行。
2. 周审核可执行。
3. 事件发布可执行。
4. 来源审计可执行。
5. 覆盖率任务可排序。

### 工程

1. `npx tsc --noEmit` 通过。
2. `npm run build` 通过。
3. 新模块测试通过。
4. 全量测试无新增失败。
5. E2E 主链路通过。

### 品牌

1. UI 仍像老版 PathOS。
2. 导航结构清晰。
3. 移动端可用。
4. 商业能力保留但不抢主入口。
5. 平台信任感高于炫技感。

---

## 17. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| 1.0 | 2026-10-15 | 初版信息平台 agent 执行计划 |
| 2.0 | 2026-10-15 | 升级为企业级规划书，补战略、治理、运营、风险、资源、指标和完整 WP 手册 |
