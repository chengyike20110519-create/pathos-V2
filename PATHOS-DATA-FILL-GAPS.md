# PathOS 数据填充缺口清单（IECG ↔ UI 占位符）

**编制时间**：2026‑09‑19
**审计范围**：`frontend/data/college-guides/iecg-2025.json`（88 所）、`frontend/data/preview/universities.json`（62 所）、全部 `src/components`、`src/app`、`src/server` 中显式渲染"数据补充中 / 未补充 / 待补充 / 暂无数据 / 后端尚未上线"的位置。
**目标**：在动手修复之前，把"哪些地方需要被填、可以填什么"做成一份可逐条核对的清单。

---

## 0. 总览（先看这三张数字）

| 维度 | 数量 | 备注 |
|---|---|---|
| IECG 文档收录学校 | 88 | 含结构化 + 12 个段落 |
| 当前 `universities.json` 学校 | 62 | 地图上能点出来的 |
| IECG 有数据但未进 POI 列表 | **35** | 这些学校只在 Profile 里有，地图看不到（详见 §6） |
| IECG 已有但 POI 完全没收录 | **0** | IECG 至少覆盖了全部 POI |
| IECG 中字段解析成功率（29 字段平均） | **76.8 %** | 见 §2 |
| UI 占位符全部触发面 | 30+ 处 | 见 §3 |

---

## 1. 资料源与流向

```
IECG docx (88)
    └─► extractGuidePreview(structured, sections)   ← src/lib/guide-preview.ts
            └─► GuidePreview (29 字段)
                    └─► UniversitySummary.guidePreview
                            └─► summaryToLegacyUniversityPOI (legacy-mappers.ts)
                                    └─► UniversityPOI.guidePreview
                                            └─► UI（Map Card / Hover / Profile / Guides / Match / Calculator ...）
```

**关键不变量**：
- `guidePreview` 是把 docx 解析到 UI 的唯一桥梁。`profile.structured` 已经被 `extract-iecg-guides.py` 抽过一遍（只保留 9 字段），剩下 20+ 字段全靠 `guide-preview.ts` 走 rawText 二次解析。
- `universities.json` 是 fixture（Stage 5 Preview Bundle，`previewOnly=true`），由 `import-to-supabase.ts` 灌库；和 IECG 是两套数据，需要 `import-iecg-guides.ts` 把 88 所 align 到 62 所 POI。
- `region-metrics.json` 现在 `status="blocked"`、`records=[]`，所以所有区域维度（subway / 中餐 / 亚超 / 安全 / 生活成本 / 华人密度 / 收入 / 就业）**全部**走"数据补充中"。

---

## 2. IECG 29 字段覆盖率（按"被填上"统计）

| 字段 | 覆盖 / 88 | 在 UI 里的位置 |
|---|---|---|
| `acceptanceRatePercent` | **88/88** ✓ | Guides 录取率、Map Card 录取率 |
| `officialWebsite` | 87/88 | Profile 官网链接、Map Header |
| `founded` | 87/88 | Profile 校史段 |
| `location` | 87/88 | Profile 城市/州（fallback）、SchoolPicker 城市 |
| `tuition` | 87/88 | Map Card 年费用、Guides 年费用、Match/Assessment/Portfolio 学费 |
| `graduateStudents` | 86/88 | Profile 招生段 |
| `schoolType` | 86/88 | Profile 类型段 |
| `academicSystem` | 86/88 | Map Card 申请要点、Profile 学制段 |
| `undergraduateStudents` | 84/88 | Guides 本科人数、Map 招生段 |
| `climate` | 84/88 | Profile 环境段 |
| `studentFacultyRatio` | 83/88 | Map Card 师生比、Hover 副线、Profile |
| `strongPrograms` | 83/88 | Profile 优势专业、Match 学科对比 |
| `freshmanRetentionRate` | 82/88 | Map Card 保留率 |
| `selectionFactors` | 81/88 | Profile 录取考量 |
| `graduationRate6Yr` | 79/88 | Profile 6 年毕业率 |
| `graduationRate4Yr` | 78/88 | Map Card 毕业率、Hover 副线、Guides |
| `academicCulture` | 75/88 | Profile 学术氛围 |
| `studentFeedbackSnippet` | 74/88 | Profile 学生反馈首段 |
| `resourceUrls` | 76/88（缺失 12） | Profile 科研 / 活动 / 体育 / 交换 / 就业外链 |
| `campusSize` | 71/88（缺失 17） | Profile 校园段 |
| `applicationRequirements` | 70/88（缺失 18） | Assessment 语言/标化要求 |
| `classSize` | **52/88**（缺失 36） | Profile 课堂人数 |
| `testPolicy` | **52/88**（缺失 36） | Guides 申请政策、Assessment 标化 |
| `curriculumSummary` | **47/88**（缺失 41） | Profile 课程体系、Map Card 课程链接描述 |
| `midRangeScores` | **46/88**（缺失 42） | Profile 中位线 |
| `curriculumUrl` | **12/88**（缺失 76） | Map Card / Profile 课程链接按钮 |
| `usNewsRanks` | **7/88**（缺失 81） | Compare 排名条、Profile 排名段、Map Card 排名徽 |
| `programs` | **0/88** ⚠ | Profile 专业列表、Profile Panel "专业数据补充中" |

