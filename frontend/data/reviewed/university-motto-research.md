# 校训与排名补充核验记录

更新时间：2026-10-29

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
