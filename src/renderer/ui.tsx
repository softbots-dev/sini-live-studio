import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { overlayStore } from "./store";
import { useT } from "./i18n";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "live";

export function Button({ variant = "secondary", size = "md", icon, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** Tombol ikon — label wajib (dibaca pembaca layar & tooltip). */
export function IconButton({ label, icon, pressed, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; pressed?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      {icon}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

const FOCUSABLE = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
/** Dialog yang terbuka, paling atas terakhir — Escape & Tab hanya untuk yang paling atas. */
const OPEN_DIALOGS: symbol[] = [];

/**
 * Dialog modal. Saat terbuka pratinjau native disembunyikan (overlayStore).
 * Efeknya dipasang SEKALI per dialog: pemanggil memberi `onClose` sebaris (fungsi baru tiap render) dan
 * induknya dirender ulang terus (meter audio 10×/dtk, jam alat tiap detik) — efek yang ikut `onClose`
 * mengembalikan fokus ke tombol X setiap render, jadi ketikan & slider kehilangan fokus.
 * Fokus awal: kolom isian pertama (atau autoFocus) di badan dialog, baru tombol; Tab berputar di dalam dialog.
 */
export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const me = Symbol("dialog");
    OPEN_DIALOGS.push(me);
    overlayStore.open();
    const prev = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusables = () => [...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (panel && !panel.contains(document.activeElement)) {
      const body = panel.querySelector(".dialog-body");
      const first =
        body?.querySelector<HTMLElement>("[autofocus]") ??
        body?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') ??
        body?.querySelector<HTMLElement>(FOCUSABLE) ??
        panel.querySelector<HTMLElement>(".dialog-foot button:not([disabled])") ??
        panel.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (OPEN_DIALOGS[OPEN_DIALOGS.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const list = focusables();
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (at <= 0 || !panel.contains(document.activeElement))) {
        e.preventDefault();
        list[list.length - 1]!.focus();
      } else if (!e.shiftKey && (at === list.length - 1 || !panel.contains(document.activeElement))) {
        e.preventDefault();
        list[0]!.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      OPEN_DIALOGS.splice(OPEN_DIALOGS.indexOf(me), 1);
      overlayStore.close();
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div ref={ref} className={`dialog ${wide ? "dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton label={t("studio.app.cancel")} icon={<X />} onClick={onClose} />
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}
