/**
 * 冒烟：依赖本机已启动 http://127.0.0.1:8765 静态目录（含 特价机票发现平台.html）
 * 运行：npx --yes -p playwright node smoke-playwright.mjs
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8765";
const PAGE_URL = `${BASE}/${encodeURIComponent("特价机票发现平台.html")}`;

const issues = [];

function assert(cond, msg) {
  if (!cond) issues.push(msg);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") issues.push(`console[error]: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    issues.push(`pageerror: ${err.message}`);
  });

  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  /** 顶栏 Tab：每个面板应激活 */
  const panels = ["home", "search", "explore", "alerts", "saved", "rules"];
  for (const id of panels) {
    await page.locator(`[data-panel="${id}"]`).click();
    await page.waitForTimeout(150);
    assert(
      await page.locator(`#panel-${id}`).evaluate((el) => el.classList.contains("active")),
      `nav tab "${id}" 应激活 #panel-${id}`
    );
  }

  /** Logo 回首页 */
  await page.locator("#logo-home").click();
  await page.waitForTimeout(100);
  assert(
    await page.locator("#panel-home").evaluate((el) => el.classList.contains("active")),
    "点击 logo 应回到首页"
  );

  /** 首页 CTA */
  await page.locator("#hero-to-search").click();
  await page.waitForTimeout(100);
  assert(
    await page.locator("#panel-search").evaluate((el) => el.classList.contains("active")),
    "hero 去搜索 应打开搜索页"
  );
  await page.locator("#logo-home").click();
  await page.locator("#hero-to-explore").click();
  await page.waitForTimeout(100);
  assert(
    await page.locator("#panel-explore").evaluate((el) => el.classList.contains("active")),
    "hero 去探索 应打开探索页"
  );

  /** 探索卡片 → 搜索 */
  await page.locator(".dest-card").first().click();
  await page.waitForTimeout(400);
  assert(
    await page.locator("#panel-search").evaluate((el) => el.classList.contains("active")),
    "点击探索卡片应切到搜索"
  );

  /** 搜索：北京 → 上海，结果与低价日历 */
  await page.locator("#q-origin").fill("北京");
  await page.locator("#q-dest").fill("上海");
  await page.waitForTimeout(600);
  const rc = await page.locator("#result-count").textContent();
  assert(rc && parseInt(rc, 10) > 0, `应有搜索结果，result-count=${rc}`);

  /** 价格详情弹层 + 关闭 */
  await page.locator("#search-results [data-detail-id]").first().click();
  await page.waitForTimeout(250);
  assert((await page.locator("#price-modal.open").count()) === 1, "点击「详情」应打开价格弹层");
  await page.locator("#price-modal-close").click();
  await page.waitForTimeout(150);
  assert((await page.locator("#price-modal.open").count()) === 0, "关闭按钮应收起弹层");

  /** 交换出发/到达 */
  const o0 = await page.locator("#q-origin").inputValue();
  const d0 = await page.locator("#q-dest").inputValue();
  await page.locator("#btn-swap-od").click();
  await page.waitForTimeout(250);
  assert(
    (await page.locator("#q-origin").inputValue()) === d0 && (await page.locator("#q-dest").inputValue()) === o0,
    "交换按钮应对调 O/D"
  );
  await page.locator("#btn-swap-od").click();
  await page.waitForTimeout(150);

  await page.locator("#price-calendar-wrap").waitFor({ state: "visible", timeout: 8000 });
  const calBtn = page.locator("#price-calendar-strip [data-cal-iso]").nth(2);
  const targetIso = await calBtn.getAttribute("data-cal-iso");
  await calBtn.click();
  await page.waitForTimeout(400);
  const depAfter = await page.locator("#q-depart").inputValue();
  assert(depAfter === targetIso, `点击日历应改出发日: 期望 ${targetIso} 实际 ${depAfter}`);

  /** 保存方案 + 订阅页应用 */
  await page.locator("#preset-name-input").fill("e2e-" + Date.now());
  await page.locator("#btn-save-preset").click();
  await page.waitForTimeout(200);
  await page.locator("#btn-goto-alerts").click();
  await page.waitForTimeout(200);
  assert(
    await page.locator("#panel-alerts").evaluate((el) => el.classList.contains("active")),
    "管理方案与低价提醒 应打开订阅页"
  );
  const presetCount = await page.locator("#preset-list li").count();
  assert(presetCount >= 1, "方案列表应至少 1 条");
  await page.locator("#preset-list [data-preset-apply]").first().click();
  await page.waitForTimeout(400);
  assert(
    await page.locator("#panel-search").evaluate((el) => el.classList.contains("active")),
    "应用方案应回到搜索"
  );

  /** 低价提醒 */
  await page.locator('[data-panel="alerts"]').click();
  await page.locator("#alert-max-yuan").fill("999999");
  await page.locator("#btn-add-alert").click();
  await page.waitForTimeout(200);
  const alertCount = await page.locator("#alert-list li").count();
  assert(alertCount >= 1, "提醒列表应至少 1 条");
  await page.locator("#alert-list [data-alert-del]").first().click();
  await page.waitForTimeout(150);
  /** 删光测试提醒（可能多条） */
  while ((await page.locator("#alert-list [data-alert-del]").count()) > 0) {
    await page.locator("#alert-list [data-alert-del]").first().click();
    await page.waitForTimeout(80);
  }

  /** 清理测试方案名 e2e- 前缀 */
  await page.locator("#preset-list [data-preset-del]").first().click();
  await page.waitForTimeout(100);

  /** 收藏：顶栏进入「我的收藏」，对比浮条仅在加入对比后可见 */
  await page.locator('[data-panel="search"]').click();
  await page.waitForTimeout(300);
  const favBtn = page.locator("#search-results [data-action='fav']").first();
  if ((await favBtn.count()) > 0) {
    await favBtn.click();
    await page.waitForTimeout(150);
    await page.locator('[data-panel="saved"]').click();
    await page.waitForTimeout(250);
    assert(
      await page.locator("#panel-saved").evaluate((el) => el.classList.contains("active")),
      "顶栏「我的收藏」应打开收藏页"
    );
    const favEmptyHidden = await page.locator("#fav-empty").evaluate((el) => el.style.display === "none");
    assert(favEmptyHidden, "收藏一条后列表不应为空态");
    await page.locator('[data-panel="search"]').click();
    await page.waitForTimeout(400);
    await page.locator("#search-results [data-action='fav']").first().click();
    await page.waitForTimeout(100);
  }

  const cmpBtn = page.locator("#search-results [data-action='cmp']").first();
  if ((await cmpBtn.count()) > 0) {
    await cmpBtn.click();
    await page.waitForTimeout(200);
    await page.locator("#compare-bar.visible #btn-goto-saved").click({ timeout: 5000 });
    await page.waitForTimeout(200);
    assert(
      await page.locator("#panel-saved").evaluate((el) => el.classList.contains("active")),
      "加入对比后浮条「查看对比表」应可点并打开收藏页"
    );
    await page.locator('[data-panel="search"]').click();
    await page.waitForTimeout(400);
    await page.locator("#search-results [data-action='cmp']").first().click();
    await page.waitForTimeout(100);
  }

  /** 页脚按钮 */
  await page.locator("#foot-rules").click();
  await page.waitForTimeout(150);
  assert(
    await page.locator("#panel-rules").evaluate((el) => el.classList.contains("active")),
    "退改签说明 应打开规则页"
  );
  await page.locator("#foot-service").click();
  await page.waitForTimeout(200);
  const toastVis = await page.locator("#app-toast.visible").count();
  assert(toastVis >= 1, "联系客服 应出现 toast");
  await page.locator("#foot-about").click();
  await page.waitForTimeout(200);
  assert((await page.locator("#app-toast.visible").count()) >= 1, "关于 应出现 toast");

  /** 单程切换（UI 有反应） */
  await page.locator('[data-panel="search"]').click();
  await page.locator("#trip-oneway").click();
  await page.waitForTimeout(200);
  assert(
    await page.locator("#q-return").evaluate((el) => el.disabled === true),
    "单程模式下返程输入应禁用"
  );
  await page.locator("#trip-round").click();
  await page.waitForTimeout(150);

  await browser.close();

  if (issues.length) {
    console.error("FAIL\n" + issues.join("\n"));
    process.exit(1);
  }
  console.log(
    "OK smoke-playwright: 顶栏各页、首页 CTA、探索进搜索、搜索/详情弹层、O/D 交换、低价日历、方案保存与应用、低价提醒增删、收藏页、对比浮条、页脚、单程切换 均通过"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
