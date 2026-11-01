# 校训与排名补充核验记录

更新时间：2026-10-29

## 2026-10-31 增量核验

- Loyola、Stanford、Arizona State、Stony Brook、Texas A&M、Penn State 已根据学校官方页面或官方文件补做核验并更新为 `confirmed`。
- 其中 Stanford、ASU、Stony Brook、Texas A&M、Penn State 的官方材料表达更接近品牌语/定位语，产品展示必须保留“官方品牌语”或“非正式校训”标签，不能把它们包装成正式校训。
- Bucknell、Colorado School of Mines、Santa Clara、UIC、Iowa、UMass Amherst 本轮仍未找到足以证明“正式校训”的官方证据，继续保持 `pending`。

## 本轮已确认的判断

| 学校 | 结论 | 可展示内容 | 来源 |
|---|---|---|---|
| Stanford University | 学校官方称其为 unofficial motto，不应标成正式校训 | `Die Luft der Freiheit weht`；中文“自由之风劲吹”；状态 `candidate` | https://facts.stanford.edu/admin-finances |
| University of Maryland, College Park | 官方大学参议院报告明确说明学校没有正式校训 | 不展示为正式校训；保留待核验/拒绝状态 | https://www.senate.umd.edu/sites/default/files/resources/billDocuments/09-10-31/stage3/HR_UM_Motto_Report_09-10-31.pdf |
| Loyola University Chicago | 官方材料使用耶稣会传统格言 | `Ad Majorem Dei Gloriam`；中文“为了上帝更大的荣耀”；待写入确认记录 | https://www.luc.edu/media/lucedu/ccih/formsdocumentsandpdfs/LUCRomanCatholicIdentitySp08.pdf |

## 暂不写入正式校训的资料

- Arizona State University：目前检索到的是院系口号或品牌表达，不足以证明是全校正式校训。
- UMass Amherst：检索结果主要是学生组织或院系页面，不能作为全校校训来源。
- Stony Brook University：检索到的是学生组织口号，不是大学校训。
- Texas A&M University：检索到“ We Make Leaders ”等品牌/军校项目表达，但尚未确认其是否为全校正式校训。
- Bucknell University、Colorado School of Mines、Santa Clara University、Penn State、UIC、Iowa：当前官方资料主要呈现使命、品牌定位或价值观，未确认正式校训；已在数据库标记为 `pending`，不把这些内容显示为校训。

## 继续核验记录（2026-10-31）

- 本轮重新打开并记录了 Bucknell、Mines、Santa Clara、UIC、Iowa、UMass 的官方使命/品牌页面；这些页面能证明学校的 mission、vision、values 或 brand language，但仍不能证明存在正式全校 motto，因此状态保持 `pending`。
- University of Maryland 的官方参议院研究报告明确写出学校没有 official motto；官方品牌资料可确认 `Fear the Turtle` 是品牌词/体育口号，所以保留 `rejected`，不把它塞进正式校训字段。
- 上述每条记录已在 `university-mottos.json` 增加 `reviewedSources`，后续可继续追踪来源，不以搜索摘要替代事实。

## 继续核验记录（2026-10-31，招生政策）

- Columbia College 与 Columbia Engineering 的官方 2029 届资料可以确认当前材料中的 test-optional 事实，但 Columbia 本科英语能力要求页面当前无法稳定抓取；因此 `englishPolicy` 继续保持 `pending_external_access`，没有用其他学校或同名院校的页面替代。
- Duke 的 2026-27 综合排名目前只找到媒体报道，未找到可直接引用的 Duke 官方页面；现有历史排名继续保留为待复核，不写入新的 confirmed 记录。

## 排名数据规则

- 只有能定位到排名机构、排名年份、排名范围和名次的记录才进入数值排名。
- IECG 2025 资料只作为历史参考，卡片中必须显示“参考资料 · 待官方复核”。
- 学校专业排名不能替代学校综合排名；专业排名只放在对应专业卡片。
- 找不到可靠来源时显示“暂未核验”，不使用估算值或从排名区间反推名次。

本文件是审查记录，不是展示数据源。正式写入 Supabase 前，仍需将每条记录映射到 `universityId`、来源状态和核验日期。

## 资料覆盖审计（2026-10-29）

