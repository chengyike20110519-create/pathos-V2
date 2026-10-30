// PathOS — Guide preview extractor.
//
// Pulls a compact, UI-ready preview from the IECG docx-driven
// `CollegeGuide` data so list/map surfaces (which only have a
// `UniversitySummary`) can render real facts instead of the
// "数据补充中" empty state.
//
// This is intentionally a pure function with no React / IO. The
// upstream CollegeGuide payload is the source of truth — callers
// pass `structured` + `sections` and get back a flat record. When
// a field is absent or unparsable, the field is left undefined; the
// `hasData` flag tells consumers whether to render the section at
// all (so we don't show an empty card for an unmatched school).
//
// Note on prose fields (location / climate / curriculum / academic
// culture / student feedback): we keep the FIRST one or two
// sentences as a summary and trim URLs for display. Long Q&A
// sections are deliberately truncated; the detail page can pull
// the full rawText from the CollegeGuide itself.

export type ClassSizeBreakdown = {
  under20: string;
  under50: string;
  over50: string;
};

export type UsNewsRanks = {
  overall: string;
  cs: string;
  engineering: string;
  bestTeaching: string;
  bestValue: string;
  mostInnovative: string;
  economics?: string;
};

export type TuitionBreakdown = {
  total: string;
  tuition: string;
  housing: string;
};

export type MidRangeScores = {
  satEbrw: string;
  satMath: string;
  act: string;
  gpa: string;
};

export type ProgramEntry = {
  name: string;
  nameZh: string;
};

export interface GuidePreview {
  hasData: boolean;
  /** Coverage label from the backend, e.g. partial_official_catalog. */
  coverageStatus?: string;

  // Identification
  officialWebsite?: string;
  founded?: string;
  schoolType?: string;
  campusSize?: string;
  climate?: string;
  location?: string;

  // Numbers
  undergraduateStudents?: number;
  graduateStudents?: number;
  studentFacultyRatio?: string;
  freshmanRetentionRate?: string;
  graduationRate4Yr?: string;
  graduationRate6Yr?: string;
  classSize?: ClassSizeBreakdown;
  usNewsRanks?: UsNewsRanks;
  tuition?: TuitionBreakdown;
  acceptanceRatePercent?: number;

  // Admissions
  applicationDeadlines?: string;
  applicationRequirements?: string;
  testPolicy?: string;
  midRangeScores?: MidRangeScores;

  // Academic culture
  academicSystem?: string;       // 学期制 / 学季制
  curriculumSummary?: string;
  curriculumUrl?: string;
  strongPrograms?: string;
  academicCulture?: string;
  selectionFactors?: string;

  // Programs
  programs?: ProgramEntry[];

  // Outreach URLs (course / research / activities / athletics / exchange / careers / sub-schools)
  resourceUrls?: {
    research?: string;
    activities?: string;
    athletics?: string;
    exchange?: string;
    careers?: string;
  };

  // Truncated prose (first ~140 chars) for surfaces that want a sentence teaser.
  // This may come from a reviewed student-feedback section or an explicitly
  // labelled official student-experience summary; it must never be inferred.
  studentFeedbackSnippet?: string;
}

type SectionLike = { title?: string; text: string };

interface ParsedRow {
  label: string;
  value: string;
}

/**
 * Parse a single "label | value [ | value2 ... ]" row.
 * Strips section heading artifacts ("") and trims whitespace.
 */
function parseRow(line: string): ParsedRow | null {
  if (!line.includes("|")) return null;
  const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let label = parts[0];
  if (label.endsWith("：") || label.endsWith(":")) {
    label = label.slice(0, -1).trim();
  }
  // First value comes after first label.
  return { label, value: parts[1] };
}

/**
 * Find a label anywhere on a line, even when the line has multiple
 * "|"-delimited pairs (e.g. "本科生人数 | 5,671 | 研究生人数 | 3,251"
 * returns 3,251 when asked for "研究生人数").
 */
