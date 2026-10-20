import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendRoot = resolve(__dirname, "../../..");
const source = readFileSync(
  resolve(frontendRoot, "src/components/v2/V2Workbench.tsx"),
  "utf8",
);
const homeMode = source.slice(
  source.indexOf("function HomeMode"),
  source.indexOf("function MajorsMode"),
);

describe("V2 student workbench cockpit", () => {
  it("keeps the student priority order explicit", () => {
    const expectedOrder = [
      "DeadlineRemindersCard",
      "InformationCoverageCard",
      "ShortlistsCard",
      "RecentEventsCard",
      "ReportsCard",
      "决策工具",
      "AdvisorLeadsCard",
      "SchoolIndex",
    ];
    let cursor = -1;

    for (const marker of expectedOrder) {
      const nextIndex = homeMode.indexOf(marker, cursor + 1);
      expect(nextIndex, `${marker} should come after the previous panel`).toBeGreaterThan(cursor);
      cursor = nextIndex;
    }
  });

  it("loads cockpit data from existing user/data APIs", () => {
    expect(source).toContain('"/api/information/deadlines"');
    expect(source).toContain('"/api/shortlists"');
    expect(source).toContain('"/api/information/events?limit=5"');
  });

  it("keeps loading, unavailable, and signed-out states explicit", () => {
    expect(source).toContain('kind === "loading"');
    expect(source).toContain('kind === "unavailable"');
    expect(source).toContain('kind === "unauthenticated"');
    expect(source).toContain("已停止展示未核验内容");
    expect(source).toContain("未登录时不展示任何默认或示例选校组合");
    expect(source).not.toContain("body?.message");
  });

  it("does not fabricate a report history index", () => {
    expect(source).toContain("当前没有可查询的报告索引");
    expect(source).toContain("不显示模拟历史记录");
    expect(source).not.toContain("recentReports");
  });

  it("uses shared cockpit cards and lucide icons", () => {
    expect(source).toContain("function CockpitPanel");
    expect(source).toContain("function CockpitNotice");
    expect(source).toContain("<CalendarClock");
    expect(source).toContain("<ShieldAlert");
    expect(source).toContain("<ListChecks");
    expect(source).toContain("<Radar");
    expect(source).toContain("<FileText");
  });
});
