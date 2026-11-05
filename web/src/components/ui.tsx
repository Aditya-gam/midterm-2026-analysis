import type { ReactNode } from "react";

/** A terminal-style panel: a labelled header strip over the content. */
export function Panel({
  label,
  meta,
  children,
  className = "",
  id,
}: {
  label: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`min-w-0 border border-line bg-panel ${className}`}>
      <header className="num flex items-center justify-between gap-3 border-b border-line px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 bg-accent" aria-hidden />
          {label}
        </span>
        {meta && <span className="normal-case tracking-normal text-dim">{meta}</span>}
      </header>
      <div className="grid gap-3 p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "dem" | "rep" }) {
  return (
    <div className="min-w-0 border border-line bg-panel px-3 py-2.5">
      <div className="num text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`num mt-1 text-2xl leading-tight sm:text-3xl ${tone === "dem" ? "text-dem" : tone === "rep" ? "text-rep" : "text-fg"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="grid gap-2 border-b border-line pb-4">
      <div className="num text-[11px] uppercase tracking-[0.2em] text-accent">{kicker}</div>
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
      {children && <div className="max-w-3xl text-sm leading-relaxed text-muted">{children}</div>}
    </header>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-xs leading-relaxed text-muted">{children}</p>;
}
