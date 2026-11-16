type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Konfirmasi tindakan yang tidak bisa diurungkan (hapus sumber/scene/filter, akhiri alat saat siaran) lewat
 * kotak dialog Windows dari proses utama — bisa dipanggil dari luar komponen React (menu klik kanan).
 */
export async function confirmAction(t: T, message: string, confirmLabel = t("studio.app.delete")): Promise<boolean> {
  return window.studio.invoke<boolean>("app.confirm", { message, detail: t("studio.app.confirm.noUndo"), confirm: confirmLabel, cancel: t("studio.app.cancel") });
}
