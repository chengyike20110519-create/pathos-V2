const MISSING_ZH = "中文名称待补充";
type SchoolNameFields = { name: string; nameZh?: string | null; chineseName?: string | null };

const REVIEWED_NAME_OVERRIDES: Record<string, string> = {
  "University of Illinois at Urbana Champaign": "伊利诺伊大学厄巴纳—香槟分校",
  "University of California Merced": "加州大学默塞德分校",
  "North Carolina State University": "北卡罗来纳州立大学",
  "Stony Brook University": "纽约州立大学石溪分校",
  "University of Massachusetts Amherst": "马萨诸塞大学阿默斯特分校",
  "The Pennsylvania State University": "宾夕法尼亚州立大学",
  "Brandeis University": "布兰迪斯大学",
  "Rensselaer Polytechnic Institute": "伦斯勒理工学院",
  "University of Connecticut": "康涅狄格大学",
  "Syracuse University": "雪城大学",
  "University of California Riverside": "加州大学河滨分校",
  "Stevens Institute of Technology": "斯蒂文斯理工学院",
  "University at Buffalo": "纽约州立大学布法罗分校",
  "University of Illinois at Chicago": "伊利诺伊大学芝加哥分校",
  "Clemson University": "克莱姆森大学",
  "University of California Santa Cruz": "加州大学圣克鲁兹分校",
  "Worcester Polytechnic Institute": "伍斯特理工学院",
  "Marquette University": "马凯特大学",
  "Southern Methodist University": "南卫理公会大学",
  "Fordham University": "福特汉姆大学",
};

/** Keep the Chinese and official English names together without inventing a translation. */
export function getSchoolNamePair(school: SchoolNameFields) {
  const english = school.name.trim();
  const candidate = (school.nameZh || school.chineseName || "").trim();
  const zh = REVIEWED_NAME_OVERRIDES[english]
    || (candidate && candidate.toLocaleLowerCase() !== english.toLocaleLowerCase() && /[^\x00-\x7F]/.test(candidate) ? candidate : MISSING_ZH);
  return { zh, en: english, missingChinese: zh === MISSING_ZH };
}