function findRowValue(text: string, labels: string[]): string | undefined {
  for (const line of text.split(/[\r\n]+/)) {
    if (!line.includes("|")) continue;
    // Each "|"-segment may be either "label | value" or "label：value"
    // (e.g. "合计：$86,700"). Flatten "label：value" segments into
    // separate label + value tokens so the pair search below works.
    const tokens: string[] = [];
    for (const part of line.split("|")) {
      const seg = part.trim();
      if (!seg) continue;
      const colonIdx = seg.search(/[：:]/);
      const possibleLabel = colonIdx > 0 ? seg.slice(0, colonIdx).trim() : "";
      // Only split a labelled cell such as "合计：$86,700". Splitting every
      // full-width colon also destroys ratio values such as "1：6".
      if (colonIdx > 0 && colonIdx < seg.length - 1 && labels.includes(possibleLabel)) {
        tokens.push(possibleLabel);
        tokens.push(seg.slice(colonIdx + 1).trim());
      } else {
        tokens.push(seg);
      }
    }
    for (let i = 0; i + 1 < tokens.length; i++) {
      let label = tokens[i];
      if (labels.includes(label)) return tokens[i + 1];
    }
  }
  return undefined;
}

/**
 * Try a sequence of label synonyms and return the first match.
 */
function findRow(text: string | undefined, labels: string[]): ParsedRow | null {
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    const row = parseRow(line);
    if (row && labels.includes(row.label)) return row;
  }
  return null;
}

/**
 * Slice the first sentence(s) from a long Chinese paragraph.
 * Stops at the first "。", "！", "？" or after `maxChars` characters.
 */
function summarize(text: string, maxChars = 80): string | undefined {
  if (!text) return undefined;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  // Pick the first 1-2 sentences
  const sentenceMatch = trimmed.match(/^[^。！？]*[。！？]/);
  if (sentenceMatch) return sentenceMatch[0].trim();
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) + "…" : trimmed;
}

/**
 * Pull the first URL from a string. Returns undefined if none.
 */
function firstUrl(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/https?:\/\/[^\s\u4e00-\u9fff：]+/);
  return m ? m[0] : undefined;
}

/**
 * Parse "African American Studies - 非裔美国人研究" into a ProgramEntry.
 * Also handles cases without the Chinese half.
 */
/**
 * Strip degree annotations like "(B.A.)" / "(B.S./honors)" / "[1]" / "[2, 5]"
 * from an English program name. We don't want "Computer Science (B.S.)" rendered
 * as the name — keep just "Computer Science".
 */
function stripDegreeAnnotations(s: string): string {
  return s
    .replace(/\s*\((?:B\.[AS]|M\.[AS]|Ph\.D|Minor|Honors)[^)]*\)/gi, "")
    .replace(/\s*(?:B\.[AS]|M\.[AS]|Ph\.D)\s*$/i, "")
    .replace(/\s*\[[\d, ]+\]\s*/g, "")
    .trim();
}

/**
 * P0-1: parse a long concatenated programs paragraph into individual
 * ProgramEntry records. Three real-world formats exist in the IECG corpus:
 *
 *   1. Princeton / Stanford — joined with " - ":
 *        "African American Studies - 非裔美国人研究 Anthropology - 人类学"
 *
 *   2. Cornell / UCLA — glued with no separator; English letters run
 *      straight into Chinese characters:
 *        "Agricultural Sciences农业科学Animal Science动物科学..."
 *
 *   3. Mixed: "African American Studies (B.A.) - 非洲裔美国人研究"
 *
 * We try (1) first, fall back to scanning for English→Chinese transitions.
 * Chinese half stops when we hit another ASCII capital letter.
 */
/**
 * P0-7: pick a more informative curriculum summary. The naive `summarize`
 * takes the first sentence, which for IECG's 课程体系 row is often just
 * "通识教育General Education Requirements" (a header, not actual content).
 * Skip header-like first sentences and take the first meaty 1-2 sentences
 * (up to 180 chars).
 */
