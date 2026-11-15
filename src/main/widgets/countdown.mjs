/*
  Hitung mundur satu widget. Jam di proses utama; halaman menghitung tampilan detiknya sendiri dari
  `remainingMs` dan `at` (waktu keadaan itu dibuat). Tidak disimpan: studio ditutup = kembali penuh & berhenti.
*/
export function createCountdown({ durationMs, now }) {
  let duration = durationMs;
  let remaining = durationMs;
  let running = false;
  let startedAt = 0;

  const settle = () => {
    if (!running) return;
    const left = remaining - (now() - startedAt);
    if (left <= 0) {
      running = false;
      remaining = 0;
    }
  };

  return {
    toggle() {
      settle();
      if (running) {
        remaining = Math.max(0, remaining - (now() - startedAt));
        running = false;
        return;
      }
      if (remaining <= 0) remaining = duration;
      running = true;
      startedAt = now();
    },
    reset() {
      running = false;
      remaining = duration;
    },
    setDuration(ms) {
      duration = ms;
      if (!running) remaining = ms;
    },
    state() {
      settle();
      const t = now();
      return { running, remainingMs: running ? Math.max(0, remaining - (t - startedAt)) : remaining, at: t };
    },
  };
}
