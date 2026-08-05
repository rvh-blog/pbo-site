import { expect, test, type Page } from "@playwright/test";

const seasonId = process.env.VISUAL_SEASON_ID ?? "10";
const divisionId = process.env.VISUAL_DIVISION_ID ?? "30";
const matchId = process.env.VISUAL_MATCH_ID ?? "2618";

const publicPages = [
  { name: "home", path: "/" },
  { name: "seasons", path: "/seasons" },
  { name: "division-standings", path: `/seasons/${seasonId}/divisions/${divisionId}` },
  { name: "fantasy", path: "/fantasy" },
  { name: "matchup-prep", path: `/matchup-prep?matchId=${matchId}` },
  { name: "battle-record", path: "/battle-record" },
] as const;

const publicSections = [
  {
    name: "division-standings-section",
    path: `/seasons/${seasonId}/divisions/${divisionId}`,
    selector: "#standings",
  },
  {
    name: "fantasy-team-leaderboard-section",
    path: "/fantasy",
    selector: "#team-leaderboard",
  },
] as const;

async function preparePage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("pbo-theme", "dark");
  });

  await page.route(/googletagmanager|google-analytics|twitch\.tv/, (route) => route.abort());
}

async function openStablePage(page: Page, path: string) {
  await preparePage(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#main-content")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const pageCase of publicPages) {
  test(`${pageCase.name} visual`, async ({ page }) => {
    await openStablePage(page, pageCase.path);

    await expect(page).toHaveScreenshot(`${pageCase.name}.png`, {
      fullPage: false,
      stylePath: "tests/visual/visual-test.css",
    });
  });
}

for (const sectionCase of publicSections) {
  test(`${sectionCase.name} visual`, async ({ page }) => {
    await openStablePage(page, sectionCase.path);
    await page.locator(".site-navigation, .mobile-section-nav, .skip-link").evaluateAll((elements) => {
      for (const element of elements) {
        (element as HTMLElement).style.visibility = "hidden";
      }
    });
    const section = page.locator(sectionCase.selector);
    await expect(section).toBeVisible();

    await expect(section).toHaveScreenshot(`${sectionCase.name}.png`, {
      stylePath: [
        "tests/visual/visual-test.css",
        "tests/visual/visual-section-test.css",
      ],
    });
  });
}
