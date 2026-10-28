import { expect, test, type Page } from "@playwright/test";

// The scenarios the shell offers, by the label a person actually reads.
const SCENARIOS = [
  "Start here",
  "The catalog",
  "Describe",
  "List a source",
  "Fetch an item",
  "No credential, no read",
  "This run",
] as const;

// Wait until no call on the pane is still in flight. A scenario that makes
// none settles immediately — which is why settled() alone never proves a call
// happened; use completed() after driving an action.
async function settled(page: Page) {
  await expect(page.getByText("Running", { exact: true })).toHaveCount(0, { timeout: 30_000 });
}

// A driven action must leave a call in a terminal state. Without this, a
// mis-aimed click reads exactly like a passing test.
async function completed(page: Page, calls: number) {
  await settled(page);
  await expect(page.getByText(/^(Done|Failed)$/)).toHaveCount(calls, { timeout: 30_000 });
}

async function open(page: Page, label: string) {
  await page.goto("/");
  await page.getByRole("button", { name: label, exact: false }).first().click();
}

test("every scenario the shell offers is reachable and renders", async ({ page }, info) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  for (const label of SCENARIOS) {
    await page.getByRole("button", { name: label, exact: false }).first().click();
    // The scenario's own heading is what proves the pane changed, rather than
    // the nav item merely being marked active.
    await expect(page.getByRole("heading", { name: label, exact: false }).first()).toBeVisible();
    // A scenario's calls run on arrival. Screenshotting before they settle
    // captures "Running…", which says nothing about whether the live services
    // answered — the whole point of the capture.
    await settled(page);
    await page.screenshot({ path: `${info.outputDir}/scenario-${label.replace(/[^a-z]+/gi, "-").toLowerCase()}.png`, fullPage: true });
  }
});

// Driving a journey's own actions is what verifies it. Navigating to a pane
// only proves the pane renders — every call below is one a presenter makes.

test("the tenant's documents are written, listed, and fetched byte for byte", async ({ page }, info) => {
  await open(page, "List a source");
  await page.getByRole("button", { name: /Write the \d+ documents/ }).click();
  await completed(page, 1);
  await page.getByRole("button", { name: "List the first page" }).click();
  await completed(page, 2);
  // A listing that came back is not enough: it has to carry the documents just
  // written, each with the opaque version the store gave it.
  await expect(page.getByText(/item\(s\)|key/i).first()).toBeVisible();
  await page.screenshot({ path: `${info.outputDir}/journey-list.png`, fullPage: true });

  await page.getByRole("button", { name: "Fetch an item", exact: false }).first().click();
  await expect(page.getByRole("heading", { name: "Fetch an item" }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Fetch [a-z0-9-]+\.[a-z]+$/ }).first().click();
  await completed(page, 1);
  // The whole point of the journey: what came back is what was written.
  await expect(page.getByText(/byte|identical|match/i).first()).toBeVisible();
  await page.screenshot({ path: `${info.outputDir}/journey-fetch.png`, fullPage: true });
});

test("a read with no usable credential is refused, in every form it can take", async ({ page }, info) => {
  await open(page, "No credential, no read");
  for (const carried of ["No credential", "An access key with no secret", "Someone else's access key"]) {
    await page.getByRole("button", { name: carried, exact: false }).first().click();
    await page.getByRole("button", { name: "Try the read" }).click();
    await completed(page, 1);
    // The datasource must refuse. A read that succeeded here would mean one
    // tenant's source is readable with the deployment's own access.
    await expect(page.getByText(/refus|denied|invalid|unauthenticated|permission/i).first()).toBeVisible();
    await page.screenshot({ path: `${info.outputDir}/journey-refused-${carried.replace(/[^a-z]+/gi, "-").toLowerCase()}.png`, fullPage: true });
  }
});
