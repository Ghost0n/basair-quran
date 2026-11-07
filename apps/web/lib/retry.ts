/**
 * Load something the app can't do without (a catalogue: reciters, surahs…)
 * until it arrives. A cold start can ask before the network or the device
 * databases are ready, and a failed first load used to leave the catalogue
 * empty until the screens were rebuilt (switching the interface language
 * did that, which is why the data "came back" then). Retries back off
 * (1 s, 2 s, 4 s … up to 30 s) and also run as soon as the connection
 * returns or the app comes back to the foreground. Returns a cancel function.
 */
export function loadUntilReady<T>(load: () => Promise<T>, onReady: (value: T) => void): () => void {
  let cancelled = false;
  let timer: number | null = null;
  let attempt = 0;
  let inFlight = false;

  const run = () => {
    if (cancelled || inFlight) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    inFlight = true;
    load().then(
      (value) => {
        inFlight = false;
        if (cancelled) return;
        cleanup();
        onReady(value);
      },
      () => {
        inFlight = false;
        if (cancelled) return;
        attempt += 1;
        timer = window.setTimeout(run, Math.min(30000, 1000 * 2 ** (attempt - 1)));
      },
    );
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };
  function cleanup() {
    if (timer !== null) window.clearTimeout(timer);
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", onVisible);
  }

  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", onVisible);
  run();
  return () => {
    cancelled = true;
    cleanup();
  };
}
