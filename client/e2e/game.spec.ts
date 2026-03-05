import { test, expect, type Page } from "@playwright/test";

async function getHealth(page: Page): Promise<number> {
  const text = await page.getByTestId("hud-health").innerText();
  return parseInt(text.match(/\d+/)?.[0] ?? "0");
}

async function waitForHealthChange(page: Page, prev: number) {
  // Wait for Torii to push the state update
  await expect(async () => {
    expect(await getHealth(page)).not.toBe(prev);
  }).toPass({ timeout: 15_000 });
}

test("e2e: spawn, move, dig", async ({ page }) => {
  await page.goto("/");

  // Connect wallet + auto-spawn
  const startBtn = page.getByTestId("start-digging");
  await expect(startBtn).toBeVisible({ timeout: 15_000 });
  await startBtn.click();

  // Wait for game to load — HUD appearing means spawn + Torii subscription worked
  const hudLevel = page.getByTestId("hud-level");
  await expect(hudLevel).toBeVisible({ timeout: 30_000 });
  await expect(hudLevel).toContainText("1");

  // Verify initial health > 0
  const initialHealth = await getHealth(page);
  expect(initialHealth).toBeGreaterThan(0);

  // Move around until we find a diggable tile. Alternate directions to cover ground.
  // Each move costs 1 health, so we have a natural budget.
  const directions = ["move-east", "move-south", "move-west", "move-north"];
  const digBtn = page.getByTestId("dig");
  let dug = false;
  let health = initialHealth;

  for (let i = 0; i < 8 && !dug; i++) {
    // Check if current tile is diggable before moving
    if (await digBtn.isEnabled()) {
      const goldBefore = await page.getByTestId("hud-gold").innerText();
      await digBtn.click();
      // Wait for state update — either gold or health changes
      await expect(async () => {
        const goldAfter = await page.getByTestId("hud-gold").innerText();
        const healthAfter = await getHealth(page);
        expect(goldAfter !== goldBefore || healthAfter !== health).toBe(true);
      }).toPass({ timeout: 15_000 });
      health = await getHealth(page);
      dug = true;
      break;
    }

    // Move in a direction
    const dir = directions[i % directions.length];
    const healthBefore = health;
    await page.getByTestId(dir).click();
    await waitForHealthChange(page, healthBefore);
    health = await getHealth(page);

    if (health === 0) break; // Game over
  }

  expect(dug).toBe(true);

  // Player marker should be visible on the grid
  await expect(page.getByTestId("player-marker")).toBeVisible();
});
