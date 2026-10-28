// The playground hot-reloads: any edit under code/ restarts it, and a suite
// that began during a restart met ERR_CONNECTION_REFUSED on its first
// navigation while later tests passed — a failure that looks like the product
// and is not. Waiting for the app to answer makes the run's start a fact
// rather than a race.
export default async function waitForPlayground() {
  const url = process.env.PLAYGROUND_URL;
  if (!url) throw new Error("PLAYGROUND_URL is required");
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Not up yet; a restart in progress refuses the connection outright.
    }
    if (Date.now() > deadline) {
      throw new Error(`the playground at ${url} never answered; is the composition running?`);
    }
    await new Promise((wake) => setTimeout(wake, 500));
  }
}
