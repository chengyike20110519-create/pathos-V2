import { expect, test, type Page, type Response } from "@playwright/test";

const MAIN_ROUTES = [
  "/",
  "/map",
  "/university/princeton-university",
  "/compare?ids=princeton-university,harvard-university",
  "/trends?ids=princeton-university,harvard-university",
  "/costs",
  "/s/home",
];

async function open(page: Page, pathname: string) {
  let response: Response | null = null;
  try {
    response = await page.goto(pathname, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("net::ERR_NETWORK_IO_SUSPENDED")) {
      throw error;
    }
    await page.waitForTimeout(500);
    response = await page.goto(pathname, { waitUntil: "domcontentloaded" });
  }
  expect(response, `Failed to open ${pathname}`).not.toBeNull();
  expect(response!.status(), `Unexpected status for ${pathname}`).toBe(200);
  await page.waitForLoadState("load");
}

test("homepage renders the information-platform entry", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "/");

  await expect(page.getByRole("heading", { level: 1, name: "快速读懂美国大学，看清数据与趋势" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "从找到学校到看清趋势的研究路径" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "三步完成一次学校研究" })).toBeVisible();
  await expect(page.getByRole("link", { name: "趋势分析" })).toBeVisible();
});

test("core enterprise surfaces share one page heading and no duplicate ids", async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of ["/search?q=computer", "/costs", "/deadlines", "/guides", "/news"]) {
    await open(page, route);
    await expect(page.locator("h1")).toHaveCount(1);
    const duplicateIds = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(duplicateIds, route).toEqual([]);
  }
});

test("university detail connects comparison, cost, and shortlists", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "/university/princeton-university");
  await expect(page.getByRole("heading", { level: 1, name: "普林斯顿大学" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /加入对比|已在对比/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "3 分钟学校速览" })).toBeVisible();
  await expect(page.getByText("核心字段覆盖")).toBeVisible();
  await expect(page.getByText("不把 Preview 数据包装成已审核事实")).toBeVisible();
  await expect(page.getByRole("link", { name: "计算费用" })).toBeVisible();

  await page.getByRole("button", { name: "加入清单" }).click();
  const dialog = page.getByRole("dialog", { name: /普林斯顿大学/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/请先登录|数据库未配置|清单服务暂不可用/)).toBeVisible();
});

test("trend lab keeps URL schools and fails closed without fabricated series", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "/trends?ids=princeton-university,harvard-university&metric=tuitionUSD");
  const cookieNecessary = page.getByRole("button", { name: "仅必要" });
  if (await cookieNecessary.isVisible().catch(() => false)) {
    await cookieNecessary.click();
  }

  await expect(page.getByRole("heading", { level: 1, name: "趋势台" })).toBeVisible();
  await expect(page.getByRole("link", { name: "普林斯顿大学" })).toBeVisible();
  await expect(page.getByRole("link", { name: "哈佛大学" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "学费数据准备状态" })).toBeVisible();
  await expect(page.getByText("当前快照").first()).toBeVisible();
  await expect(page.getByText("不插值、不预测")).toBeVisible();
  expect(page.url()).toContain("metric=tuitionUSD");
  await expect(page.getByRole("heading", { name: "选择大学加入趋势" })).toHaveCount(0);

  await page.getByRole("button", { name: "添加学校" }).click();
  const picker = page.getByRole("dialog", { name: "选择大学加入趋势" });
  await expect(picker).toBeVisible();
  await picker.locator('[data-picker-row-id="massachusetts-institute-of-technology"]').click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("button", { name: "移除麻省理工学院" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除哈佛大学" })).toBeVisible();
  expect(page.url()).toContain("ids=princeton-university%2Charvard-university");
});

test("research desk turns a question into a school and evidence collection", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "/research");
  const cookieNecessary = page.getByRole("button", { name: "仅必要" });
  if (await cookieNecessary.isVisible().catch(() => false)) {
    await cookieNecessary.click();
  }

  await expect(page.getByRole("heading", { level: 1, name: "我的研究台" })).toBeVisible();
  await expect(page.getByText("V1 研究问题与证据保存在本机浏览器")).toBeVisible();

  await page.getByPlaceholder("AI + 医疗方向有哪些本科机会？").fill("AI + 医疗方向有哪些本科机会？");
  await page
    .getByPlaceholder("我想核对项目设置、官方公告、相关指标和同类学校变化。")
    .fill("核对本科项目、官方公告和同类学校变化。");
  await page.getByRole("button", { name: "建立研究问题" }).click();
  await expect(page.getByRole("button", { name: /^AI \+ 医疗方向有哪些本科机会？/ })).toBeVisible();

  await page.getByRole("button", { name: "添加学校" }).click();
  const picker = page.getByRole("dialog", { name: "选择大学加入研究" });
  await picker.locator('[data-picker-row-id="princeton-university"]').click();
  await expect(page.getByRole("link", { name: "普林斯顿大学" })).toBeVisible();

  await page
    .getByPlaceholder("记录一个事实、变化或待核对问题")
    .fill("需核对学校是否已有 AI + 医疗交叉项目。");
  await page.getByPlaceholder("https://...").fill("https://www.princeton.edu/");
  await page.getByRole("button", { name: "保存证据" }).click();
  await expect(page.getByText("需核对学校是否已有 AI + 医疗交叉项目。")).toBeVisible();
  await expect(page.getByRole("link", { name: "打开来源" })).toHaveAttribute(
    "href",
    "https://www.princeton.edu/",
  );

  const stored = await page.evaluate(() => localStorage.getItem("pathos:research-projects"));
  expect(stored).toContain("AI + 医疗方向有哪些本科机会？");
  expect(stored).toContain("princeton-university");
  expect(stored).toContain("https://www.princeton.edu/");
});

