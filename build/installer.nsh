; Installer Sini Live Studio dipercantik (docs/superpowers/specs/2026-11-16-studio-installer-design.md).
; Dimuat electron-builder sebelum halaman MUI2 disusun. Gambar: build/installerSidebar.bmp,
; build/uninstallerSidebar.bmp, build/installerHeader.bmp (dibuat scripts/studio-installer-art.py di repo utama).

; Latar bilah atas + halaman Sambutan/Selesai = warna panel studio (--surface), teks putih.
!define MUI_BGCOLOR "12111A"
!define MUI_TEXTCOLOR "FFFFFF"

; Halaman Sambutan di depan Lisensi; dilewati saat memperbarui, sama dengan halaman lain.
!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend
