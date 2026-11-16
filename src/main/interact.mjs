// Alat interaktif live (Goal, Poll, Wishes, Treasure Box) di Sini Live Studio — proses utama.
// Keadaan dari GET /v1/me/channel/interact lalu event room `interact.*` (realtime.mjs). Aksi menjawab
// { ok, code } dan tidak pernah melempar ke renderer. Renderer tidak menyentuh jaringan.

const BASE = "/me/channel/interact";

const codeOf = (err) => (err && typeof err.code === "string" && err.status ? err.code : "request_failed");

/** Gift yang bisa dijadikan Wishes: global & aktif (pemilih gift penonton hanya menawarkan itu). */
export function wishGifts(gifts) {
  if (!Array.isArray(gifts)) return [];
  return gifts
    .filter((g) => g && g.isGlobal && g.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon, coinPrice: g.coinPrice }));
}

export function createInteract({ http, onState }) {
  let state = null;
  const emit = () => onState(state);

  async function refresh() {
    try {
      state = (await http.get(BASE)).data;
      emit();
    } catch {
      // Belum punya channel / jaringan putus: biarkan keadaan terakhir.
    }
    return state;
  }

  async function run(fn) {
    try {
      await fn();
    } catch (err) {
      return { ok: false, code: codeOf(err) };
    }
    await refresh();
    return { ok: true };
  }

  /** Event dari gateway — keadaan utuh potongan itu. */
  function apply(msg) {
    if (!state || typeof msg?.type !== "string") return;
    const d = msg.data ?? {};
    switch (msg.type) {
      case "interact.goal":
        state = { ...state, goal: d.goal ?? null };
        break;
      case "interact.poll":
        state = { ...state, poll: d.poll ?? null };
        break;
      case "interact.wishes":
        state = { ...state, wishes: Array.isArray(d.wishes) ? d.wishes : [] };
        break;
      case "interact.treasure": {
        const box = d.box ?? null;
        const prev = state.treasure;
        state = { ...state, treasure: box ? { ...box, claimedCoins: prev && prev.id === box.id ? prev.claimedCoins : 0 } : null };
        break;
      }
      default:
        return;
    }
    emit();
  }

  return {
    refresh,
    apply,
    state: () => state,
    reset() {
      state = null;
    },
    startGoal: (input) => run(() => http.post(`${BASE}/goal`, input)),
    endGoal: () => run(() => http.del(`${BASE}/goal`)),
    startPoll: (input) => run(() => http.post(`${BASE}/poll`, input)),
    closePoll: () => run(() => http.post(`${BASE}/poll/close`)),
    setWishes: (items) => run(() => http.put(`${BASE}/wishes`, { items })),
    /** `key` dibuat sekali per dialog — mencoba ulang tidak memotong koin dua kali. */
    startTreasure: (input, key) => run(() => http.post(`${BASE}/treasure`, { ...input, idempotencyKey: key })),
    async wallet() {
      try {
        return (await http.get("/wallet")).data?.coinBalance ?? null;
      } catch {
        return null;
      }
    },
  };
}