> **结论**：89 % 的学校都覆盖到"学费 + 师生比 + 4 年毕业率 + 保留率 + 截止日 + 学制"这一组高曝光字段；但 **`usNewsRanks`、`curriculumUrl`、`programs`、`midRangeScores`、`classSize`、`testPolicy`、`curriculumSummary` 这 7 个字段系统性没有解析出来**，需要在 §4 优先打补丁。

---

## 3. UI 占位符 → 字段  对照表

> 把每一处用户能看到的"数据补充中 / 未补充 / 待补充"逐条映射到 §2 里的字段。

### 3.1 地图 / 地图卡（最高曝光）

| 文件 / 行号 | 占位符文案 | 触发条件 | 依赖字段 |
|---|---|---|---|
| `components/map/UniversityCard.tsx:122` | "学费数据补充中" | `gp.tuition.total` 缺 | `tuition`（87/88 ✓） |
| `components/map/UniversityCard.tsx:129` | "数据补充中" | `gp.studentFacultyRatio` 缺 | `studentFacultyRatio`（83/88） |
| `components/map/UniversityCard.tsx:130` | "数据补充中" | `gp.graduationRate4Yr` 缺 | `graduationRate4Yr`（78/88） |
| `components/map/UniversityCard.tsx:131` | "数据补充中" | `gp.freshmanRetentionRate` 缺 | `freshmanRetentionRate`（82/88） |
| `components/map/UniversityCard.tsx:132` | "数据补充中" | `gp.applicationDeadlines` 缺 | `applicationDeadlines`（84/88） |
| `components/map/UniversityCard.tsx:133` | "数据补充中" | `gp.academicSystem` 缺 | `academicSystem`（86/88） |
| `components/map/UniversityCard.tsx:474` | "数据补充中" | `poi.nearby.subwayStations == 0` | 区域 metric ❌ |
| `components/map/UniversityCard.tsx:480` | "数据补充中" | `poi.nearby.chineseRestaurants == 0` | 区域 metric ❌ |
| `components/map/UniversityCard.tsx:486` | "数据补充中" | `poi.nearby.asianGroceries == 0` | 区域 metric ❌ |
| `components/map/UniversityCard.tsx:497` | "暂未提供学校级安全指标" | `poi.safetyScore == null` | 区域 metric ❌ |
| `components/map/UniversityCard.tsx:517` | "数据补充中" | `poi.annualCostRmb == 0` | `costSummary` + 区域 ❌ |
| `components/map/UniversityHoverTooltip.tsx` | 师生比 / 4 年毕业率 | 缺 → 整个副线消失 | `studentFacultyRatio` + `graduationRate4Yr` |
| `components/map/UniversityProfile.tsx:70-74` | 同 Map Card 5 项 | 同上 | 同上 |
| `components/map/CityDetailPanel.tsx:29,34,46,92,99,106` | "学费数据补充中" / "数据补充中" × 6 | 区域聚合指标缺失 | 区域 metric ❌ |
| `components/map/ComparePanel.tsx:66,75,79,83,87` | "数据补充中" / "学费数据补充中" × 5 | 5 个数值字段缺失 | `safetyScore` / `recognitionScore` / `admissionRate` / `annualCostRmb` |
| `components/map/MapShell.tsx:1081,1105,1111,1143` | "数据补充中" / "学费数据补充中" | 同上聚合 | 区域 + 学费 |

### 3.2 学校 Profile / Guides / Match / Calculator / Assessment / Portfolio

