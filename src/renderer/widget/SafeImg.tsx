import { useState } from "react";

/* Gambar dari server (avatar, ikon gift) yang hilang tanpa bekas kalau gagal dimuat — tidak pernah ikon rusak di video. */
export function SafeImg({ src, className, fallback = null }: { src: string; className?: string; fallback?: React.ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return <>{fallback}</>;
  return <img className={className} src={src} alt="" onError={() => setFailed(src)} />;
}