function pickCurriculumSummary(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[|｜]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  const sentences = cleaned.split(/(?<=[。！？])/);
  let startIdx = 0;
  if (sentences.length > 1) {
    const first = sentences[0].trim();
    if (/^[A-Za-z]/.test(first) || /^(通识教育|核心课程|课程|General Education|Core|Curriculum)/.test(first)) {
      startIdx = 1;
    }
  }
  let acc = "";
  for (let i = startIdx; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;
    if (acc.length + s.length > 180) {
      if (acc.length === 0) return s.slice(0, 180) + "…";
      break;
    }
    acc += s;
    if (acc.length >= 100) break;
  }
  return acc || cleaned.slice(0, 100) + "…";
}

export function parsePrograms(text: string | undefined, maxCount = 8): ProgramEntry[] {
  if (!text) return [];
  const out: ProgramEntry[] = [];

  // Filter out college/school header lines that bleed in as "programs":
  //   "Haas School of Business", "College of Letters and Science",
  //   "School of Engineering", "文理学院 (College of Arts and Sciences)", etc.
  const isCollegeHeader = (s: string): boolean => {
    const trimmed = s.trim();
    if (trimmed.length > 50) return false;
    // Pure ASCII headers (no Chinese): looks like a college/school/department name
    if (!/[\u4e00-\u9fff]/.test(trimmed)) {
      return /\b(College|School|Department|Faculty|Institute|Division|School of|College of)\b/i.test(trimmed);
    }
    // Chinese header: ends with "学院" or starts with "【...研究生】"
    return /(学院|研究生)$/.test(trimmed) || /^【.*】/.test(trimmed);
  };

  const splitOnDashSeparator = (raw: string): void => {
    // Only split on dash when followed by uppercase ASCII letter (program start).
    // Avoids splitting "会计Aerospace Engineering" into two chunks.
    const chunks = raw.split(/\s+[-\u2013\u2014]\s+(?=[A-Z][a-z])/);
    for (const chunk of chunks) {
      const c = chunk.trim();
      if (!c || isCollegeHeader(c)) continue;
      // If chunk still has multiple English-CJK pairs (un-split), split by CJK boundary
      const sub = c.split(/\s+[-\u2013\u2014]\s+/);
      let name = "";
      let nameZh = "";
      if (sub.length >= 2) {
        name = stripDegreeAnnotations(sub[0]);
        nameZh = sub.slice(1).join(" - ").trim();
      } else {
        const m = c.match(/^([A-Za-z][\w\s&/().,'+:-]*?)([\u4e00-\u9fff][\u4e00-\u9fff\s()\uFF08\uFF09\u3001\u300A\u300B\u201C\u201D\u2018\u2019\u00B7\u30FB]+)/);
        if (m) {
          name = stripDegreeAnnotations(m[1]);
          nameZh = m[2].trim();
        }
      }
      if (name && nameZh && name.length >= 2 && nameZh.length >= 2 && !isCollegeHeader(name)) {
        out.push({ name, nameZh });
        if (out.length >= maxCount) break;
      }
    }
  };

  if (text.includes(" - ") || text.includes(" \u2013 ") || text.includes(" \u2014 ")) {
    splitOnDashSeparator(text);
    if (out.length > 0) return out;
  }

  // Chinese-first catalog format: "生物学（Biological Science, BS）".
  const zhFirst = /([\u4e00-\u9fff][^\n；;]{1,30})\s*[（(]([A-Z][^）)]{2,70})[）)]/g;
  let zhMatch: RegExpExecArray | null;
  while ((zhMatch = zhFirst.exec(text)) !== null) {
    const nameZh = zhMatch[1].trim();
    const name = stripDegreeAnnotations(zhMatch[2].split(/,\s*(?=[A-Z]?B\.?)/)[0].trim());
    if (name && nameZh && !isCollegeHeader(nameZh) && name.length >= 2) {
      out.push({ name, nameZh });
      if (out.length >= maxCount) return out;
    }
  }

  // Fallback: scan for English→Chinese transitions in the raw text.
  const re = /([A-Z][A-Za-z][\w\s&/().,'+:-]{2,60}?)([\u4e00-\u9fff][\u4e00-\u9fff\s()\uFF08\uFF09\u3001\u300A\u300B\u201C\u201D\u2018\u2019\u00B7\u30FB]{2,30})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = stripDegreeAnnotations(m[1]);
    const nameZh = m[2].trim();
    if (name && nameZh && name.length >= 2 && nameZh.length >= 2) {
      out.push({ name, nameZh });
      if (out.length >= maxCount) break;
    }
  }
  return out;
}

function parseProgram(line: string): ProgramEntry | null {
  const cleaned = line.trim();
  if (!cleaned) return null;
  const dash = cleaned.match(/^(.+?)\s*[-—–]\s*(.+)$/);
  if (dash) {
    return { name: dash[1].trim(), nameZh: dash[2].trim() };
  }
  return { name: cleaned, nameZh: "" };
}

const NUMERIC_HINT = /^\d{1,3}(,\d{3})*$/;

function parseIntLoose(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[, ]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Extract an `academicSystem` keyword from a longer 简介/特点 paragraph.
 * Returns "学期制 Semester" / "学季制 Quarter" / "学季制 Trimester" / undefined.
 */
function detectAcademicSystem(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/(学期制|学季制|三学期制|Quarter|Semester|Trimester)/);
  if (!m) return undefined;
  if (text.includes("Quarter") || text.includes("学季")) return "学季制 Quarter";
  if (text.includes("Trimester") || text.includes("三学期")) return "三学期制 Trimester";
  if (text.includes("Semester") || text.includes("学期")) return "学期制 Semester";
  return m[0];
}

export interface ExtractInput {
  structured?: Record<string, string | number | string[] | Record<string, unknown>>;
  sections?: SectionLike[];
}

export function extractGuidePreview(input: ExtractInput): GuidePreview {
  const structured = input.structured ?? {};
  const sections = (input.sections ?? []).filter((s): s is { title: string; text: string } => Boolean(s.title && s.text));
  const out: GuidePreview = { hasData: false };

  if (typeof structured.coverageStatus === "string") {
    out.coverageStatus = structured.coverageStatus;
  }

  // ── structured (the easy picks) ──────────────────────────────────
  if (typeof structured.officialWebsite === "string") {
    out.officialWebsite = structured.officialWebsite;
  }
  if (typeof structured.founded === "string") {
    out.founded = structured.founded;
  }
  if (typeof structured.schoolType === "string") {
    out.schoolType = structured.schoolType;
  }
  if (typeof structured.campusSize === "string") {
    out.campusSize = structured.campusSize;
  }
  if (typeof structured.climate === "string") {
    out.climate = summarize(structured.climate, 80);
  }
  if (typeof structured.location === "string") {
    out.location = summarize(structured.location, 100);
  }
  if (typeof structured.undergraduateStudents === "number") {
    out.undergraduateStudents = structured.undergraduateStudents;
  } else if (typeof structured.undergraduateStudents === "string") {
    out.undergraduateStudents = parseIntLoose(structured.undergraduateStudents);
  }
  if (typeof structured.graduateStudents === "number") {
    out.graduateStudents = structured.graduateStudents;
  } else if (typeof structured.graduateStudents === "string") {
    out.graduateStudents = parseIntLoose(structured.graduateStudents);
  }
  if (typeof structured.studentFacultyRatio === "string") {
    out.studentFacultyRatio = structured.studentFacultyRatio;
  }
  if (typeof structured.freshmanRetentionRate === "string") {
    out.freshmanRetentionRate = structured.freshmanRetentionRate;
  }
  if (typeof structured.graduationRate4Yr === "string") {
    out.graduationRate4Yr = structured.graduationRate4Yr;
  }
  if (typeof structured.graduationRate6Yr === "string") {
    out.graduationRate6Yr = structured.graduationRate6Yr;
  }
  if (typeof structured.acceptanceRatePercent === "number") {
    out.acceptanceRatePercent = structured.acceptanceRatePercent;
  }
  if (structured.classSize && typeof structured.classSize === "object" && !Array.isArray(structured.classSize)) {
    const classSize = structured.classSize as Record<string, unknown>;
    const under20 = typeof classSize.under20 === "string" ? classSize.under20 : undefined;
    const under50 = typeof classSize.under50 === "string" ? classSize.under50 : undefined;
    const over50 = typeof classSize.over50 === "string" ? classSize.over50 : undefined;
    if (under20 && under50 && over50) {
      out.classSize = { under20, under50, over50 };
    }
  }
  if (typeof structured.deadlines === "string") {
    out.applicationDeadlines = structured.deadlines;
  }
  if (typeof structured.minimumRequirements === "string") {
    out.applicationRequirements = structured.minimumRequirements;
  }

  // ── section scan ────────────────────────────────────────────────
  const basic = sections.find((s) => s.title === "基本情况");
  if (basic) {
    const schoolType = findRowValue(basic.text, ["学校性质"]);
    if (schoolType) out.schoolType = schoolType;
    const campusSize = findRowValue(basic.text, ["占地面积"]);
    if (campusSize) out.campusSize = campusSize;
    const climate = findRowValue(basic.text, ["气候特点", "气候"]);
    if (climate) out.climate = summarize(climate, 80);
    const grad = findRowValue(basic.text, ["研究生人数"]);
    if (grad) out.graduateStudents = parseIntLoose(grad);
    const sfr = findRowValue(basic.text, ["师生比例"]);
    if (sfr) out.studentFacultyRatio = sfr;
    const ret4 = findRowValue(basic.text, ["4年毕业率", "4 年毕业率"]);
    if (ret4) out.graduationRate4Yr = ret4;
    const ret6 = findRowValue(basic.text, ["6年毕业率", "6 年毕业率"]);
    if (ret6) out.graduationRate6Yr = ret6;
    // P0-6: class size with expanded label synonyms (some schools write
    // "<20" / "20人以下" / ">50" / "50+" etc.).
    const u20 = findRowValue(basic.text, ["少于20人", "小于20人", "<20人", "20人以下", "<20", "20以下"]);
    const u50 = findRowValue(basic.text, ["少于50人", "小于50人", "<50人", "50人以下", "<50", "50以下"]);
    const o50 = findRowValue(basic.text, ["多于50人", "大于50人", ">50人", "50人以上", ">50", "超过50人", "50+"]);
    if (u20 && u50 && o50) {
      out.classSize = { under20: u20, under50: u50, over50: o50 };
    }
    // P0-2: US News ranks — the USNEWS subsection lives inside 基本情况.
    // Be lenient: accept any 1+ field (LACs / UCs / engineering-only schools
    // may not have a CS rank). Strip leading "#" from values.
    const stripHash = (v: string | undefined) =>
      typeof v === "string" ? v.replace(/^#\s*/, "").trim() : v;
    const lines = basic.text.split(/\r?\n/);
    const labels: Array<[string, string]> = [
      ["综合排名|综合", "overall"],
      ["CS|计算机", "cs"],
      ["工程|Engineering", "engineering"],
      ["最佳教学|教学", "bestTeaching"],
      ["最具价值|价值", "bestValue"],
      ["最具创新|创新", "mostInnovative"],
      ["经济|商科|Business|Economics", "economics"],
    ];
    const ranks: Record<string, string> = {};
    for (const line of lines) {
      if (!line.includes("|")) continue;
      const tokens = line.split("|").map((s) => s.trim()).filter(Boolean);
      for (let i = 0; i + 1 < tokens.length; i += 2) {
        for (const [pat, key] of labels) {
          if (new RegExp("^(" + pat + ")$", "i").test(tokens[i])) {
            const v = stripHash(tokens[i + 1]);
            if (v) ranks[key] = v;
          }
        }
      }
    }
    if (Object.keys(ranks).length >= 1) {
      out.usNewsRanks = {
        overall: ranks.overall ?? "",
        cs: ranks.cs ?? "",
        engineering: ranks.engineering ?? "",
        bestTeaching: ranks.bestTeaching ?? "",
        bestValue: ranks.bestValue ?? "",
        mostInnovative: ranks.mostInnovative ?? "",
      };
      if (ranks.economics) out.usNewsRanks.economics = ranks.economics;
    }
  }

  // 简介/特点 → academic system / curriculum / strong programs / culture
  const intro = sections.find((s) => s.title === "简介/特点");
  if (intro) {
    const system = detectAcademicSystem(intro.text);
    if (system) out.academicSystem = system;
    const curr = findRowValue(intro.text, ["课程体系"]);
    if (curr) {
      // P0-7: pick a meatier summary (skip first sentence if it looks like a header)
      out.curriculumSummary = pickCurriculumSummary(curr);
    }
  // P0-3: search for a curriculum URL across multiple sections (课程体系, 学院链接,
  // 本科专业设置 sub-sections like "工程和应用科学学院", etc.)
  if (!out.curriculumUrl) {
    const CURR_TITLES = [
      "课程体系",
      "学院链接",
      "本科专业设置",
      "工程和应用科学学院",
      "工程与应用科学院",
      "School of Engineering",
      "School of Humanities",
      "School of Business",
    ];
    for (const t of CURR_TITLES) {
      const sec = sections.find((s) => s.title === t || s.title?.startsWith(t));
      if (sec) {
        const url = firstUrl(sec.text);
        if (url) {
          out.curriculumUrl = url;
          break;
        }
      }
    }
  }
  // P0-7 followup: if no 课程体系 row found, take curriculum summary from any 简介段 sentence
  if (!out.curriculumSummary && intro) {
    const fallback = pickCurriculumSummary(intro.text);
    if (fallback) out.curriculumSummary = fallback;
  }
    const strong = typeof structured.strongPrograms === "string"
      ? structured.strongPrograms
      : findRowValue(intro.text, ["优势专业", "专业优势"]);
    if (strong) out.strongPrograms = strong;
    const culture = typeof structured.academicCulture === "string"
      ? structured.academicCulture
      : findRowValue(intro.text, ["学术氛围"]);
    if (culture) out.academicCulture = summarize(culture, 100);
    const structuredFactors = typeof structured.selectionFactors === "string"
      ? structured.selectionFactors
      : undefined;
    if (structuredFactors) out.selectionFactors = summarize(structuredFactors, 120);
    // Resource URLs — findRowValue returns the value text; firstUrl pulls out the first URL.
    const research = findRowValue(intro.text, ["本科科研"]);
    if (research && firstUrl(research)) out.resourceUrls = { ...(out.resourceUrls ?? {}), research: firstUrl(research)! };
    if (typeof structured.researchUrl === "string") out.resourceUrls = { ...(out.resourceUrls ?? {}), research: structured.researchUrl };
    const activities = findRowValue(intro.text, ["课外活动"]);
    if (activities && firstUrl(activities)) out.resourceUrls = { ...(out.resourceUrls ?? {}), activities: firstUrl(activities)! };
    if (typeof structured.activitiesUrl === "string") out.resourceUrls = { ...(out.resourceUrls ?? {}), activities: structured.activitiesUrl };
    const athletics = findRowValue(intro.text, ["运动"]);
    if (athletics && firstUrl(athletics)) out.resourceUrls = { ...(out.resourceUrls ?? {}), athletics: firstUrl(athletics)! };
    if (typeof structured.athleticsUrl === "string") out.resourceUrls = { ...(out.resourceUrls ?? {}), athletics: structured.athleticsUrl };
    const exchange = findRowValue(intro.text, ["交换项目"]);
    if (exchange && firstUrl(exchange)) out.resourceUrls = { ...(out.resourceUrls ?? {}), exchange: firstUrl(exchange)! };
    if (typeof structured.exchangeUrl === "string") out.resourceUrls = { ...(out.resourceUrls ?? {}), exchange: structured.exchangeUrl };
    const careers = findRowValue(intro.text, ["实习/就业", "就业"]);
    if (careers && firstUrl(careers)) out.resourceUrls = { ...(out.resourceUrls ?? {}), careers: firstUrl(careers)! };
    if (typeof structured.careersUrl === "string") out.resourceUrls = { ...(out.resourceUrls ?? {}), careers: structured.careersUrl };
  }

  // 费用 → tuition breakdown
  const fees = sections.find((s) => s.title === "费用");
  if (fees) {
    const total = findRowValue(fees.text, ["合计"]);
    const tuition = findRowValue(fees.text, ["学费"]);
    const housing = findRowValue(fees.text, ["食宿"]);
    if (total || tuition || housing) {
      out.tuition = {
        total: total ?? "",
        tuition: tuition ?? "",
        housing: housing ?? "",
      };
    }
  }

  // 申请截止日 → already in structured; nothing else to do.

  // 申请基本要求 → pull test policy string.
  // P0-5: match more variants — Test Optional / Required / Blind / Flexible
  // often appear mid-paragraph (not always at line start), and many schools
  // never use the literal "SAT/ACT：" prefix.
  if (typeof structured.minimumRequirements === "string") {
    const text = structured.minimumRequirements;
    const candidates = [
      /SAT\/ACT[：:][^\n|]+/i,
      /Test[-\s]?(Optional|Required|Blind|Flexible)[^\n|。]*/i,
      /[Tt]est[-\s]?[OPR][^\n|。]*/,
      /不要求\s*SAT[^\n|。]*/,
      /(?:要求|必须|需要)\s*[^\n|。]*SAT\/?ACT[^\n|。]*/,
      /(?:不需要|不需要)\s*[^\n|。]*标化[^\n|。]*/,
      /标化.{0,40}(?:可选|必须|不要求|不需要)/,
    ];
    let policy: string | undefined;
    for (const pat of candidates) {
      const m = text.match(pat);
      if (m) {
        policy = m[0].trim();
        break;
      }
    }
    if (policy) {
      out.testPolicy = policy.length > 200 ? policy.slice(0, 200) + "..." : policy;
    }
  }

  // 本科录取中位线 → SAT / ACT / GPA
  // P0-4 v3: search the 中位线 section FIRST, then fall back to
  // 申请基本要求 + 本科招生情况 (Cornell writes "中位数：SAT:1500 ACT 34"
  // inside the requirements section). Handle Princeton "SAT 阅读EBRW：730-780",
  // Stanford "SAT: 1500-1560 阅读EBRW：740-780", UC Irvine "SAT: 阅读EBRW 600-740",
  // Yale "SAT: 1500-1560阅读EBRW: 740-780", and Chinese "中位数：SAT:1500 ACT 34".
  const extractFromText = (text: string): MidRangeScores | null => {
    if (!text) return null;
    const SEP = "[\\s：:]+";
    const firstHit = (re: RegExp): RegExpMatchArray | null => {
      const m = text.match(re);
      return m && m[1] ? m : null;
    };
    const satEbrw = (
      firstHit(new RegExp("SAT\\s*阅读EBRW" + SEP + "(\\d{3,4}\\s*[-—–~]\\s*\\d{3,4})", "i")) ??
      firstHit(new RegExp("阅读EBRW" + SEP + "(\\d{3,4}\\s*[-—–~]\\s*\\d{3,4})", "i")) ??
      firstHit(new RegExp("EBRW" + SEP + "(\\d{3,4}\\s*[-—–~]\\s*\\d{3,4})", "i"))
    )?.[1] ?? "";
    const satMath = (
      firstHit(new RegExp("(?:数学\\s*Math|SAT\\s*Math|数学" + SEP + "Math)" + SEP + "(\\d{3,4}\\s*[-—–~]\\s*\\d{3,4})", "i")) ??
      firstHit(new RegExp("数学" + SEP + "(\\d{3,4}\\s*[-—–~]\\s*\\d{3,4})"))
    )?.[1] ?? "";
    const satTotal = satEbrw ? "" : (firstHit(/SAT[：:]s*(d{4}s*[-—–~]s*d{4})/)?.[1] ?? "");
    const act = firstHit(new RegExp("ACT" + SEP + "(\\d{2}\\s*[-—–~]\\s*\\d{2})", "i"))?.[1] ?? "";
    const gpa = firstHit(/(?:高中平均GPA|Averages*GPA|平均GPA|加权GPA)s*[：:]?s*(d.d{1,3})/i)?.[1] ?? "";
    const finalEbrw = satEbrw || satTotal;
    if (finalEbrw || satMath || act || gpa) {
      return { satEbrw: finalEbrw, satMath, act, gpa };
    }
    return null;
  };

  const mid = sections.find(
    (s) => s.title?.startsWith("本科录取中位线") || s.title?.startsWith("Mid-Range"),
  );
  const reqs = sections.find(
    (s) => s.title?.includes("申请基本要求") || s.title?.includes("录取要求"),
  );
  const enroll = sections.find((s) => s.title?.includes("本科招生情况"));
  for (const candidate of [mid?.text, reqs?.text, enroll?.text]) {
    const result = extractFromText(candidate ?? "");
    if (result) {
      out.midRangeScores = result;
      break;
    }
  }

  // 录取考量因素 → selectionFactors
  const factors = sections.find((s) => s.title === "录取考量因素" || /录取.*(考量|考虑).*因素/.test(s.title))
    ?? sections.find((s) => /录取.*(考量|考虑).*因素/.test(s.text))
    ?? sections.find((s) => /录取标准/.test(s.text));
  if (factors) {
    const factorText = factors.text.match(/(?:录取标准|录取.*?(?:考量|考虑).*?因素)\s*[：:]?\s*([\s\S]+)/)?.[1] ?? factors.text;
    out.selectionFactors = summarize(factorText.replace(/：$/, ""), 120);
  }

  // P0-1: 本科专业设置 — now we DO extract programs from the docx section.
  // The docx text concatenates program entries without separators (Cornell /
  // UCLA format) or with " - " (Princeton / Stanford format); parsePrograms
  // handles both. We surface the first 8 here so map cards and profile
  // panels show real program names instead of "专业数据补充中".
  const structuredPrograms = typeof structured.programs === "string"
    ? parsePrograms(structured.programs, 8)
    : [];
  const programsSection = sections.find((s) => s.title === "本科专业设置")
    ?? sections.find((s) => /专业设置/.test(s.title))
    ?? sections.find((s) => /本科学院\s*[&＆]\s*专业设置|本科专业设置/.test(s.text));
  if (structuredPrograms.length > 0) {
    out.programs = structuredPrograms;
  } else if (programsSection) {
    const programs = parsePrograms(programsSection.text, 8);
    if (programs.length > 0) out.programs = programs;
  }

  // 学生反馈 → first snippet
  const feedback = sections.find((s) => s.title === "学生反馈");
  if (feedback) {
    out.studentFeedbackSnippet = summarize(feedback.text, 140);
  } else if (typeof structured.studentExperienceSummary === "string") {
    out.studentFeedbackSnippet = summarize(structured.studentExperienceSummary, 140);
  }

  out.hasData =
    Boolean(
      out.officialWebsite ||
        out.founded ||
        out.undergraduateStudents ||
        out.acceptanceRatePercent ||
        out.applicationDeadlines ||
        out.tuition ||
        out.programs?.length ||
        out.usNewsRanks ||
        out.studentFacultyRatio ||
        out.curriculumUrl ||
        out.midRangeScores?.satEbrw ||
        out.midRangeScores?.act ||
        out.midRangeScores?.gpa ||
        out.testPolicy ||
        out.classSize,
    );
  return out;
}