| 文件 / 行号 | 占位符文案 | 触发条件 | 依赖字段 |
|---|---|---|---|
| `components/university/UniversityProfilePanel.tsx:302` | "数据补充中"（所在州） | `detail.state` + `gp.location` 都缺 | `location`（87/88） |
| `components/university/UniversityProfilePanel.tsx:303` | "数据补充中"（城市） | `detail.city` + `gp.location` 都缺 | `location`（87/88） |
| `components/university/UniversityProfilePanel.tsx:306` | "数据补充中"（排名） | `detail.rankingBand == null` | `rankingBand` + `usNewsRanks`（7/88） |
| `components/university/UniversityProfilePanel.tsx:381` | "招生与在校生数据补充中" | 招生 / 在校生字段缺 | `undergraduateStudents` + `graduateStudents` |
| `components/university/UniversityProfilePanel.tsx:476` | "专业数据补充中" | `programs.length == 0` | `programs`（0/88 ⚠）+ `topPrograms` |
| `components/university/UniversityProfilePanel.tsx:515` | "排名数据补充中" | `ranking[]` 空 | `usNewsRanks`（7/88） |
| `components/university/UniversityProfilePanel.tsx:564` | "费用数据补充中" | `cost[]` 空 | `tuition`（87/88） |
| `components/university/UniversityProfilePanel.tsx:670` | "人物介绍数据补充中" | `people.length == 0` | 需补充来源 |
| `components/university/UniversityProfilePanel.tsx:739` | "校史数据补充中" | `history == null` | `history`（无 IECG 来源） |
| `components/university/UniversityProfilePanel.tsx:755,777` | "数据补充中" | 同段内 subfield 缺 | 多种 |
| `components/university/UniversityProfilePanel.tsx:817` | "来源数据补充中" | `sources[]` 空 | 各 source |
| `app/guides/page.tsx:91` | "数据补充中"（录取率） | `acceptanceRate == null` | `acceptanceRatePercent`（88/88 ✓） |
| `app/guides/page.tsx:95` | "数据补充中"（毕业率） | `graduationRate == null` | `graduationRate4Yr`（78/88） |
| `app/guides/page.tsx:99` | "数据补充中"（本科人数） | `ug == null` | `undergraduateStudents`（84/88） |
| `app/guides/page.tsx:103` | "专业数据补充中" | `programs.length == 0` | `programs`（0/88） |
| `app/guides/page.tsx:103` | "申请政策正在补充或核验" | `testPolicy == null` | `testPolicy`（52/88） |
| `app/match/page.tsx:35` | "学费数据补充中" | USD 字段缺 | `tuition`（87/88） |
| `app/match/page.tsx:327` | "数据补充中"（安全） | `safetyScore == null` | 区域 metric ❌ |
| `app/match/page.tsx:365` | "数据补充中"（维度） | 该维度数值缺 | 区域 metric ❌ |
| `app/assessment/page.tsx:248` | "学费数据补充中" | 同上 | `tuition` |
| `app/portfolio/page.tsx:220,250` | "学费数据补充中" | 同上 | `tuition` |
| `app/calculator/page.tsx:168` | "数据补充中" pill | 同上 | `tuition` |
| `app/calculator/SchoolPicker.tsx:city` | 城市 fallback 到 `gp.location` | `city == ""` | `location`（87/88） |

### 3.3 其他（与 IECG 无关，需要另外补数据）

| 文件 / 行号 | 占位符文案 | 真正缺的是什么 |
|---|---|---|
| `app/news/page.tsx:80` | "数据补充中" | news 文章 = 0（manifest.counts.news = 0） |
| `app/opportunities/page.tsx:503,565` | "院校信息待补充" | opportunities 项的 universityNameZh / universityName 缺 |
| `app/opportunities/page.tsx:632` | "来源信息待补充" | opportunities 项的 source 缺 |
| `components/ai/AiContextPanel.tsx:68` | "数据补充中 — 后端预览接口尚未上线" | AI backend 还没接 |
| `components/ai/AiContextPanel.tsx:144` | "数据补充中" | 同上 |
| `components/university/ProvenanceBadge.tsx:27` | "数据补充中" | `source_review_not_completed` 状态固定文案 |

---

## 4. P0 修复（影响最高曝光的解析缺口）

> 这些是 §2 表里覆盖率最差的字段，且是 §3 高曝光位共同依赖的字段。一改全部页面受益。

