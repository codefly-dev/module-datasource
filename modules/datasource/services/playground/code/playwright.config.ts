import { defineConfig } from "@playwright/test";

// The playground's port is allocated per run by codefly, so it is given rather
// than written down: `codefly endpoint` resolves it, or PLAYGROUND_URL carries
// it. There is no default — a suite that silently targeted the wrong port would
// report on something other than this run.
const baseURL = process.env.PLAYGROUND_URL;
if (!baseURL) {
  throw new Error("PLAYGROUND_URL is required: the playground's port is allocated per run");
}

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/wait-for-playground.ts",
  // Outside code/, because the agent hot-reloads on any change under it: a run
  // that wrote its screenshots there restarted the server it was driving, and
  // the next test met ERR_CONNECTION_REFUSED. The artefacts are evidence of a
  // run, not source.
  outputDir: "../.playwright",
  // Each journey drives real services; none of them is fast, and two running
  // at once would interleave writes into the same tenant bucket.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
