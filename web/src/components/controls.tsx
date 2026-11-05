// Filter controls. Client-only: imported from client views.

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="num flex min-w-0 flex-col gap-1 text-[11px] uppercase tracking-wider text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[9rem] border border-line2 bg-panel2 px-2 py-1.5 text-xs normal-case tracking-normal text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="num flex min-w-0 flex-col gap-1 text-[11px] uppercase tracking-wider text-muted">
      {label}
      <div className="flex flex-wrap border border-line2" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`px-2.5 py-1.5 text-xs normal-case tracking-normal ${
              value === o.value ? "bg-accent text-bg" : "bg-panel2 text-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="num flex min-w-0 flex-1 flex-col gap-1 text-[11px] uppercase tracking-wider text-muted">
      Search
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-[10rem] border border-line2 bg-panel2 px-2 py-1.5 text-xs normal-case tracking-normal text-fg placeholder:text-dim"
      />
    </label>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 border border-line bg-panel px-3 py-3">{children}</div>;
}