### P0‑1 `programs`（0/88）
**问题**：`guide-preview.ts` 当前**故意丢弃**了 programs（参见 handoff 注释："Programs section intentionally dropped from guidePreview (concatenated without separator). Fixture's `u.topPrograms` (5 curated programs/school) is canonical for list/map surfaces."）。
**事实**：IECG 的"本科专业设置"段每所学校平均 30–40 个专业，是家长最关心的内容之一。地图卡上现在看到的是 fixture 里写死的 5 个，没有按学校来匹配。
**修复方向**：
1. 在 `extractGuidePreview` 里把 programs 段按 ` - ` / 重新格式切开，至少拆出前 6–10 个 `name + nameZh`。
2. 在 `programs?: ProgramEntry[]` 上限做 `slice(0, 10)` 防止卡片爆长。
3. Map Card / Profile / Guides 的"专业方向"位直接读 `gp.programs`。

### P0‑2 `usNewsRanks`（7/88）
**问题**：US News 综合/CS/工程/最佳教学/最具价值/最具创新 + 经济这一组完全没解析出来。原始 docx 是 `USNEWS排名-本科 2025\n综合排名 | 1 | CS | 5 | 工程 | 12 ...` 这种 N 对 N 配对，目前的 `findRowValue` 走的是 `label: value` 顺序，遇到 N 对 N 就会丢。
**修复方向**：
1. 在 `guide-preview.ts` 写一个 `parseUsNewsRanks(text)`：先按段定位（标题含 `USNEWS` 或 `US News`），再按行 `split("|")` 后按"奇数索引是 label / 偶数索引是 value"配对。
2. 抽出 7 个标准 label：`综合排名 / CS / 工程 / 最佳教学 / 最具价值 / 最具创新 / 商科`（部分学校有）/ `经济`（部分学校有）。
3. Profile 排名段、Map Card 排名徽、Compare 排名条全部读 `gp.usNewsRanks`。

### P0‑3 `curriculumUrl`（12/88）
**问题**：原始 docx 的"课程体系"段是 `通识教育General Education Requirements https://odoc.princeton.edu/...` 这种"中文 + URL"混合。`firstUrl()` 走 `https?:\/\/[^\s\u4e00-\u9fff：]+` 应该能取到，但只 12 所成功，说明多数学校没写这一行；或写在另一段（如"学院链接"），需要把多段联合起来 firstUrl。
**修复方向**：
1. 在 `parseGuidePreview` 增加 `CURRICULUM_URL_SECTIONS = ["课程体系", "学院链接", "本科专业设置", "工程和应用科学学院"]`，对每段都跑一次 firstUrl，第一个非空胜出。
2. Map Card / Profile 给"查看完整课程 →"按钮直接 `<a href={gp.curriculumUrl} target="_blank">`。

### P0‑4 `midRangeScores`（46/88）
**问题**：SAT/ACT/GPA 中位线原始格式非常多变（Princeton 是 `SAT 阅读EBRW：730-780 数学Math： 760-800ACT 32-36高中平均GPA 3.95`，CMU 是 `1530-1560`，部分学校只有 GPA 没有 SAT），且常和"录取中位线"段混在一起。
**修复方向**：
1. 写一个 `parseMidRangeScores(text)`：先用正则抓 `(\d{3,4})-(\d{3,4})` 当 SAT 范围；`ACT[:：\s]+(\d+)-(\d+)` 当 ACT；`GPA[:：\s]+(\d\.\d+)` 当 GPA。
2. 若一段不够，再去看"录取中位线" / "录取数据" / "Standardized Testing"段。
3. Profile 中位线面板：SAT EBRW + Math 两行可拼、ACT 单独行、GPA 单独行。

### P0‑5 `testPolicy`（52/88）
**问题**：Test Optional / Required / Blind 通常写在"申请基本要求"段第一行，但很多学校的"基本要求"段开头是 TOEFL/IELTS，Test 政策写在中段（如 `SAT/ACT：2024, 2025 Fall Test Optional (not require)`），正则没扛住。
**修复方向**：
1. 关键词集合：`["Test Optional", "Test Required", "Test Blind", "Test Flexible", "不要求", "需要", "可选"]`。
2. `parseTestPolicy(text)`：扫描整段找第一个匹配关键词的句子，截取到下一个句号。
3. 在 Guides 申请政策 + Assessment 标化要求两处共用。

