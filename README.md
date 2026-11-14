# Sini Live Studio

Aplikasi desktop Windows untuk siaran langsung ke [Sini](https://sini.live) — scene, kamera, layar,
jendela, tangkapan game, dan mixer audio di atas libobs (mesin OBS Studio, lewat `obs-studio-node`).
Masuk dengan akun Sini lewat browser; alamat kirim siaran hanya dipegang di memori aplikasi.

## Lisensi

GPL-2.0-or-later (lihat `LICENSE`), karena memakai libobs. Kode ini adalah aplikasi studio saja —
layanan Sini (server, web, aplikasi seluler) adalah program terpisah yang hanya dihubungi lewat
HTTP/WebSocket.

## Membangun

Windows 10/11 64-bit, Node.js 22+.

```
npm ci
npm test
npm run build
npm run dist      # installer NSIS di release/
```

`npm run dev` membangun lalu membuka aplikasi. Variabel `SINI_WEB_ORIGIN` hanya berlaku di build
pengembangan (bawaan `https://sini.live`).
