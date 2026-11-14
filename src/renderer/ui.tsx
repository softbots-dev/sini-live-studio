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

/** Dialog modal. Saat terbuka pratinjau native disembunyikan (overlayStore). */
export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    overlayStore.open();
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      overlayStore.close();
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
