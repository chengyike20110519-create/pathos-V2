import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

function read(relativePath: string) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("student research platform V3.1", () => {
  it("keeps the school profile as a research quick read, not a decision pitch", () => {
    const component = read("src/components/university/SchoolQuickRead.tsx");

    expect(component).toContain("3 分钟学校速览");
    expect(component).toContain("Preview");
    expect(component).toContain("口径");
    expect(component).toContain("来源");
    expect(component).toContain("核心字段覆盖");
    expect(component).toContain("不把 Preview 数据包装成已审核事实");
    expect(component).not.toContain("冲刺");
    expect(component).not.toContain("保底");
    expect(component).not.toContain("录取概率");
    expect(component).toContain("costComparisonUnsafe");
    expect(component).toContain("跨校不可直接比较");
  });

  it("keeps trend analysis source-backed and missing-data safe", () => {
    const component = read("src/components/trends/TrendLabView.tsx");
    const route = read("src/app/trends/page.tsx");

    expect(component).toContain("MAX_SCHOOLS = 4");
    expect(component).toContain("不插值、不预测");
    expect(component).toContain("UniversityDetail.timeSeries");
    expect(component).toContain('"semester", "school_id", "school_name", "value", "source", "as_of", "verified_by", "confidence"');
    expect(component).toContain("point[metric] == null ? \"\"");
    expect(component).toContain("断线代表该学校该年缺失");
    expect(component).toContain("title=\"选择大学加入趋势\"");
    expect(component).toContain("setPickerOpen(false)");
    expect(component).toContain("/^[=@+\\t\\r-]/.test(value) ? `'${value}` : value");
    expect(component).toContain("params.set(\"metric\", metric)");
    expect(component).toContain("DataReadinessPanel");
    expect(component).toContain("不参与趋势计算");
    expect(route).toContain('title: "趋势台"');
  });

  it("documents the product boundary and execution order", () => {
    const plan = read("docs/PATHOS-STUDENT-RESEARCH-PLATFORM-V3.1.md");

    expect(plan).toContain("PathOS V3.1 学生信息研究平台执行规格");
    expect(plan).toContain("不是申请管理系统");
    expect(plan).toContain("不在缺失年份之间插值");
    expect(plan).toContain("学校速览规格");
    expect(plan).toContain("V3.1 交付顺序");
  });

  it("keeps trend selection and the shared compare selection exactly in sync", () => {
    const trend = read("src/components/trends/TrendLabView.tsx");
    const store = read("src/state/compare-store.ts");

    expect(trend).toContain("compare.replaceIds(capped)");
    expect(store).toContain("replaceIds: (ids: string[]) => void");
    expect(store).toContain("const seen = new Set<string>();");
    expect(store).toContain("[...seen].slice(0, MAX_ITEMS)");
  });
});