### P0‑6 `classSize`（52/88）
**问题**：原始 docx 的"课堂人数"段写得很不统一，Princeton 是 `少于20人 | 74.0% | 少于50人 | 90.0% | 多于50人 | 10.0%`（标准 3 段），CMU 把 50+ 人写成 `>50`，Rice 写成 `>50 students`。当前正则要求"少于 50"等关键词都匹配，挡住了变体。
**修复方向**：
1. 把 label 集合扩成：`<20 / <50 / >50 / 大于50 / 多于50 / 50+ / 50人以下`等近义词。
2. 给每个 label 一个标准化映射（`<20人 → under20`、`>50 → over50`）。

### P0‑7 `curriculumSummary`（47/88）
**问题**："课程体系"段最长（Princeton 那一段就 600+ 字），当前 `summarize(80)` 只取首句，且很多学校第一句是标题（如"通识教育 General Education Requirements"），对家长没有信息量。
**修复方向**：
1. 跳过以"通识教育"、"General Education"、"核心课程"等关键词开头的句子，取第二个完整句。
2. 提到前 2 句、180 字以内，覆盖率应该能从 47/88 提到 80+/88。

---

## 5. P1 修复（影响中曝光，但量大的字段）

### P1‑1 `campusSize`（71/88，缺 17）
**问题**：原始 docx 偶有"校园面积：5000英亩"或英文"campus: 5,000 acres"，label 写"占地面积"或"校园面积"或"Campus"。
**修复**：扩展 label 集合为 `["占地面积", "校园面积", "Campus", "Campus Size", "校园占地"]`。

### P1‑2 `applicationRequirements`（70/88，缺 18）
**问题**：TOEFL/IELTS/SAT-ACT/GPA 写在"申请基本要求"段，且和 `testPolicy` 是同一段。`findRowValue` 当前 label 只有"TOEFL"/"IELTS"，会拿到分段里第一个 TOEFL 数字，但 GPA、推荐信、活动列表常被漏。
**修复**：分别写 `extractToeflMin` / `extractIeltsMin` / `extractGpaMin` / `extractTestPolicy`，每个函数都先按段名定位，再走正则。

### P1‑3 `academicCulture`（75/88，缺 13）
**问题**："学术氛围"段有些学校写在"学校特色" / "学术特色" / "Academics"段。
**修复**：扩展段落标题集合。

### P1‑4 `resourceUrls`（76/88，缺 12）
**问题**：科研 / 活动 / 体育 / 交换 / 就业 URL 在 docx 写在不同段，section title 也有变体（如"课外活动" vs "Student Life"）。
**修复**：扩展段落标题到中英双语 + 近义词。

### P1‑5 `studentFeedbackSnippet`（74/88，缺 14）
**问题**：UCSD / UC Irvine / Yale 等学校"学生反馈"段是空（IECG 没写），只能等 IECG 补充内容。
**修复**：无解；保留占位符。

### P1‑6 `selectionFactors`（81/88，缺 7）
**问题**：Texas Austin / UIUC / Wisconsin 等学校的"录取考量因素"段写在"Admissions Factors"而非中文段名。
**修复**：扩展段名集合。

### P1‑7 `graduationRate4Yr`（78/88，缺 10）
**问题**：Wisconsin / BU / U Washington / Purdue / NEU / FSU / Duke / Tulane 这 8 所的"4 年毕业率"用了英文（如 `4-yr graduation rate: 87%`）或和 6 年毕业率在同一段（无 `4年毕业率`中文 label）。
**修复**：扩展 label 集合 + 支持英文格式。

---

## 6. P0‑独立项：35 所学校**根本不在地图上**

`universities.json` 只有 62 所，IECG 88 所里 **35 所** 不在 POI 列表：

```
北卡教堂山、德州奥斯汀、伊利诺伊香槟、维克森林、凯斯西储、弗吉尼亚理工、
佛州州立、威廉玛丽、UC Merced、北卡州立、Stony Brook、维拉诺瓦、
UMass Amherst、乔治华盛顿、Penn State、密歇根州立、Brandeis、杜兰、
迈阿密、RPI、匹兹堡、康涅狄格、Syracuse、UC Riverside、Stevens、
科罗拉多矿业、UB、伊利诺伊芝加哥、克莱姆森、UC Santa Cruz、
伍斯特、特拉华、Fordham、SMU、Marquette
```

