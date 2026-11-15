/*
  Poller ranking widget (GET /v1/channels/<slug>/supporters?scope=live): ambil saat live mulai, lalu tiap 60 dtk.
  Gift masuk → `nudge()`: ambil lagi paling cepat 10 dtk sejak ambil terakhir — DITUNDA, bukan dibuang, supaya
  gift tepat setelah ambil tetap muncul. Berhenti = timer batal + kabar [] (widget kembali kosong).
*/
export const RANKING_INTERVAL_MS = 60_000;
export const RANKING_MIN_GAP_MS = 10_000;

export function createRankingPoller({ fetch, now, setTimer, clearTimer, onChange }) {
  let running = false;
  let timer = null;
  let timerAt = Infinity;
  let lastAt = -Infinity;
  let generation = 0;

  function at(when) {
    if (timer !== null) clearTimer(timer);
    timerAt = when;
    timer = setTimer(tick, Math.max(0, when - now()));
  }

  function tick() {
    timer = null;
    timerAt = Infinity;
    if (!running) return;
    const my = generation;
    lastAt = now();
    at(lastAt + RANKING_INTERVAL_MS);
    void Promise.resolve()
      .then(fetch)
      .then((rows) => {
        if (running && my === generation) onChange(Array.isArray(rows) ? rows : []);
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
    nudge() {
      if (!running) return;
      const when = Math.max(now(), lastAt + RANKING_MIN_GAP_MS);
      if (when < timerAt) at(when);
    },
    stop() {
      if (!running) return;
      running = false;
      generation++;
      if (timer !== null) clearTimer(timer);
      timer = null;
      timerAt = Infinity;
      onChange([]);
    },
  };
}