- IECG 资料包：88 所；地图当前名单：94 所。
- 8 所学校不在 IECG 资料包中：Arizona State、Bucknell、Harvey Mudd、Olin、Rose-Hulman、Colorado Boulder、Iowa、South Carolina。
- IECG 资料中 80 所有可解析的 2025 US News 综合排名；目前 Minnesota、UC Merced、NC State、Stony Brook、Villanova、UMass Amherst、Michigan State、Texas A&M、UIC 已补入 2026 参考排名并写入 Supabase；Duke 仍待找到可直接引用的官方 2026 排名页面，现有 #7 仅保留为待复核数据。
- 其余排名缺口必须继续按“机构 + 年份 + 范围 + 名次 + 原始链接”逐条核验，不能从学校层级或专业排名推导综合排名。

## 继续核验记录（2026-11-01，来源试查）

为处理预览数据中仍标记为 `source_review_not_completed` 的学校，本轮先对四所学校进行官方资料试查。以下页面可以作为后续补充学校概览、费用和招生字段的候选来源，但本轮不直接覆盖现有记录，因为还需要完成字段级来源映射和年份核对：

- Wake Forest University：官方招生 Facts & Figures 提供 2026–27 申请人数、录取率、学费和本科生人数；[官方页面](https://admissions.wfu.edu/facts/)。
- University of Illinois Urbana-Champaign：官方招生 Facts & Rankings 提供本科生规模、专业数量、师生比和学校官方排名叙述；[官方页面](https://www.admissions.illinois.edu/facts-rankings/)。
- Case Western Reserve University：官方 2024–25 年报提供 Fall 2025 本科生人数和学院学位分布；[官方页面](https://case.edu/annualreport/)。费用字段另有 2026–27 官方学费表；[官方页面](https://case.edu/studentaccounts/tuition-fees/undergraduate-tuition-fees)。
- University of Massachusetts Amherst：已确认 “Be Bold. Be True. Be Revolutionary.” 是品牌宣传语，不应写入正式校训字段；[官方说明](https://www.umass.edu/news/article/%E2%80%98be-revolutionary%E2%80%99-umass-amherst-launches)。

本轮结论：前三所存在可用于后续字段补充的官方资料，但不能仅凭一次搜索就把整所学校的 `sourceStatus` 改为 `verified`；UMass 的校训仍保持 `pending`。

## 继续核验记录（2026-11-01，第二批）

- William & Mary：官方招生 Facts & Figures 已发布 Class of 2030 的申请数、录取率、SAT/ACT 区间和入学人数；官方 Institutional Research 页面还提供 Fall 2025 本科生分项数据。可作为招生与 enrollment 字段的优先补充来源，但需要锁定数据所属 cohort 和学年。[招生事实页](https://www.wm.edu/admission/undergraduateadmission/facts-figures/)，[本科生数据页](https://www.wm.edu/offices/provost/data-trends/student-enrollment/undergraduate/)。
- Virginia Tech：官方新闻页发布 Fall 2026 census 的申请数、新生数和总 enrollment，可作为最新招生概览候选来源；需要与本科口径和学年字段对应后再写入。[官方页面](https://news.vt.edu/articles/2026/10/CM-census-fall-2026.html)。
- Florida State University：官方招生材料提供本科生人数、毕业率、留存率和师生比；其中部分数字来自 2025 招生宣传册，必须保留参考年份，不直接覆盖当前记录。[官方材料](https://admissions.fsu.edu/sites/g/files/upcbnu3881/files/PDF/2025/First-Year%20Recruitment%20Brochure.pdf)。

本批新增来源仍只进入审查记录，没有直接改写 `sourceStatus`；下一步需要把每个数字拆成字段级事实、绑定来源 URL 和参考年份后，才能安全发布。

## 继续核验记录（2026-11-01，第三批）

- Brandeis University：官方 admissions 页面给出 Fall 2025 本科生数、申请数、录取率和 SAT 区间；官方 Facts 页面还给出 2025–26 学费、住宿费、专业数和师生比。这一所具备较完整的官方字段来源，适合进入下一轮字段级写入。[招生数据](https://www.brandeis.edu/admissions/why-brandeis/numbers.html)，[官方 Facts](https://www.brandeis.edu/about/facts/)。
- Tulane University：找到官方 Facts、招生概览和 Institutional Research enrollment reports，但搜索结果没有直接给出一套统一的本科招生数字；需要进入其报告页面逐项提取，暂不填入推断值。[官方 Facts](https://tulane.edu/about/facts-and-figures)，[招生概览](https://admission.tulane.edu/why-tulane/at-a-glance)。
- University of Miami：目前找到的官方 Fact Book 主要是历史资料，最新可直接使用的本科招生数字仍需从 IRSA 的 Common Data Set 或招生办公室当前页面核对，因此保持待审核。[官方 Fact Book](https://digitalcollections.library.miami.edu/digital/collection/asu0285)。
- Rensselaer Polytechnic Institute：本轮搜索未找到足够完整且可直接对应当前预览字段的官方本科事实页，暂不写入新数字。

本批结论：Brandeis 已具备进入字段级补充的条件；Tulane、Miami 和 RPI 仍需进一步提取或核对，不能仅凭搜索摘要直接发布。

### Brandeis 当前数据冲突（待写入前处理）

官方 2025–26 CDS 给出本科生 3,358、研究生 1,384、总人数 4,742；本轮已将卡片三个 enrollment 字段整体更新为该标准化秋季口径。招生页面的 45% 是本科招生统计，不能与全校 enrollment 混用；学费和总就读成本仍需拆分，因此保留冲突警告。

### 34 所待审核学校的来源覆盖复查

对 `data/preview/source-index.json` 的当前快照进行字段范围复查后，34 所 `source_review_not_completed` 记录中有 33 所已经存在至少一条状态为 `verified` 的官方来源，但这些来源大多只覆盖专业目录、留存率或毕业率，并不等于学校总览中的所有字段都已验证。1 所（UIUC）在当前本地 source index 中没有对应来源记录。因而“待审核”不能简单理解成“完全没有来源”，也不能因为有一条专业目录就改成整校 `verified`。

下一步应按字段补齐：学校总览、学费、录取率、本科人数、排名、政策和专业各自绑定来源；只有整套关键字段完成核验后，才更新整校来源状态。

### 来源覆盖复查结果（2026-11-01）

重新统计当前 `universities.json` 与 `source-index.json` 后，34 所 `source_review_not_completed` 学校现在均至少有 1 条 `verified` 官方来源记录（34/34）。这只证明来源索引不再为空，不代表 34 所学校的所有展示字段都已核验；当前仍需按字段补齐并解决年份、cohort 与统计口径差异。

自动化年份审计还发现：这 34 所学校的学校卡本科人数记录目前统一停在 2024，而每所学校至少有一条 2025 或 2026 来源记录。不过这些较新来源中有不少只覆盖专业目录、毕业率或政策，不能据此直接替换本科人数。该结果被定义为“需要字段匹配的年份差异”，而不是自动的数据错误。

### Wake Forest 当前数据冲突（待写入前处理）

官方 2025–26 Facts & Figures 页面给出本科生 5,595、研究生与职业学生 4,038、总人数 9,633；本轮已将卡片三个 enrollment 字段整体更新为同一官方口径。录取率和费用仍需与卡片字段逐项拆分，因此继续保留冲突警告。

现有预览记录使用 2024 年口径：本科生 5,471、录取率 21.56%、费用 $94,600；官方招生 Facts & Figures 页面目前给出 2025–26/2026–27 口径：本科生 5,595、录取率 19%、学费 $71,894，另列住房、餐饮和预计总成本。该记录已增加 `official_profile_conflict_pending_reconciliation` 警告，等待拆分学费与总成本并统一年份后再更新。

### 下一批已确认的口径差异

- Case Western Reserve：官方 Fall 2025 年报同时给出本科生 6,534、研究生与职业学生 5,864、总人数 12,398；已将卡片三个 enrollment 字段整体更新为同一官方口径。录取率和费用仍需分别按同一学年核对，因此保留冲突警告。
- William & Mary：现有预览录取率为 34.1%、本科生数为 7,063；官方 Class of 2030 录取率为 35%，官方 Fall 2025 本科生数据为 6,951（全日制 6,867、非全日制 84）。已增加冲突警告，不能把 Class of 2030 的 cohort 数据当作全校 enrollment。
- Virginia Tech 与 Florida State：目前找到的官方数据与预览记录并非同一统计口径或年份，暂不标记为确定冲突，保留待进一步对齐。

### 第四批来源比对

- Stevens Institute of Technology：现有预览本科生数为 4,236、录取率为 47.6%（2024）；官方 Facts and Statistics 页面给出 Fall 2025 本科生 4,206、Fall 2025 入学录取率 51%。已增加冲突警告，等待统一 cohort 和入学统计定义。
- University of Connecticut：官方最新 Fact Sheet 给出 Fall 2025 总 enrollment 34,424，但当前预览字段是本科生数，不能直接用总人数替换本科生人数。
- UC Riverside：官方页面给出全校或年度 enrollment 数据，但当前预览字段需要本科生口径；暂不把总 enrollment 直接写入本科生字段。
- Syracuse University：官方 Facts & Figures 页面确认项目和学校概览，但本轮没有获得能直接对应当前本科人数/录取率字段的单一最新数值，暂不覆盖。

### 第五批来源比对

- Stony Brook：官方 Fall 2025 first-year 数据和 2025–26 学费页已加入来源索引；其招生数据是 first-year cohort，不能替代全校本科人数。
- UMass Amherst：官方 Fall 2026 页面给出本科生 22.7K、首年申请 52.5K、录取 65%；现有预览为 2024 年本科生 23,920、录取率 59.73%，已增加冲突警告，等待统一年份和招生口径。
- UMass Amherst：本轮又核对到校级 University Analytics 页面给出 Fall 2026 本科生 23,630、研究生 6,780、总人数 30,410，而招生统计页显示本科约 22.7K。两者均为官方页面但统计定义尚未对齐，因此只加入来源链和冲突说明，不直接覆盖现有卡片字段。
- UMass Amherst：Fall 2025 官方 enrollment fact sheet 明确把常规学生与 University Without Walls（UWW）分开统计：常规本科 23,067、常规研究生 4,470，含 UWW 的总 headcount 为 31,318。该定义拆分解释了不同官方页面的数字差异，本轮继续不覆盖卡片原值。
- Villanova：官方 2025–26 CDS 给出本科生 6,935、研究生 3,172、总人数 10,107，本轮已将卡片三个 enrollment 字段整体更新为同一官方口径。Class of 2030 的录取率 29.6% 属于招生 cohort，不能直接覆盖卡片现有录取率，因此继续保留冲突警告。
- NC State：官方 Fast Facts 已加入来源索引，但当前页面主要提供机构概览和毕业率，未找到足以替换现有本科人数的单一最新值，因此暂不标记冲突。

### 第六批来源比对

- Clemson：官方 2025 页面给出本科生 24,060、研究生 5,485、总人数 29,545，已将卡片三个 enrollment 字段整体更新为同一官方口径；首年录取率为 42%，现有预览为 38.3%，因此仍保留招生 cohort 冲突警告。
- UIC：官方 About 页面给出 Fall 2026 本科生 25,620；现有预览为 2024 年 22,495，已增加冲突警告。学费也需要按 2026–27 口径拆分。
- UIC：官方 About 页面同时给出 Fall 2026 本科生 25,620、研究生 7,294、职业学生 4,285、总人数 37,199。本轮已将卡片的本科、研究生/职业学生合计（11,579）和总人数一起更新为同一官方快照；录取率仍保留冲突警告，未用 enrollment 数据替代招生 cohort 数据。
- University at Buffalo：官方招生信息表给出 2024 本科生 20,359，与现有 20,360 基本一致；本轮不增加冲突警告。
- UC Merced：本轮没有找到可直接对应学校卡本科人数与录取率的一套官方页面，继续保持待审核。

### 第七批来源比对

- Rensselaer Polytechnic Institute：找到 2026–27 官方本科费用表，明确区分学费、费用、生活成本和总成本；同时找到官方 Institutional Research 页面及 2025–26 Common Data Set 入口。费用来源已加入索引，但招生/本科人数仍需从 CDS 原表提取后才能写入。
- University of Miami：找到 2026–27 官方 tuition and fees 页面；招生和本科人数仍需从最新 Common Data Set 进一步提取。
- Tulane 与 George Washington：已有官方费用来源，但当前还缺少与学校卡本科人数、录取率完全对应的同学年完整记录。

### GW 高优先级数据错误

### 师生比异常复核

- Florida State：原预览值 `1` 明显是导入异常；官方 About 页面给出 `17:1`，已按该官方口径回写，并将师生比与 enrollment 年份分开记录。
- George Washington：原预览值 `1` 明显是导入异常；官方自评报告给出 `12:1`，已回写，但仍保留整校资料冲突警告。
- University of Pittsburgh：原预览值 `1` 明显是导入异常；官方 Pittsburgh Campus Common Data Set（2023–24）给出 `13:1`，已回写并标注报告年份。
- Syracuse：当前值仍未覆盖。已有官方学校概览页，但没有在本轮取得可直接对应学校卡、且定义清楚的最新全校师生比，因此不填估算值。

现有预览记录曾把 George Washington University 的本科生人数写成 `11`；官方 Fall 2025 enrollment update 明确报告本科生总数为 `11,148`，研究生与职业学生合计为 `12,936`，全校总人数为 `24,500`。这不是普通年份差异，而是明显的数据截断/导入错误。本轮已将这三个互相关联的字段统一回写为官方 2025 秋季口径，并保留 `official_profile_conflict_pending_reconciliation` 警告，因为录取率及其他卡片字段仍未完成同学年、同统计口径的完整核对。
