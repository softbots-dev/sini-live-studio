/*
  Poller Performa LIVE (GET /v1/me/channel/live-stats): ambil saat siaran mulai, lalu tiap 30 dtk; event
  pengguna `stats.changed` (gift baru) memanggil `refresh()` — dibatasi 1× per 5 dtk supaya gift beruntun
  tidak membanjiri API. Berhenti = timer batal + kabar { session: null } (tampilan kembali ke keadaan kosong).
  Jam & timer disuntikkan — diuji test/perf.test.mjs.
*/
export const PERF_INTERVAL_MS = 30_000;
export const PERF_MIN_GAP_MS = 5_000;

export function createPerfPoller({ fetch, now, setTimer, clearTimer, onChange }) {
  let running = false;
  let timer = null;
  let lastAt = -Infinity;
  let generation = 0;

  function schedule() {
    if (timer !== null) clearTimer(timer);
    timer = running ? setTimer(tick, PERF_INTERVAL_MS) : null;
  }

  function tick() {
    if (!running) return;
    const my = generation;
    lastAt = now();
    schedule();
    void Promise.resolve()
      .then(fetch)
      .then((value) => {
        if (running && my === generation) onChange(value);
      })
      .catch(() => {});
  }

  return {
    start() {
      if (running) return;
      running = true;
      generation++;
      tick();
    },
    refresh() {
      if (!running || now() - lastAt < PERF_MIN_GAP_MS) return;
      tick();
    },
    stop() {
      if (!running) return;
      running = false;
      generation++;
      schedule();
      onChange({ session: null });
    },
  };
}
