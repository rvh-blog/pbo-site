import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Run only against scripts/prepare-weekly-preview.mjs's disposable local copy.
const fixturePath = process.env.WEEKLY_FIXTURE_PATH;
const fixture: { seasonId: number; divisionId: number; week: number; teamId: number; id: number; token: string } | null =
  fixturePath ? JSON.parse(readFileSync(fixturePath, "utf8")) : null;
test.skip(!fixture, "Set WEEKLY_FIXTURE_PATH to an isolated preview fixture.");

test.beforeEach(async ({ page, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.route(/googletagmanager|google-analytics|twitch\.tv/, (route) => route.abort());
});

test("weekly dashboard opens the correct prep and pick-em week", async ({ page, baseURL }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Week" })).toHaveCount(0);
  await page.context().addCookies([{ name: "pbo-user-session", value: fixture!.token, url: baseURL!, httpOnly: true }]);
  await page.reload();
  const panel = page.locator('section[aria-labelledby="your-week-title"]');
  await expect(panel.getByRole("heading", { name: "Your Week" })).toBeVisible();
  await expect(panel.locator("time").first()).toBeVisible();
  await expect(panel.getByRole("link", { name: "Match Prep", exact: true })).toHaveAttribute("href", new RegExp(`matchId=${fixture!.id}`));
  await expect(panel.getByRole("link", { name: /Review picks|Join pick-ems/ })).toHaveAttribute("href", new RegExp(`week=${fixture!.week}`));
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("your-week.png") });
  await panel.getByRole("link", { name: "Match Prep", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Continue exploring this division" })).toContainText(`Week ${fixture!.week}`);
  await expect(page.getByRole("combobox").nth(3)).toHaveValue(String(fixture!.id));
});

test("schedule context survives stats, reload, and return navigation", async ({ page }, testInfo) => {
  await page.goto(`/seasons/${fixture!.seasonId}/divisions/${fixture!.divisionId}?week=${fixture!.week}&teamId=${fixture!.teamId}#schedule`);
  const journey = page.getByRole("navigation", { name: "Continue exploring this division" });
  await expect(journey).toBeVisible();
  await expect(page.getByRole("button", { name: `Week ${fixture!.week}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  const prep = page.getByRole("link", { name: "Scout matchup", exact: true }).first();
  await expect(prep).toHaveAttribute("href", new RegExp(`matchId=${fixture!.id}`));
  const bounds = await prep.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("#schedule").screenshot({ path: testInfo.outputPath("schedule.png") });
  await journey.getByRole("link", { name: "Compare coaches", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`season=${fixture!.seasonId}`), { timeout: 20_000 });
  await page.reload();
  await page.getByRole("navigation", { name: "Continue exploring this division" }).getByRole("link", { name: "Item stats" }).click();
  await expect(page).toHaveURL(new RegExp(`seasonId=${fixture!.seasonId}`), { timeout: 20_000 });
  await expect(page.getByRole("combobox", { name: "Season", exact: true })).toHaveValue("11");
  await page.reload();
  await page.getByRole("navigation", { name: "Continue exploring this division" }).getByRole("link", { name: "Schedule", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`week=${fixture!.week}&teamId=${fixture!.teamId}`));
  await expect(page.getByRole("button", { name: `Week ${fixture!.week}`, exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("stats discovery has useful entry points without mobile overflow", async ({ page }, testInfo) => {
  await page.goto("/leaderboards");
  const discovery = page.locator('section[aria-labelledby="stats-explore-title"]');
  await expect(discovery.getByRole("link")).toHaveCount(4);
  await discovery.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("stats-discovery.png") });
});
