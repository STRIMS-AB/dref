import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import type { ParamKind } from './catalog.js';

export const cx = (...parts: (string | undefined | false | null)[]): string => parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Icons (inline SVG, currentColor)
// ---------------------------------------------------------------------------

const svg = (d: ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const modelIcon = (authority?: string) =>
  authority === 'external' ? <Icon.globe /> : authority === 'client' ? <Icon.user /> : <Icon.chip />;

export const Icon = {
  folder: () => svg(<><path d="M2 9l5 5 7-7V3h-4z" /><circle cx="11" cy="5" r="1.1" fill="currentColor" stroke="none" /></>),
  tag: () => svg(<><path d="M3 3h5l6 6-5 5-6-6z" /><circle cx="7" cy="7" r="1.1" fill="currentColor" stroke="none" /></>),
  model: () => svg(<><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M2.5 6h11M6 6v7.5" /></>),
  domain: () => svg(<><path d="M8 1.3 1.3 4.7 8 8l6.7-3.3L8 1.3z" /><path d="M1.3 8 8 11.3l6.7-3.3" /><path d="M1.3 11.3 8 14.7l6.7-3.4" /></>),
  user: () => svg(<><rect x="2" y="3" width="12" height="8.5" rx="1" /><path d="M6 14h4M8 11.5V14" /></>),
  chip: () => svg(
    <><rect x="4.5" y="4.5" width="7" height="7" rx="1" /><rect x="6.5" y="6.5" width="3" height="3" /><path d="M6 4.5V3M8 4.5V3M10 4.5V3M6 13v-1.5M8 13v-1.5M10 13v-1.5M4.5 6H3M4.5 8H3M4.5 10H3M13 6h-1.5M13 8h-1.5M13 10h-1.5" /></>
  ),
  globe: () => svg(<><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c2 1.8 3 3.3 3 5.5s-1 3.7-3 5.5M8 2.5C6 4.3 5 5.8 5 8s1 3.7 3 5.5" /></>),
  settings: () => svg(<><path d="M3 4h10M3 8h10M3 12h10" /><path d="M6 2v4M10 6v4M6 10v4" /></>),
  search: () => svg(<><circle cx="6.5" cy="6.5" r="4" /><path d="m10 10 3.5 3.5" /></>),
  plus: () => svg(<path d="M8 3v10M3 8h10" />),
  trash: () => svg(<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />),
  up: () => svg(<path d="M4 10l4-4 4 4" />),
  down: () => svg(<path d="M4 6l4 4 4-4" />),
  chevron: () => svg(<path d="M6 4l4 4-4 4" />, 12),
  alert: () => svg(<><path d="M8 2.5 14 13.5H2z" /><path d="M8 6.5v3.2" /><circle cx="8" cy="11.7" r="0.55" fill="currentColor" stroke="none" /></>, 12),
  grip: () =>
    svg(
      <>
        <circle cx="5.8" cy="3.5" r="1.05" fill="currentColor" stroke="none" />
        <circle cx="10.2" cy="3.5" r="1.05" fill="currentColor" stroke="none" />
        <circle cx="5.8" cy="8" r="1.05" fill="currentColor" stroke="none" />
        <circle cx="10.2" cy="8" r="1.05" fill="currentColor" stroke="none" />
        <circle cx="5.8" cy="12.5" r="1.05" fill="currentColor" stroke="none" />
        <circle cx="10.2" cy="12.5" r="1.05" fill="currentColor" stroke="none" />
      </>
    ),
  copy: () => svg(<><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>),
  duplicate: () => svg(<><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M9.5 8v3M8 9.5h3M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>),
  undo: () => svg(<><path d="M3 6.5h4.5M3 6.5l2.5-2.5" /><path d="M3.5 7a5.5 5.5 0 1 0 1.5-3.5" /></>),
  redo: () => svg(<><path d="M13 6.5H8.5M13 6.5l-2.5-2.5" /><path d="M12.5 7a5.5 5.5 0 1 1-1.5-3.5" /></>),
  reset: () => svg(<><path d="M2.5 3v3.5H6" /><path d="M2.8 8a5.5 5.5 0 1 0 1.4-3.7L2.5 6.5" /></>),
  x: () => svg(<path d="M4 4l8 8M12 4l-8 8" />, 12),
};

/** How a field-mapping `from` is shown when rendered as plain text. */
export function displayValue(v: string | string[]): string {
  return Array.isArray(v) ? v.join(', ') : v;
}

/** Roving tab stop and arrow-key navigation shared by both navigation levels. */
export function TabBar<T extends string>({ value, onChange, items, label, id, className = 'dc-subnav' }: {
  value: T; onChange: (value: T) => void; items: { value: T; label: string; count?: number }[];
  label: string; id: string; className?: string;
}) {
  return <div className={className} role="tablist" aria-label={label}>
    {items.map((item, i) => <button key={item.value} type="button" role="tab"
      id={`${id}-${item.value}-tab`} aria-controls={`${id}-${item.value}`} aria-selected={value === item.value}
      tabIndex={value === item.value ? 0 : -1} className={className === 'dc-tabs' ? 'dc-tab' : 'dc-subnav-tab'}
      onClick={() => onChange(item.value)} onKeyDown={(e) => {
        const next = e.key === 'ArrowRight' ? (i + 1) % items.length : e.key === 'ArrowLeft' ? (i + items.length - 1) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); onChange(items[next].value);
        (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
      }}>{item.label}{item.count !== undefined && <span className="dc-nav-meta">{item.count}</span>}</button>)}
  </div>;
}

// ---------------------------------------------------------------------------
// Tooltip: instant, styled, portal-rendered so scroll containers never clip it
// ---------------------------------------------------------------------------

export function Tip({ label, children, delay = 120, touchDelay = 500 }: { label: string; children: ReactNode; delay?: number; touchDelay?: number }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const tipId = useId();

  const hide = () => {
    clearTimeout(timer.current);
    clearTimeout(touchTimer.current);
    setPos(null);
  };
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = hostRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90);
      const below = r.top < 56;
      setPos({ x, y: below ? r.bottom + 6 : r.top - 6, below });
    }, delay);
  };
  const showTouch = () => {
    clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(show, touchDelay);
  };
  const cancelTouch = () => clearTimeout(touchTimer.current);

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(touchTimer.current); }, []);
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [pos]);

  return (
    <span ref={hostRef} className="dc-tip-host" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onTouchStart={showTouch} onTouchEnd={cancelTouch} onTouchCancel={cancelTouch} aria-describedby={pos ? tipId : undefined}>
      {children}
      {pos &&
        createPortal(
          <span id={tipId} className="dc-tip" style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.below ? 0 : '-100%'})` }} role="tooltip">
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form primitives
// ---------------------------------------------------------------------------

const FieldContext = createContext<{ labelId?: string; descriptionId?: string }>({});

export function Field({ label, hint, error, children, grow }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; grow?: boolean }) {
  const id = useId();
  const labelId = label !== undefined ? `${id}-label` : undefined;
  const descriptionId = error || hint ? `${id}-hint` : undefined;
  return (
    <FieldContext.Provider value={{ labelId, descriptionId }}>
    <div className="dc-field" role="group" aria-labelledby={labelId} style={grow ? { gridColumn: '1 / -1' } : undefined}>
      {label !== undefined && <span id={labelId} className="dc-label">{label}</span>}
      {children}
      {error ? <span id={descriptionId} className="dc-hint-err">{error}</span> : hint ? <span id={descriptionId} className="dc-hint">{hint}</span> : null}
    </div>
    </FieldContext.Provider>
  );
}

interface TextProps {
  editable: boolean;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  small?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  list?: string;
  ariaLabel?: string;
  multiline?: boolean;
}

export function Text({ editable, value, onChange, placeholder, mono, small, invalid, autoFocus, list, ariaLabel, multiline }: TextProps) {
  const field = useContext(FieldContext);
  if (!editable) {
    return <span className={cx('dc-value', mono && 'dc-mono', !value && 'dc-muted')}>{value || '—'}</span>;
  }
  if (multiline) {
    return (
      <textarea
        className="dc-textarea"
        value={value ?? ''}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : field.labelId}
        aria-describedby={field.descriptionId}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className={cx('dc-input', small && 'dc-input-sm', mono && 'dc-mono')}
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : field.labelId}
      aria-describedby={field.descriptionId}
      aria-invalid={invalid || undefined}
      autoFocus={autoFocus}
      list={list}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * A text input bound to a structured value: keeps the raw text locally while
 * typing (so "1.", "-" or half-typed JSON are not lost) and commits the parsed
 * value whenever it parses. Re-syncs when the external value changes.
 */
export function BufferedInput<T>({
  value,
  format,
  parse,
  onCommit,
  placeholder,
  small = true,
  mono = true,
  ariaLabel,
  title,
}: {
  value: T;
  format: (v: T) => string;
  parse: (raw: string) => { ok: true; value: T } | { ok: false };
  onCommit: (v: T) => void;
  placeholder?: string;
  small?: boolean;
  mono?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  const field = useContext(FieldContext);
  const external = format(value);
  const [raw, setRaw] = useState(external);
  const [bad, setBad] = useState(false);
  const last = useRef(external);
  useEffect(() => {
    if (external !== last.current) {
      last.current = external;
      setRaw(external);
      setBad(false);
    }
  }, [external]);
  return (
    <input
      className={cx('dc-input', small && 'dc-input-sm', mono && 'dc-mono')}
      value={raw}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : field.labelId}
      aria-describedby={field.descriptionId}
      title={title}
      aria-invalid={bad || undefined}
      spellCheck={false}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        const parsed = parse(next);
        if (parsed.ok) {
          setBad(false);
          last.current = format(parsed.value);
          onCommit(parsed.value);
        } else {
          setBad(true);
        }
      }}
      onBlur={() => {
        if (!bad) setRaw(format(value));
      }}
    />
  );
}

export function NumberInput({ value, onChange, placeholder, ariaLabel, integer }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; ariaLabel?: string; integer?: boolean }) {
  return (
    <BufferedInput<number | undefined>
      value={value}
      small={false}
      format={(v) => (v === undefined ? '' : String(v))}
      parse={(raw) => {
        const t = raw.trim();
        if (t === '') return { ok: true, value: undefined };
        const n = Number(t);
        if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) return { ok: false };
        return { ok: true, value: n };
      }}
      onCommit={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
    />
  );
}

export function Select({ editable, value, options, onChange, small, mono, ariaLabel, placeholder }: {
  editable: boolean;
  value: string | undefined;
  options: (string | { value: string; label: string; group?: string })[];
  onChange: (v: string) => void;
  small?: boolean;
  mono?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const field = useContext(FieldContext);
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o, group: undefined as string | undefined } : o));
  if (!editable) {
    const hit = norm.find((o) => o.value === (value ?? ''));
    return <span className={cx('dc-value', mono && 'dc-mono', !value && 'dc-muted')}>{hit?.label ?? value ?? '—'}</span>;
  }
  const groups: { group?: string; items: typeof norm }[] = [];
  for (const o of norm) {
    const g = groups.find((x) => x.group === o.group);
    if (g) g.items.push(o);
    else groups.push({ group: o.group, items: [o] });
  }
  const current = value ?? '';
  const known = norm.some((o) => o.value === current);
  return (
    <select
      className={cx('dc-select', small && 'dc-select-sm', mono && 'dc-mono')}
      value={current}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : field.labelId}
      aria-describedby={field.descriptionId}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {!known && current !== '' && <option value={current}>{current}</option>}
      {groups.map((g, i) =>
        g.group ? (
          <optgroup key={i} label={g.group}>
            {g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ) : (
          g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
        )
      )}
    </select>
  );
}

export function Check({ editable, checked, onChange, label, title }: { editable: boolean; checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; title?: string }) {
  if (!editable) {
    if (label === undefined) return <span className={checked ? '' : 'dc-muted'} title={title}>{checked ? '✓' : '·'}</span>;
    return checked ? <span className="dc-badge">{label}</span> : null;
  }
  return (
    <label className="dc-check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={typeof label === 'string' ? label : title} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Row reordering: HTML5 drag-and-drop plus keyboard moves on the drag handle
// ---------------------------------------------------------------------------

export interface ReorderState {
  /** Row index currently being dragged. */
  drag: number | null;
  /** Row index that would receive the drop. */
  over: number | null;
  handleProps: (i: number) => {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
    onKeyDown: (e: KeyboardEvent) => void;
  };
  rowProps: (i: number) => {
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  /** Class for a row while it is dragged / a drop target. */
  rowClass: (i: number) => string | undefined;
}

/**
 * Shared reorder interaction for table rows: drag the handle (mouse) or focus
 * it and use ArrowUp / ArrowDown (keyboard). `move(from, to)` applies the
 * reorder through the caller (the validator composer API).
 */
export function useReorder(count: number, move: (from: number, to: number) => void): ReorderState {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const focusTarget = useRef<{ container: Element; index: number } | null>(null);
  useEffect(() => {
    const target = focusTarget.current;
    if (target) {
      target.container.querySelectorAll<HTMLButtonElement>('.dc-grip')[target.index]?.focus();
      focusTarget.current = null;
    }
  });
  return {
    drag,
    over,
    handleProps: (i) => ({
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        setDrag(i);
        setOver(null);
      },
      onDragEnd: () => {
        setDrag(null);
        setOver(null);
      },
      onKeyDown: (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
        if (to < 0 || to >= count) return;
        const container = e.currentTarget.closest('[data-reorder]');
        if (container) focusTarget.current = { container, index: to };
        move(i, to);
      },
    }),
    rowProps: (i) => ({
      onDragOver: (e) => {
        if (drag === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (over !== i) setOver(i);
      },
      onDrop: (e) => {
        if (drag === null) return;
        e.preventDefault();
        const target = i;
        if (drag !== target) move(drag, target);
        setDrag(null);
        setOver(null);
      },
    }),
    rowClass: (i) => (drag === i ? 'dc-row-dragging' : over === i && drag !== null ? 'dc-row-drop' : undefined),
  };
}

/** Visible drag handle; also the keyboard target for ArrowUp / ArrowDown moves. */
export function DragHandle({ label, handleProps }: { label: string; handleProps: ReturnType<ReorderState['handleProps']> }) {
  return (
    <button type="button" className="dc-grip" title={label} aria-label={label} {...handleProps}>
      <Icon.grip />
    </button>
  );
}

/** Two-step destructive button: first click arms, second confirms. */
export function ConfirmButton({ label, confirmLabel, onConfirm, icon, title }: { label?: string; confirmLabel: string; onConfirm: () => void; icon?: boolean; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed) {
    return (
      <button type="button" className="dc-btn dc-btn-sm dc-btn-danger-solid" onClick={() => { setArmed(false); onConfirm(); }}>
        {confirmLabel}
      </button>
    );
  }
  if (icon) {
    return (
      <button type="button" className="dc-icon-btn dc-danger" title={title ?? label} aria-label={title ?? label} onClick={() => setArmed(true)}>
        <Icon.trash />
      </button>
    );
  }
  return (
    <button type="button" className="dc-btn dc-btn-sm dc-btn-danger" onClick={() => setArmed(true)}>
      <Icon.trash /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Parameter editor for rules / transforms
// ---------------------------------------------------------------------------

const isRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith('$');

export function formatParam(kind: ParamKind | undefined, v: unknown): string {
  if (v === undefined) return '';
  if (isRef(v)) return v;
  switch (kind) {
    case 'range': {
      const r = (v ?? {}) as { min?: number; max?: number };
      return `${r.min ?? ''}..${r.max ?? ''}`;
    }
    case 'enum-list':
    case 'string-list':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'json':
    case 'any':
      return JSON.stringify(v);
    default:
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

export function parseParam(kind: ParamKind | undefined, raw: string, allowRef: boolean): { ok: true; value: unknown } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: true, value: undefined };
  if (allowRef && t.startsWith('$')) return { ok: true, value: t };
  switch (kind) {
    case 'number':
    case 'integer': {
      const n = Number(t);
      if (!Number.isFinite(n) || (kind === 'integer' && !Number.isInteger(n))) return { ok: false };
      return { ok: true, value: n };
    }
    case 'range': {
      const m = /^(-?\d+(?:\.\d+)?)?\s*(?:\.\.|-|,)\s*(-?\d+(?:\.\d+)?)?$/.exec(t);
      if (!m) {
        const n = Number(t);
        return Number.isFinite(n) ? { ok: true, value: { min: n } } : { ok: false };
      }
      const out: { min?: number; max?: number } = {};
      if (m[1] !== undefined) out.min = Number(m[1]);
      if (m[2] !== undefined) out.max = Number(m[2]);
      return { ok: true, value: out };
    }
    case 'enum-list':
    case 'string-list':
      return { ok: true, value: t.split(',').map((s) => s.trim()).filter(Boolean) };
    case 'json':
      try {
        return { ok: true, value: JSON.parse(t) };
      } catch {
        return { ok: false };
      }
    case 'any':
      try {
        return { ok: true, value: JSON.parse(t) };
      } catch {
        return { ok: true, value: raw };
      }
    default:
      return { ok: true, value: raw };
  }
}

export function paramPlaceholder(kind: ParamKind | undefined): string {
  switch (kind) {
    case 'number': return 'e.g. 0';
    case 'integer': return 'e.g. 3';
    case 'range': return 'min..max, e.g. 1..10';
    case 'enum-list':
    case 'string-list': return 'a, b, c';
    case 'json': return '{ … }';
    default: return 'value';
  }
}

export function ParamInput({ kind, value, onChange, allowRef, placeholder, title }: { kind: ParamKind | undefined; value: unknown; onChange: (v: unknown) => void; allowRef?: boolean; placeholder?: string; title?: string }) {
  return (
    <BufferedInput<unknown>
      value={value}
      format={(v) => formatParam(kind, v)}
      parse={(raw) => parseParam(kind, raw, !!allowRef)}
      onCommit={onChange}
      placeholder={placeholder ?? paramPlaceholder(kind)}
      title={title}
    />
  );
}