**修复方向**：
1. 在 `PathOS-db-ranking-standalone/data-pipeline/manual-seeds/` 里为这 35 所添加种子（含 `name / chineseName / lat / lng / state / city / acceptanceRate`）。
2. 重跑 `db:import` 把这 35 所写入 `universities.json`，再由 fixture 灌到预览 bundle。
3. 同步更新 `frontend/src/components/map/` 里按 region 聚合的统计（region 频次会变）。

---

## 7. 区域数据（region-metrics.json）全部为 0

`region-metrics.json` 当前 `records: []`、`status: "blocked"`、`disabledReason: "Credentialed official regional intake is unavailable."`，影响的字段：

| 字段 | 在哪里显示 | 数量 |
|---|---|---|
| `nearby.subwayStations` | Map Card × 1 | 0/62 |
| `nearby.chineseRestaurants` | Map Card × 1 | 0/62 |
| `nearby.asianGroceries` | Map Card × 1 | 0/62 |
| `safetyScore` | Map Card / Match / Compare / City Panel | 0/62 |
| `recognitionScore` | Map Card / Compare | 0/62 |
| `costOfLiving` / `avgRentRmb` | Map Card / Match / Calculator | 0/62 |
| `chineseCommunity` | Map Card | 0/62 |
| `chinese_population` | Map 区域热力 | 0/62 |
| `income` / `employment` | 区域热力 | 0/62 |

**修复方向**（独立工作流，非 IECG 范畴）：
1. 等拿到 US Census ACS / Numbeo / 美使馆开放数据后写 `scripts/import-regional-data.py`（脚本已存在，待接数据源）。
2. 一次性灌库 + 重启 BFF。

---

## 8. 其他独立缺口（非 IECG）

| 缺口 | 当前 | 影响页面 |
|---|---|---|
| 新闻文章 = 0 | `manifest.counts.news = 0` | `/news` 永远显示"暂无资讯" |
| AI 后端未接 | 后端没有 `/api/ai/analyze` 真实实现 | `/ai` 全屏占位符 |
| Opportunities 来源 / 院校名 缺 | 数据库未填 | `/opportunities` 显示"院校信息待补充" |
| UniversityDetail.people / history / anecdotes | 多数学校 = 0 | `/university/[id]` 人物 / 校史段 |
| `sourceUrls` 内的额外 URL（科研 / 体育 / 校医院） | 部分学校未挂在 docx | Profile 段内"查看官网 →" |

---

## 9. 推荐的填法优先级（先 P0 再 P1）

1. **先改 `guide-preview.ts`**：7 个 P0 字段全部在这里改完，所有 UI 受益。一轮 PR 即可。
2. **再扩 schema 校验**：在 `frontend/src/schemas/dataset.schema.ts` 的 `GuidePreviewSchema` 增加 `usNewsRanks` / `programs` / `midRangeScores` / `testPolicy` / `classSize` 的 zod 校验，避免回归。
3. **再补 35 所 POI**：跑 `db:import`，单独一个 PR（不动 schema）。
4. **再处理区域数据**：等数据源到位后单独 PR。
5. **新闻 / AI / Opportunities**：每个单独 PR。

---

## 10. 验证清单（改完后怎么验收）

| 验收项 | 怎么做 |
|---|---|
| 7 个 P0 字段覆盖率全部 ≥ 90/88 | `npx tsx scripts/audit-iecg-coverage.ts` 输出 |
| TypeScript 编译干净 | `cd frontend && npx tsc --noEmit` |
| 7 条路由全部 200 | `curl http://localhost:3017/{map,guides,calculator,assessment,match,portfolio,university/princeton-university}` |
| 地图卡 Princeton 显示 "$86,700/年" + "师生比 5:1" + "毕业率 80%" + "截止日 EA 11/1 RD 1/1" + "学期制" | Playwright 截图 `frontend/review-shots/09-guides-princeton-selected.png` 同款位置 |
| Guides 页专业方向显示具体专业名（如 "Computer Science · Mathematics · ..."）而不是 "专业数据补充中" | 截图比对 |
| 地图卡排名徽显示 "综合 1" 或 "US News 1" 而非 "outside_numeric_scope" | 截图比对 |
| Match 维度条不再全部 "部分维度数据不足" | 截图比对 |
| profile.usNewsRanks 实际从 docx 抽出来 | 在 browser devtools 看 `summary.guidePreview.usNewsRanks` |
