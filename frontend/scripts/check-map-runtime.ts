// Read-only smoke check against the actual running backend. Uses an
// isolated browser profile and never imports fixtures or modifies data.
import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function chooseSchool(page: Page, name: string) {
  const toggle = page.getByRole("button", { name: "学校列表", exact: true });
  if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
  const list = page.getByRole("region", { name: "学校结果列表" });
  const resetScope = list.getByRole("button", { name: "返回全部筛选结果", exact: true });
  if (await resetScope.isVisible()) await resetScope.click();
  await list.getByRole("textbox", { name: "搜索结果中的学校" }).fill(name);
  const row = list.locator("button[data-school-row]").filter({ hasText: name });
  await expect(row).toHaveCount(1, { timeout: 30000 });
  await expect(row).toBeEnabled({ timeout: 30000 });
  await row.click();
}

async function main() {
  const origin = process.env.PATHOS_CHECK_URL ?? "http://localhost:3000";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const requests: string[] = [];
  const successfulDetails: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/pathos/preview?")) requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/api/pathos/preview" && url.searchParams.get("endpoint") === "university" && response.status() === 200) successfulDetails.push(response.url());
  });
  try {
    const start = Date.now();
    await page.goto(`${origin}/map?region=safety&state=08`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("button[data-school-id],button[data-cluster-count]").first()).toBeVisible({ timeout: 45000 });
    const mapMs = Date.now() - start;
    const firstMapResources = await page.evaluate(() => performance.getEntriesByType("resource")
      .map((entry) => entry as PerformanceResourceTiming)
      .filter((entry) => entry.name.includes("/api/pathos/preview?") || entry.name.includes("/_next/static/"))
      .map((entry) => ({ path: new URL(entry.name).pathname + new URL(entry.name).search, ms: Math.round(entry.duration), startMs: Math.round(entry.startTime), transferBytes: entry.transferSize }))
      .sort((a, b) => b.ms - a.ms));
    // Secondary footer destinations must not compete with initial map data.
    expect(firstMapResources.some((entry) => /\/chunks\/app\/(?:calculator|portfolio|assessment|majors|account\/api-keys)\/page-/.test(entry.path))).toBe(false);
    console.log(JSON.stringify({ phase: "map", mapMs, firstMapResources: firstMapResources.slice(0, 8) }));
    const cookies = page.getByRole("button", { name: "仅必要", exact: true });
    if (await cookies.isVisible()) await cookies.click();
    expect(requests.filter((url) => new URL(url).searchParams.get("endpoint") === "university")).toHaveLength(0);
    expect(requests.filter((url) => new URL(url).searchParams.get("endpoint") === "program-options")).toHaveLength(0);

    const clicked = Date.now();
    await chooseSchool(page, "科罗拉多大学博尔德分校");
    const card = page.getByRole("dialog", { name: "科罗拉多大学博尔德分校 详细信息" });
    await expect(card).toBeVisible();
    await expect(card.getByText("最近采集", { exact: false })).toBeVisible({ timeout: 30000 });
    await expect(card.getByText("Boulder", { exact: true })).toBeVisible();
    await expect(card.getByText("先看专业", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: /查看全部已收录专业/ }).click();
    await expect(card.getByText("Architecture - Bachelor of Environmental Design", { exact: true })).toBeVisible();
    const coloradoCount = await card.getByRole("list", { name: "全部学校专业" }).getByRole("listitem").count();
    expect(coloradoCount).toBeGreaterThan(8);
    await expect(card.getByText("后端响应无法解析", { exact: false })).toHaveCount(0);
    const detailMs = Date.now() - clicked;
    console.log(JSON.stringify({ phase: "detail", detailMs }));
    const detailRequests = requests.filter((url) => new URL(url).searchParams.get("endpoint") === "university");
    // The transport intentionally permits one retry for a 503/timeout.
    // Require one successful result, not one physical network attempt.
    expect(successfulDetails).toHaveLength(1);
    expect(detailRequests.length).toBeGreaterThanOrEqual(1);
    expect(detailRequests.length).toBeLessThanOrEqual(2);

    await page.getByRole("button", { name: "关闭学校详情", exact: true }).click();
    const reopened = Date.now();
    await chooseSchool(page, "科罗拉多大学博尔德分校");
    await expect(card.getByText("最近采集", { exact: false })).toBeVisible();
    expect(requests.filter((url) => new URL(url).searchParams.get("endpoint") === "university")).toHaveLength(detailRequests.length);
    const reopenMs = Date.now() - reopened;
    expect(requests.some((url) => new URL(url).searchParams.get("endpoint") === "program-catalog")).toBe(false);

    await page.getByRole("button", { name: "关闭学校详情", exact: true }).click();
    let releaseSwitch!: () => void;
    const switchGate = new Promise<void>((resolve) => { releaseSwitch = resolve; });
    await page.route("**/api/pathos/preview?**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("endpoint") === "universities" && url.searchParams.get("state") === "CA") await switchGate;
      await route.continue();
    });
    await page.getByTestId("state-selector-button").click();
    const stateOptions = page.getByTestId("state-selector-dropdown").getByRole("option");
    await expect(stateOptions).toHaveCount(51);
    const switching = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.searchParams.get("endpoint") === "universities" && url.searchParams.get("state") === "CA";
    });
    await stateOptions.filter({ hasText: "加利福尼亚州" }).click();
    await switching;
    await expect(page.getByRole("region", { name: "学校结果列表" }).locator("button[data-school-row]").filter({ hasText: "科罗拉多大学博尔德分校" })).toBeVisible();
    await expect(page.getByText("正在更新范围，保留上次学校位置…")).toBeVisible();
    releaseSwitch();
    await expect(page.getByTestId("map-toolbar-view-mode")).toContainText("13 所学校", { timeout: 30000 });
    await page.unroute("**/api/pathos/preview?**");
    await expect(page).toHaveURL(/state=06/);
    const group = page.locator("button[data-cluster-count]").first();
    await expect(group).toBeInViewport({ timeout: 30000 });
    const groupCount = Number(await group.getAttribute("data-cluster-count"));
    await group.click();
    const nearby = page.getByRole("region", { name: "学校结果列表" });
    await expect(nearby.getByRole("heading", { name: /附近学校/ })).toBeVisible();
    await expect(nearby.locator("button[data-school-row]")).toHaveCount(groupCount);
    expect(new Set(await nearby.locator("button[data-school-row]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-school-row")))).size).toBe(groupCount);
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: resolve("test-results/map-school-group.png") });
    const hoverable = page.locator("button[data-school-id]").last();
    const hoverName = await hoverable.getAttribute("aria-label");
    await hoverable.hover();
    await expect(page.getByTestId("university-hover-tooltip")).toContainText(hoverName!);
    await chooseSchool(page, "斯坦福大学");
    const stanford = page.getByRole("button", { name: "斯坦福大学", exact: true });
    const stanfordCard = page.getByRole("dialog", { name: "斯坦福大学 详细信息" });
    await expect(stanfordCard.getByText("学校特色 · 编辑精选", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(stanfordCard.getByText("符号系统学", { exact: true })).toBeVisible();
    await expect(stanford).toHaveAttribute("aria-pressed", "true");
    // Cached details can arrive before the 400ms camera animation ends.
    // Compare projections only at the committed camera position, not with
    // the previous moveend's coordinates during a legitimate flyTo frame.
    await expect.poll(async () => stanford.evaluate((element) => {
      const center = (element.closest("[data-map-canvas-root]") as HTMLElement).dataset.mapCenter?.split(",").map(Number) ?? [];
      return Math.abs(center[0] + 122.167359) + Math.abs(center[1] - 37.429434);
    })).toBeLessThan(0.001);
    const projection = await stanford.evaluate((element) => {
      const root = element.closest("[data-map-canvas-root]") as HTMLElement;
      const canvas = root.querySelector("canvas")!;
      const marker = element.getBoundingClientRect(), bounds = root.getBoundingClientRect(), rendered = canvas.getBoundingClientRect();
      return { center: root.dataset.mapCenter, zoom: root.dataset.mapZoom, width: bounds.width, canvasWidth: rendered.width,
        expectedX: Number((element as HTMLElement).dataset.projectedX), expectedY: Number((element as HTMLElement).dataset.projectedY),
        actualX: marker.x + marker.width / 2 - bounds.x, actualY: marker.y + marker.height / 2 - bounds.y };
    });
    console.log(JSON.stringify({ phase: "projection", ...projection }));
    expect(Math.abs(projection.actualX - projection.expectedX)).toBeLessThan(3);
    expect(Math.abs(projection.actualY - projection.expectedY)).toBeLessThan(3);
    await mkdir("test-results", { recursive: true });
    const screenshot = resolve("test-results/map-repaired.png");
    await page.screenshot({ path: screenshot });
    await stanfordCard.getByRole("button", { name: /查看全部已收录专业/ }).click();
    const allPrograms = stanfordCard.getByRole("list", { name: "全部学校专业" });
    const stanfordCount = await allPrograms.getByRole("listitem").count();
    expect(stanfordCount).toBeGreaterThan(60);
    await stanfordCard.getByRole("textbox", { name: "搜索学校专业" }).fill("Symbolic");
    await expect(allPrograms.getByRole("listitem")).toHaveCount(1);
    await stanfordCard.getByRole("link", { name: "符号系统学", exact: false }).first().click();
    await expect(page).toHaveURL(/\/majors\/explore\?/);
    await expect(page.getByRole("heading", { name: "符号系统学", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("当前数据库已关联", { exact: false })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("斯坦福大学 · 当前学校", { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve("test-results/program-explorer.png") });

    // Intent-only program search: options are not part of initial map data.
    await page.getByRole("link", { name: "返回地图", exact: true }).click();
    await expect(page).toHaveURL(/program=Symbolic/);
    const programList = page.getByRole("region", { name: "学校结果列表" });
    await expect(programList.locator("button[data-school-row]")).toHaveCount(1, { timeout: 30000 });
    const detailCountBeforeFilter = requests.filter((url) => new URL(url).searchParams.get("endpoint") === "university").length;
    await page.getByTestId("program-filter-button").click();
    const picker = page.getByRole("region", { name: "专业筛选面板" });
    await picker.getByRole("textbox", { name: "搜索地图专业" }).fill("Symbolic");
    const symbolicOption = picker.getByRole("button").filter({ hasText: "Symbolic Systems" });
    await expect(symbolicOption).toContainText("1 校", { timeout: 30000 });
    const filtered = Date.now();
    await symbolicOption.click();
    await expect(programList.locator("button[data-school-row]")).toHaveCount(1);
    await expect(page).toHaveURL(/state=06/);
    expect(requests.filter((url) => new URL(url).searchParams.get("endpoint") === "university")).toHaveLength(detailCountBeforeFilter);
    const filterMs = Date.now() - filtered;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "学校结果列表" }).locator("button[data-school-row]")).toHaveCount(1, { timeout: 30000 });
    await chooseSchool(page, "斯坦福大学");
    await expect(page.getByRole("dialog", { name: "斯坦福大学 详细信息" }).getByText("符号系统学", { exact: true })).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: resolve("test-results/map-program-filtered.png") });

    await page.goto(`${origin}/map?state=46&region=safety&program=Symbolic%20Systems`, { waitUntil: "domcontentloaded" });
    const emptyList = page.getByRole("region", { name: "学校结果列表" });
    await expect(emptyList.getByText("当前条件下暂无已收录学校", { exact: false })).toBeVisible({ timeout: 30000 });
    await emptyList.getByRole("button", { name: "清除筛选，查看全部学校", exact: true }).click();
    await expect(page.getByTestId("map-toolbar-view-mode")).toContainText("94 所学校", { timeout: 30000 });
    expect(new URL(page.url()).searchParams.get("program")).toBeNull();
    expect(new URL(page.url()).searchParams.get("state")).toBeNull();
    expect(new URL(page.url()).searchParams.get("region")).toBe("safety");

    const strengthExamples = [
      { state: "25", name: "Massachusetts Institute of Technology", programs: ["机械工程", "化学工程", "经济学"], screenshot: "map-mit-strengths.png" },
      { state: "13", name: "Georgia Institute of Technology", programs: ["工业工程", "土木工程", "环境工程"], screenshot: "map-gatech-strengths.png" },
    ];
    for (const example of strengthExamples) {
      await page.goto(`${origin}/map?state=${example.state}`, { waitUntil: "domcontentloaded" });
      await chooseSchool(page, example.name);
      const strengths = page.getByRole("list", { name: "优势专业", exact: true });
      await expect(strengths.getByRole("listitem")).toHaveCount(3, { timeout: 30000 });
      for (const name of example.programs) await expect(strengths.getByRole("link", { name, exact: true })).toBeVisible();
      await expect(strengths.getByRole("listitem").first()).toContainText("2027 本科");
      if (example.state === "25") await expect(strengths.getByRole("listitem").filter({ hasText: "经济学" })).toContainText("并列#1");
      await page.screenshot({ path: resolve(`test-results/${example.screenshot}`) });
    }

    // Also check the university in the reported failed card, not just the
    // original Colorado smoke-test school.
    await page.goto(`${origin}/university/candidate-v2%3Auniversity-of-illinois-at-chicago`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "UIC", exact: true, level: 1 })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("学校详情加载失败", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: resolve("test-results/uic-profile-check.png"), fullPage: true });

    await page.goto(`${origin}/map?region=safety&state=26`, { waitUntil: "domcontentloaded" });
    const michigan = page.getByRole("button", { name: "密歇根大学安娜堡分校", exact: true });
    await expect(page.locator("button[data-school-id],button[data-cluster-count]").first()).toBeVisible({ timeout: 30000 });
    await chooseSchool(page, "密歇根大学安娜堡分校");
    const michiganCard = page.getByRole("dialog", { name: "密歇根大学安娜堡分校 详细信息" });
    await expect(michiganCard.getByText("Ann Arbor", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(michiganCard.getByText("最近采集", { exact: false })).toBeVisible({ timeout: 30000 });
    await expect(michiganCard.getByText("15.6%", { exact: true })).toBeVisible();
    await expect(michiganCard.getByText("$63,962/年", { exact: true })).toBeVisible();
    expect((await michiganCard.locator("ul").first().locator("li").first().innerText()).trim().length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    const reloaded = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("button[data-school-id],button[data-cluster-count]").first()).toBeVisible({ timeout: 30000 });
    const reloadMs = Date.now() - reloaded;
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(`${origin}/map?state=06`, { waitUntil: "domcontentloaded" });
    await expect(mobile.locator("button[data-school-id],button[data-cluster-count]").first()).toBeVisible({ timeout: 30000 });
    await mobile.setViewportSize({ width: 360, height: 844 });
    await mobile.getByTestId("program-filter-button").click();
    const mobilePicker = mobile.getByRole("region", { name: "专业筛选面板" });
    const chineseSearch = mobile.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.searchParams.get("endpoint") === "program-options" && url.searchParams.get("q") === "Computer Science";
    });
    await mobilePicker.getByRole("textbox", { name: "搜索地图专业" }).fill("计算机科学");
    expect((await chineseSearch).status()).toBe(200);
    await expect(mobilePicker.getByRole("button").filter({ hasText: "Computer Science" }).first()).toBeVisible();
    await mobilePicker.getByRole("textbox", { name: "搜索地图专业" }).fill("Symbolic");
    const mobileOption = mobilePicker.getByRole("button").filter({ hasText: "Symbolic Systems" });
    await expect(mobileOption).toBeVisible({ timeout: 30000 });
    const pickerBounds = await mobilePicker.boundingBox();
    expect(pickerBounds!.x).toBeGreaterThanOrEqual(0);
    expect(pickerBounds!.x + pickerBounds!.width).toBeLessThanOrEqual(360);
    await mobile.screenshot({ path: resolve("test-results/map-mobile-filter.png") });
    await mobileOption.click();
    const mobileList = mobile.getByRole("region", { name: "学校结果列表" });
    await expect(mobileList.locator("button[data-school-row]")).toHaveCount(1, { timeout: 30000 });
    await expect.poll(async () => {
      const toolbar = await mobile.getByTestId("map-toolbar").boundingBox(), list = await mobileList.boundingBox();
      return list!.y - toolbar!.y - toolbar!.height;
    }).toBeGreaterThanOrEqual(8);
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await mobile.setViewportSize({ width: 390, height: 844 });
    await chooseSchool(mobile, "斯坦福大学");
    const mobileCard = mobile.getByRole("dialog", { name: "斯坦福大学 详细信息" });
    await expect(mobile.getByTestId("bottom-sheet")).toHaveAttribute("data-snap", "half");
    await mobile.getByTestId("bottom-sheet").getByRole("button", { name: "展开", exact: true }).click();
    await expect(mobile.getByTestId("bottom-sheet")).toHaveAttribute("data-snap", "expanded");
    await expect(mobileCard.getByText("符号系统学", { exact: true })).toBeVisible({ timeout: 30000 });
    await mobileCard.getByRole("button", { name: /查看全部已收录专业/ }).click();
    await mobileCard.getByRole("textbox", { name: "搜索学校专业" }).fill("Symbolic");
    await expect(mobileCard.getByRole("list", { name: "全部学校专业" }).getByRole("listitem")).toHaveCount(1);
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await mobile.screenshot({ path: resolve("test-results/map-mobile.png") });
    await mobile.close();
    expect(errors).toEqual([]);
    const result = { ok: true, mapMs, firstMapResources, detailMs, reopenMs, reloadMs, filterMs, detailTransportRetries: detailRequests.length - 1, lazyDetail: true, detailCache: true,
      noEagerProgramIndex: true, retainedPointsWhileUpdating: true, stateOptions: 51, stateSwitch: true,
      stanfordCount, coloradoCount, groupCount, clusterSelection: true, programFilter: true, filterRestored: true, emptyResultsRecovery: true,
      distinctiveProgram: true, verifiedStrengths: 6, programNavigation: true, fullProfile: true, michiganDetail: true, mobileCard: true, narrowMobileFilter: true, chineseProgramSearch: true, pageErrors: errors, screenshot };
    await writeFile("test-results/map-runtime-check.json", JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: resolve("test-results/map-runtime-failure.png") }).catch(() => {});
    console.error(JSON.stringify({ pageErrors: errors, visibleText: (await page.locator("body").innerText()).slice(0, 5000) }));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
