/* Suara alert bawaan studio (gift tanpa suara pustaka): dua nada pendek lewat Web Audio, tanpa berkas. */
let ctx: AudioContext | null = null;

export function chime() {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  } catch {
    // tanpa audio — alert tetap tampil
  }
}
