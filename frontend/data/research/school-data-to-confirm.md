# PathOS 学校数据待确认清单

生成日期：2026-10-17

当前 94 所学校均已匹配到官方 College Scorecard 机构记录。以下不是“没有数据”，而是需要人工确认口径、年份或官网页面后，才能在产品中标记为最终确认。

## 一、必须确认的字段

### 1. 招生考试要求与分数

Scorecard 中以下学校的 SAT/ACT 分数为空或不完整，需要到学校本科招生官网确认是否 test-optional、是否提交分数、以及 25/75 分位数是否仍适用：

- Arizona State University
- California Institute of Technology
- The Ohio State University
- Olin College of Engineering
- University of California, Berkeley
- University of California, Davis
- University of California, Irvine
- University of California, Los Angeles
- University of California, San Diego
- University of California, Santa Barbara
- University of South Carolina
- University of Washington
- University of California Merced
- University of California Riverside
- University of California Santa Cruz
- Worcester Polytechnic Institute

### 2. 录取率

以下两所学校的官方机构数据中 ADM_RATE 为空，需要确认是否为不报告、招生口径变化，还是应使用学校 Common Data Set：

- The Ohio State University
- University of South Carolina

### 3. 学费

- University of South Carolina：州内学费和州外学费字段为空，需要从该校当前本科费用页面确认。

### 4. 入学人数

- Harvey Mudd College
- Olin College of Engineering

现有资料标记为总入学人数或研究生入学人数未报告，需要确认本科人数、总人数和是否存在研究生项目。

## 二、需要确认年份的学校

现有 60 所学校的部分录取率、费用、入学人数或测试数据来自较旧参考年份，不能直接展示成“2026 当前数据”。这些学校是：

Arizona State University、Boston College、Boston University、Brown University、Bucknell University、California Institute of Technology、Carnegie Mellon University、Columbia University、Cornell University、Dartmouth College、Duke University、Emory University、Georgetown University、Georgia Institute of Technology、Harvard University、Harvey Mudd College、Indiana University Bloomington、Johns Hopkins University、Lehigh University、Loyola University Chicago、Massachusetts Institute of Technology、New York University、Northeastern University、Northwestern University、The Ohio State University、Olin College of Engineering、Princeton University、Purdue University—Main Campus、Rice University、Rose-Hulman Institute of Technology、Rutgers University—New Brunswick、Stanford University、Texas A&M University、Tufts University、University of California, Berkeley、University of California, Davis、University of California, Irvine、University of California, Los Angeles、University of California, San Diego、University of California, Santa Barbara、University of Chicago、University of Colorado Boulder、University of Florida、University of Georgia、University of Iowa、University of Maryland, College Park、University of Michigan—Ann Arbor、University of Minnesota Twin Cities、University of Notre Dame、University of Pennsylvania、University of Rochester、University of South Carolina、University of Southern California、The University of Texas at Austin、University of Virginia、University of Washington、University of Wisconsin—Madison、Vanderbilt University、Washington University in St. Louis、Yale University。

## 三、必须逐校核对官网的字段

以下 60 所学校的英语成绩政策和标准化考试政策目前标记为“待外部官网确认”。需要逐校确认：是否 test-optional、适用申请季、国际生要求、英语考试最低分和豁免条件。名单与上面的 60 所学校相同。

## 四、特殊口径

以下 16 所学校的部分学生、费用或结果数据属于 county scope 或跨校区聚合口径，比较时不能直接当作单一主校区数据：

Boston College、Boston University、Columbia University、Emory University、Loyola University Chicago、New York University、Northeastern University、Rice University、University of California, San Diego、University of California, Santa Barbara、University of Georgia、University of Pennsylvania、University of South Carolina、University of Southern California、Vanderbilt University、Washington University in St. Louis。

## 建议确认顺序

1. 先确认 94 所学校当前官网、校区和学校名称。
2. 再确认 16 所 county scope 学校的数据口径。
3. 再确认 60 所学校的最新年份和考试政策。
4. 最后补齐 16 所 SAT/ACT 缺失学校、2 所录取率缺失学校和 South Carolina 学费。