test("interactive map leaves its loading state and renders controls", async ({ page }) => {
  await open(page, "/map");

  const loading = page.getByRole("status").filter({ hasText: "加载地图中" });
  await expect(loading).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "选择区域图层" })).toBeVisible();
});

test("compare renders a two-school matrix with explicit preview provenance", async ({ page }) => {
  await open(page, "/compare?ids=princeton-university,harvard-university");

  await expect(page.getByRole("heading", { level: 1, name: "学校对比工作台" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /普林斯顿大学/ })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /哈佛大学/ })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "字段" })).toBeVisible();
  await expect(table.getByText("Preview").first()).toBeVisible();
});

test("major catalog and computer-science profile render from stable slugs", async ({ page }) => {
  await open(page, "/majors");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByText("专业档案").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "计算机科学" })).toBeVisible();

  await open(page, "/majors/computer-science");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "申请要求" })).toBeVisible();
  await expect(page.getByText("尚未采集或尚未完成审核").first()).toBeVisible();
});

test("application deadlines fail closed without fabricating dates", async ({ page }) => {
  await open(page, "/deadlines");

  const alert = page.getByRole("alert").filter({ hasText: "申请日历暂不可用" });
  await expect(alert).toBeVisible();
  await expect(alert.getByText("已审核事实层暂不可用")).toBeVisible();
});

test("cost center keeps selection state and reports unavailable facts", async ({ page }) => {
  await open(page, "/costs");
  await expect(page.getByRole("heading", { level: 1, name: "成本与奖学金中心" })).toBeVisible();
  await expect(page.getByText("选择学校后生成预算")).toBeVisible();
  await expect(page.getByRole("button", { name: /^选择$/ })).toBeEnabled();

  await page.getByRole("button", { name: /^选择$/ }).click();
  await page.locator('[data-picker-row-id="princeton-university"]').click();
  await expect(page.getByText("普林斯顿大学").first()).toBeVisible();

  await page.getByRole("button", { name: "生成预算" }).click();
  await expect(page.getByText(/成本事实层暂不可用：/)).toBeVisible();
});

test("global search falls back to preview schools and local major profiles", async ({ page }) => {
  await open(page, "/search?q=computer");
  await expect(page.getByRole("heading", { level: 2, name: "专业" })).toBeVisible();
  await expect(page.getByRole("link", { name: /计算机科学/ }).first()).toBeVisible();
  await expect(page.getByText("已自动保留 Preview 学校与本地专业检索。")).toBeVisible();

  await page.getByLabel("全局搜索").fill("Princeton");
  await expect(page.getByText("普林斯顿大学").first()).toBeVisible();
  await expect(page.getByText("Preview", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "保存搜索" }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Princeton", exact: true })).toBeVisible();
});

test("opportunities feed fails closed without promoting unreviewed records", async ({ page }) => {
  await open(page, "/opportunities");

  const alert = page.getByRole("alert").filter({ hasText: "机会动态暂不可用" });
  await expect(alert).toBeVisible();
  await expect(alert.getByText("已审核事件层暂不可用")).toBeVisible();
});

test("university cost answer card exposes traceable evidence and boundaries", async ({ page }) => {
  await open(page, "/topics/us-university-cost-comparison");

  await expect(page.getByRole("heading", { level: 1, name: "美国大学学费成本对比" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "PathOS 答案" })).toBeVisible();
  await expect(page.getByText("Traceable preview").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "结论边界" })).toBeVisible();
});

test("student workbench renders with fact coverage degraded transparently", async ({ page }) => {
  await open(page, "/s/home");

  await expect(page.getByText("学生数据工作台").first()).toBeVisible();
  await expect(page.getByText("已审核事实覆盖").first()).toBeVisible();
  await expect(page.getByText(/暂不可用/).first()).toBeVisible();
});

test("core information-platform routes have no horizontal overflow at 390px", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of MAIN_ROUTES) {
    await open(page, route);
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth;
    });
    expect(overflow, `${route} overflows horizontally at 390px`).toBeLessThanOrEqual(1);
  }
});

test("deadline and search information APIs return 503 with no-store", async ({ request }) => {
  const endpoints = [
    "/api/information/deadlines",
    "/api/information/search?q=computer&limit=8",
  ];

  for (const endpoint of endpoints) {
    const response = await request.get(endpoint);
    expect(response.status(), endpoint).toBe(503);
    expect(response.headers()["cache-control"], endpoint).toContain("no-store");

    const body = await response.json();
    expect(body.ok, endpoint).toBe(false);
    expect(typeof body.code, endpoint).toBe("string");
  }
});
