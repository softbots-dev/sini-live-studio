/* Selama siaran aktif aplikasi tidak boleh ditutup diam-diam dan pembaruan tidak dipasang. */
const ACTIVE = new Set(["starting", "connecting", "live", "reconnecting"]);
export const canQuit = (phase) => !ACTIVE.has(phase);
export const mayInstallUpdate = (phase) => !ACTIVE.has(phase);
