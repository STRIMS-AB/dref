import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { addModel, addScope, createDraft, fromDocument, toDocument, validateDomain } from '@dref/validator';
import type { DomainDocument, DomainDraft } from '@dref/validator';

import { COMPOSER_CSS } from './styles.js';
import { DEFAULT_LABELS, fmt, getLabels, resolveLabels } from './labels.js';
import type { ComposerLabels } from './labels.js';
import { indexIssues } from './issues.js';
import type { ComposerIssue, IssueIndex } from './issues.js';
import { DomainPanel, EmptyState, ModelPanel, ScopePanel, newModel } from './editors.js';
import type { ComposerMode, RuleOptionsFn, Selection } from './editors.js';
import { DragHandle, Icon, TabBar, cx, modelIcon, useReorder } from './ui.js';
import { moveScope, movedIndex } from './ordering.js';

export type { ComposerLabels } from './labels.js';
export type { ComposerMode, Selection } from './editors.js';
export { DEFAULT_LABELS } from './labels.js';

export type ValidationRow = { field?: string; rule?: string; message?: string };
export type ValidationResult = {
  isValid: boolean;
  errors: ValidationRow[];
  warnings: ValidationRow[];
};

/** `validateDomain` that never throws (a throw becomes a single parse error). */
export function validateDocumentOrWarn(doc: DomainDocument): ValidationResult {
  try {
    return validateDomain(doc) as unknown as ValidationResult;
  } catch (err) {
    return {
      isValid: false,
      errors: [{ field: 'domain', rule: 'parse', message: err instanceof Error ? err.message : 'Unable to validate document.' }],
      warnings: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Draft / document helpers
// ---------------------------------------------------------------------------

/** A composer draft always has the object `formats`/`fields` maps and scope/model arrays. */
export function isDomainDraft(value: unknown): value is DomainDraft {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.models) &&
    Array.isArray(v.scopes) &&
    typeof v.formats === 'object' &&
    typeof v.fields === 'object' &&
    !('defaults' in v) &&
    (v.models as unknown[]).every((m) => typeof m === 'object' && m !== null && Array.isArray((m as { mapsFrom?: unknown }).mapsFrom))
  );
}

/** Anything that is not a composer draft is treated as a (possibly partial) domain document. */
export function isDomainDocument(value: unknown): value is DomainDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isDomainDraft(value);
}

export function initDraft(initial?: DomainDraft | DomainDocument | null): DomainDraft {
  if (initial === undefined || initial === null) return createDraft({ name: '' });
  if (isDomainDraft(initial)) return initial;
  return fromDocument(initial as DomainDocument);
}

export interface ParsedDomain {
  ok: boolean;
  document?: DomainDocument;
  error?: string;
}

/**
 * Parse pasted text into a domain document. Accepts a bare document, or one
 * wrapped as `{ domain: {...} }` (as returned by some APIs).
 */
export function parseDomainJson(text: string): ParsedDomain {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'domain' in data && !('models' in data)) {
    data = (data as { domain: unknown }).domain;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false };
  const d = data as Record<string, unknown>;
  if (typeof d.name !== 'string' && !Array.isArray(d.models)) return { ok: false };
  if (d.models !== undefined && !Array.isArray(d.models)) return { ok: false };
  if (d.scopes !== undefined && !Array.isArray(d.scopes)) return { ok: false };
  return { ok: true, document: d as unknown as DomainDocument };
}

const keyOf = (doc: DomainDocument): string => JSON.stringify(doc);

// ---------------------------------------------------------------------------
// Headless hook
// ---------------------------------------------------------------------------

export type UseComposerStatus = 'valid' | 'invalid' | 'warnings';

export interface UseDomainComposerOptions {
  initial?: DomainDraft | DomainDocument | null;
  validate?: (doc: DomainDocument) => ValidationResult;
  schemaUrl?: string;
  /** Fired on every user edit (not on initial load or programmatic `load`). */
  onChange?: (draft: DomainDraft, document: DomainDocument) => void;
  /** Maximum history size for undo/redo (default 50). Set to 0 to disable. */
  historySize?: number;
}

export interface DomainComposerState {
  draft: DomainDraft;
  document: DomainDocument;
  result: ValidationResult;
  status: UseComposerStatus;
  issues: IssueIndex;
  /** True when the document differs from the last loaded / saved baseline. */
  dirty: boolean;
  apply: (next: DomainDraft) => void;
  /** Replace the whole domain (e.g. pasted JSON); `asEdit` also fires onChange and keeps the baseline. */
  load: (value: DomainDraft | DomainDocument, asEdit?: boolean) => void;
  reset: () => void;
  markSaved: () => void;
  /** Undo the last edit. */
  undo: () => void;
  /** Redo the last undone edit. */
  redo: () => void;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
}

export function useDomainComposer(options: UseDomainComposerOptions = {}): DomainComposerState {
  const { initial, validate, schemaUrl, onChange, historySize = 50 } = options;
  const [draft, setDraft] = useState<DomainDraft>(() => initDraft(initial));
  const initialRef = useRef<DomainDraft>(draft);
  const document = useMemo(() => toDocument(draft, schemaUrl ? { schema: schemaUrl } : undefined), [draft, schemaUrl]);
  const [baseline, setBaseline] = useState<string>(() => keyOf(document));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Undo/redo history
  const historyRef = useRef<DomainDraft[]>([draft]);
  const historyIndexRef = useRef(0);

  const result = useMemo<ValidationResult>(() => (validate ?? validateDocumentOrWarn)(document), [document, validate]);
  const issues = useMemo(() => indexIssues(document, validate ? (result as never) : undefined), [document, result, validate]);
  const status: UseComposerStatus = !result.isValid ? 'invalid' : result.warnings.length > 0 ? 'warnings' : 'valid';

  const emit = useCallback(
    (next: DomainDraft) => {
      const cb = onChangeRef.current;
      if (cb) cb(next, toDocument(next, schemaUrl ? { schema: schemaUrl } : undefined));
    },
    [schemaUrl]
  );

  const pushHistory = useCallback((next: DomainDraft) => {
    if (historySize <= 0) return;
    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push(next);
    if (history.length > historySize) history.shift();
    else historyIndexRef.current++;
    historyRef.current = history;
  }, [historySize]);

  const apply = useCallback(
    (next: DomainDraft) => {
      setDraft(next);
      pushHistory(next);
      emit(next);
    },
    [emit, pushHistory]
  );

  const load = useCallback(
    (value: DomainDraft | DomainDocument, asEdit = false) => {
      const next = initDraft(value);
      setDraft(next);
      if (asEdit) {
        emit(next);
        pushHistory(next);
      } else {
        initialRef.current = next;
        setBaseline(keyOf(toDocument(next, schemaUrl ? { schema: schemaUrl } : undefined)));
        historyRef.current = [next];
        historyIndexRef.current = 0;
      }
    },
    [emit, schemaUrl, pushHistory]
  );

  const reset = useCallback(() => apply(initialRef.current), [apply]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const prev = historyRef.current[historyIndexRef.current];
      setDraft(prev);
      emit(prev);
    }
  }, [emit]);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const next = historyRef.current[historyIndexRef.current];
      setDraft(next);
      emit(next);
    }
  }, [emit]);

  const markSaved = useCallback(() => {
    initialRef.current = draft;
    setBaseline(keyOf(document));
  }, [draft, document]);

  const dirty = keyOf(document) !== baseline;
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const state = useMemo<DomainComposerState>(() => ({
    draft,
    document,
    result,
    status,
    issues,
    dirty,
    apply,
    load,
    reset,
    markSaved,
    undo,
    redo,
    canUndo,
    canRedo,
  }), [draft, document, result, status, issues, dirty, apply, load, reset, markSaved, undo, redo, canUndo, canRedo]);

  return state;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type ComposerTab = 'design' | 'json';

export interface DomainComposerProps {
  /** Initial domain (document or draft). Uncontrolled: later changes are ignored — use `value` to push updates. */
  initial?: DomainDraft | DomainDocument | null;
  /** Externally owned domain. Whenever it changes (by content) the composer reloads it and resets the baseline. */
  value?: DomainDraft | DomainDocument | null;
  editable?: boolean;
  /**
   * `full` (default) renders the complete designer: domain settings, scopes,
   * model fields and mappings. `mappings` turns the composer into a mapping
   * console for models that are defined elsewhere: field/property editing is
   * hidden, models stay selectable in the sidebar and only their Mappings view
   * is reachable. Mapping validation issues are still reported.
   */
  mode?: ComposerMode;
  validate?: (doc: DomainDocument) => ValidationResult;
  onChange?: (draft: DomainDraft, document: DomainDocument) => void;
  /** When provided, a Save button is shown. May return a promise; the baseline is reset on success. */
  onSave?: (document: DomainDocument, result: ValidationResult) => void | Promise<unknown>;
  /** Allow saving a document that has validation errors (default false). */
  allowInvalidSave?: boolean;
  labels?: Partial<ComposerLabels>;
  /** Locale code (e.g. 'en', 'de'). Requires {@link registerLocale} to be called first. */
  locale?: string;
  schemaUrl?: string;
  className?: string;
  style?: CSSProperties;
  /** Show the JSON tab (view / paste / import). Default true. */
  showPreview?: boolean;
  /** Fixed height (e.g. '80vh' in a modal): panes then scroll internally. */
  height?: number | string;
  defaultTab?: ComposerTab;
  /** Initially selected element; defaults to the first model (or domain settings). */
  initialSelection?: Selection;
  /** Custom rule choices per (builtin base) type and list flag. */
  ruleOptions?: RuleOptionsFn;
  /** Extra toolbar content (host buttons). */
  toolbarExtra?: ReactNode;
}

export function DomainComposer(props: DomainComposerProps) {
  const {
    initial,
    value,
    editable = true,
    mode = 'full',
    validate,
    onChange,
    onSave,
    allowInvalidSave = false,
    labels,
    schemaUrl,
    className,
    style,
    showPreview = true,
    height,
    defaultTab = 'design',
    initialSelection,
    ruleOptions,
    toolbarExtra,
  locale,
  } = props;

  const L = useMemo<ComposerLabels>(() => resolveLabels(labels, locale), [labels, locale]);
  const composer = useDomainComposer({ initial: value ?? initial, validate, schemaUrl, onChange });
  const { draft, document, result, status, issues, dirty, apply, load, undo, redo, canUndo, canRedo, reset } = composer;

  // Controlled reloads: a new `value` object whose content differs from what is shown replaces the draft.
  const lastValue = useRef(value);
  const docRef = useRef(document);
  docRef.current = document;
  useEffect(() => {
    if (!value || value === lastValue.current) return;
    lastValue.current = value;
    const next = initDraft(value);
    if (keyOf(toDocument(next, schemaUrl ? { schema: schemaUrl } : undefined)) !== keyOf(docRef.current)) {
      load(value);
      setSel(next.models.length > 0 ? { kind: 'model', index: 0 } : { kind: 'domain' });
    } else {
      composer.markSaved();
    }
  }, [value, load, schemaUrl, composer]);

  const [tab, setTab] = useState<ComposerTab>(showPreview ? defaultTab : 'design');
  const [sel, setSel] = useState<Selection>(() => initialSelection ?? (draft.models.length > 0 ? { kind: 'model', index: 0 } : { kind: 'domain' }));
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issueTarget, setIssueTarget] = useState<ComposerIssue | undefined>();
  const tabsId = useId();

  // Keep the selection valid as the draft changes.
  const selection: Selection =
    mode === 'mappings' && (sel.kind !== 'model' || !draft.models[sel.index]) && draft.models.length > 0
      ? { kind: 'model', index: 0 }
      : sel.kind === 'model' && !draft.models[sel.index]
      ? { kind: 'domain' }
      : sel.kind === 'scope' && !draft.scopes[sel.index]
        ? { kind: 'domain' }
        : sel;

  const select = useCallback((s: Selection) => {
    setSel(s);
    setIssueTarget(undefined);
    setTab('design');
  }, []);

  const errorCount = result.errors.length;
  const warnCount = result.warnings.length;

  const goToFirstIssue = () => {
    if (mode === 'mappings') {
      // Only model screens are reachable; jump to the first model with an issue.
      const first = issues.all.find((i) => i.severity === 'error' && i.target.kind === 'model') ?? issues.all.find((i) => i.target.kind === 'model');
      if (first && first.target.kind === 'model') { select({ kind: 'model', index: first.target.index }); setIssueTarget({ ...first }); }
      return;
    }
    const first = issues.all.find((i) => i.severity === 'error') ?? issues.all[0];
    if (!first) return;
    select(targetToSelection(first));
    setIssueTarget({ ...first });
  };

  const save = async () => {
    if (!onSave) return;
    if (!allowInvalidSave && status === 'invalid') return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(document, result);
      composer.markSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as unknown as { isContentEditable?: boolean }).isContentEditable);
      if (isInput) return;

      if (e.key === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          undo();
        }
      } else if ((e.key === 'z' && e.shiftKey) || (e.key === 'y' && !isMac)) {
        if (canRedo) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, canUndo, canRedo, undo, redo]);

  const rootStyle: CSSProperties = { ...(height !== undefined ? { height } : {}), ...style };
  const fixed = height !== undefined;

  return (
    <div className={cx('dc', className)} style={rootStyle} data-status={status} data-editable={editable}>
      <style>{COMPOSER_CSS}</style>

      <div className="dc-toolbar">
        <div className="dc-toolbar-title">
          <span className="dc-brand-icon"><Icon.domain /></span>
          <strong>{draft.name || L.newDomain}</strong>
          {draft.version && <span className="dc-muted dc-mono dc-small">v{draft.version}</span>}
          {!editable && <span className="dc-pill dc-pill-neutral">{L.readOnlyHint}</span>}
          {editable && dirty && onSave && <span className="dc-muted dc-small">● {L.unsaved}</span>}
        </div>
        <StatusPill status={status} errors={errorCount} warnings={warnCount} labels={L} onClick={issues.all.length ? goToFirstIssue : undefined} />
        {showPreview && (
          <TabBar id={tabsId} className="dc-tabs" value={tab} onChange={setTab} label={L.domain}
            items={[{ value: 'design', label: L.design }, { value: 'json', label: L.json }]} />
        )}
        {editable && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <button
              type="button"
              className="dc-icon-btn"
              disabled={!canUndo}
              onClick={undo}
              title={`${L.undo} (Ctrl+Z)`}
              aria-label={L.undo}
            >
              <Icon.undo />
            </button>
            <button
              type="button"
              className="dc-icon-btn"
              disabled={!canRedo}
              onClick={redo}
              title={`${L.redo} (Ctrl+Shift+Z)`}
              aria-label={L.redo}
            >
              <Icon.redo />
            </button>
            {dirty && (
              <button
                type="button"
                className="dc-icon-btn"
                onClick={reset}
                title={L.reset}
                aria-label={L.reset}
              >
                <Icon.reset />
              </button>
            )}
          </div>
        )}
        {toolbarExtra}
        {onSave && editable && (
          <button type="button" className="dc-btn dc-btn-primary" disabled={saving || !dirty || (!allowInvalidSave && status === 'invalid')} onClick={save} title={saveError ?? undefined}>
            {saving ? L.saving : L.save}
          </button>
        )}
      </div>
      {saveError && <div className="dc-issues" style={{ margin: 8 }}>{saveError}</div>}

      {tab === 'json' && showPreview ? (
        <div id={`${tabsId}-json`} role="tabpanel" aria-labelledby={`${tabsId}-json-tab`} className={cx('dc-body-single', fixed && 'dc-scroll')}>
          <JsonView document={document} editable={editable && mode === 'full'} labels={L} onLoad={(doc) => { load(doc, true); setSel(doc.models?.length ? { kind: 'model', index: 0 } : { kind: 'domain' }); setTab('design'); }} />
        </div>
      ) : (
        <div id={`${tabsId}-design`} role={showPreview ? 'tabpanel' : undefined} aria-labelledby={showPreview ? `${tabsId}-design-tab` : undefined} className="dc-body" style={fixed ? { overflow: 'hidden' } : undefined}>
          <Sidebar
            draft={draft}
            issues={issues}
            selection={selection}
            select={select}
            editable={editable}
            mode={mode}
            labels={L}
            filter={filter}
            setFilter={setFilter}
            onMoveScope={(from, to) => {
              apply(moveScope(draft, from, to));
              if (selection.kind === 'scope') setSel({ kind: 'scope', index: movedIndex(selection.index, from, to) });
            }}
            onAddModel={() => {
              const scope = selection.kind === 'scope' ? draft.scopes[selection.index]?.name : selection.kind === 'model' ? draft.models[selection.index]?.scope : undefined;
              apply(addModel(draft, newModel(draft, scope)));
              select({ kind: 'model', index: draft.models.length });
            }}
            onAddScope={() => {
              const names = new Set(draft.scopes.map((s) => s.name));
              let n = draft.scopes.length + 1;
              while (names.has(`scope-${n}`)) n++;
              apply(addScope(draft, { name: `scope-${n}` }));
              select({ kind: 'scope', index: draft.scopes.length });
            }}
            fixed={fixed}
          />
          <main className={cx('dc-main', fixed && 'dc-scroll')}>
            {selection.kind === 'domain' && mode === 'full' && (
              <DomainPanel draft={draft} apply={apply} editable={editable} labels={L} issues={issues} select={select} mode={mode} ruleOptions={ruleOptions} />
            )}
            {selection.kind === 'scope' && mode === 'full' && (
              <ScopePanel key={`s${selection.index}`} index={selection.index} draft={draft} apply={apply} editable={editable} labels={L} issues={issues} select={select} mode={mode} />
            )}
            {selection.kind === 'model' && (
              <ModelPanel key={`m${selection.index}`} index={selection.index} draft={draft} apply={apply} editable={editable} labels={L} issues={issues} select={select} mode={mode} ruleOptions={ruleOptions} issueTarget={issueTarget} />
            )}
            {selection.kind !== 'model' && mode === 'mappings' && <EmptyState title={L.mappingsTab} hint={L.selectModel} />}
          </main>
        </div>
      )}
    </div>
  );
}

function targetToSelection(i: ComposerIssue): Selection {
  const t = i.target;
  if (t.kind === 'model') return { kind: 'model', index: t.index };
  if (t.kind === 'scope') return { kind: 'scope', index: t.index };
  return { kind: 'domain' };
}

function StatusPill({ status, errors, warnings, labels: L, onClick }: { status: UseComposerStatus; errors: number; warnings: number; labels: ComposerLabels; onClick?: () => void }) {
  const text =
    status === 'valid'
      ? L.valid
      : status === 'warnings'
        ? `${L.valid} · ${fmt(L.warningsCount, { n: warnings })}`
        : [fmt(L.errorsCount, { n: errors }), warnings ? fmt(L.warningsCount, { n: warnings }) : ''].filter(Boolean).join(' · ');
  const cls = cx('dc-pill', `dc-pill-${status}`);
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={status === 'invalid' ? L.invalid : undefined}>{text}</button>
  ) : (
    <span className={cls} role="status">{text}</span>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  draft,
  issues,
  selection,
  select,
  editable,
  mode,
  labels: L,
  filter,
  setFilter,
  onAddModel,
  onAddScope,
  onMoveScope,
  fixed,
}: {
  draft: DomainDraft;
  issues: IssueIndex;
  selection: Selection;
  select: (s: Selection) => void;
  editable: boolean;
  mode: ComposerMode;
  labels: ComposerLabels;
  filter: string;
  setFilter: (v: string) => void;
  onAddModel: () => void;
  onAddScope: () => void;
  onMoveScope: (from: number, to: number) => void;
  fixed: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const reorder = useReorder(draft.scopes.length, onMoveScope);
  const q = filter.trim().toLowerCase();
  const models = draft.models.map((m, index) => ({ m, index })).filter(({ m }) => !q || m.name.toLowerCase().includes(q) || m.scope?.toLowerCase().includes(q));
  const declared = new Set(draft.scopes.map((s) => s.name));
  const unscoped = models.filter(({ m }) => !m.scope || !declared.has(m.scope));
  const isSel = (s: Selection) => s.kind === selection.kind && (s.kind === 'domain' || (s as { index: number }).index === (selection as { index: number }).index);

  const modelNav = ({ m, index }: { m: DomainDraft['models'][number]; index: number }) => {
    const list = issues.byModel.get(index) ?? [];
    const errs = list.filter((i) => i.severity === 'error').length;
    const warns = list.length - errs;
    const meta = mode === 'mappings' ? m.mapsFrom.length : m.properties.length;
    return (
      <button key={index} type="button" className="dc-nav dc-nav-model" aria-current={isSel({ kind: 'model', index }) || undefined} onClick={() => select({ kind: 'model', index })}>
        {modelIcon(m.authority)}<span className="dc-nav-label">{m.name || L.unnamed}</span>
        {errs > 0 ? <span className="dc-count-err">{errs}</span> : warns > 0 ? <span className="dc-dot dc-dot-warn" /> : <span className="dc-nav-meta">{meta}</span>}
      </button>
    );
  };

  const domainErrs = issues.domain.filter((i) => i.severity === 'error').length;

  return (
    <nav className={cx('dc-sidebar', fixed && 'dc-scroll')} aria-label={L.models}>
      {editable && <div className="dc-search-wrap"><Icon.search />
        <input className="dc-input dc-input-sm dc-search" placeholder={L.searchStructure} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={L.searchStructure} />
      </div>}
      {mode === 'full' && editable && (
        <div className="dc-scope-toolbar">
          <button type="button" className="dc-btn dc-btn-sm dc-btn-ghost" onClick={onAddScope} title={L.addScope}>
            <Icon.plus /> {L.addScope}
          </button>
          <button type="button" className="dc-btn dc-btn-sm dc-btn-ghost" onClick={onAddModel} title={L.addModel}>
            <Icon.plus /> {L.addModel}
          </button>
        </div>
      )}

      {draft.models.length === 0 && draft.scopes.length === 0 && (
        <div className="dc-hint" style={{ padding: '4px 8px' }}>
          {L.noModels}{' '}
          {editable && mode === 'full' && (
            <button type="button" className="dc-link" onClick={onAddModel}>
              {L.addModel}
            </button>
          )}
        </div>
      )}

      <div className="dc-scope-list" data-reorder="scopes">
      {draft.scopes.map((s, si) => {
        const members = models.filter(({ m }) => m.scope === s.name);
        if (q && members.length === 0 && !s.name.toLowerCase().includes(q)) return null;
        const scopeErrs = (issues.byScope.get(si) ?? []).length;
        const expanded = !!q || !collapsed.has(s.name);
        return (
          <div key={si} className={cx('dc-scope-group', reorder.rowClass(si))} {...(editable && mode === 'full' && !q ? reorder.rowProps(si) : {})}>
            <div className="dc-scope-heading">
              {editable && mode === 'full' && !q && <DragHandle label={fmt(L.reorderScope, { name: s.name })} handleProps={reorder.handleProps(si)} />}
              <button type="button" className="dc-icon-btn" aria-expanded={expanded} aria-label={fmt(expanded ? L.collapseScope : L.expandScope, { name: s.name })}
                onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (expanded) next.add(s.name); else next.delete(s.name); return next; })}>
                <span className="dc-chevron" data-open={expanded}><Icon.chevron /></span>
              </button>
            <button type="button" className="dc-nav" aria-current={isSel({ kind: 'scope', index: si }) || undefined} onClick={() => {
              if (mode === 'full') select({ kind: 'scope', index: si });
              else setCollapsed((prev) => { const next = new Set(prev); if (expanded) next.add(s.name); else next.delete(s.name); return next; });
            }}>
              <Icon.tag /><span className="dc-nav-label dc-nav-scope">{s.name || L.unnamed}</span>
              {scopeErrs > 0 ? <span className="dc-count-err">{scopeErrs}</span> : <span className="dc-nav-meta">{members.length}</span>}
            </button>
            </div>
            {expanded && <div className="dc-nav-group">{members.map(modelNav)}
              {members.length === 0 && Boolean(L.emptyScope) && <div className="dc-tree-empty">{L.emptyScope}</div>}
            </div>}
          </div>
        );
      })}
      </div>
      {q && models.length === 0 && !draft.scopes.some((s) => s.name.toLowerCase().includes(q)) && <div className="dc-tree-empty">{L.noSearchResults}</div>}

      {unscoped.length > 0 && (
        <div>
          {draft.scopes.length > 0 && (
            <div className="dc-nav" style={{ cursor: 'default' }}>
              <span className="dc-nav-label dc-muted dc-small">{L.unscoped}</span>
            </div>
          )}
          <div className={draft.scopes.length > 0 ? 'dc-nav-group' : undefined}>{unscoped.map(modelNav)}</div>
        </div>
      )}
      {mode === 'full' && <div className="dc-sidebar-footer">
        <button type="button" className="dc-nav dc-nav-settings" aria-current={isSel({ kind: 'domain' }) || undefined} onClick={() => select({ kind: 'domain' })}>
          <Icon.settings /><span className="dc-nav-label">{L.domainSettings}</span>
          {domainErrs > 0 && <span className="dc-count-err">{domainErrs}</span>}
        </button>
        {editable && draft.scopes.length > 1 && <span className="dc-hint">{L.scopeOrderHint}</span>}
      </div>}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// JSON view: generated output, paste / import / file
// ---------------------------------------------------------------------------

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'domain';
}

function JsonView({ document, editable, labels: L, onLoad }: { document: DomainDocument; editable: boolean; labels: ComposerLabels; onLoad: (doc: DomainDocument) => void }) {
  const generated = useMemo(() => JSON.stringify(document, null, 2), [document]);
  const [text, setText] = useState(generated);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!touched) setText(generated);
  }, [generated, touched]);

  const tryApply = (raw: string) => {
    const parsed = parseDomainJson(raw);
    if (!parsed.ok || !parsed.document) {
      setError(parsed.error ? fmt(L.parseError, { name: parsed.error }) : L.notADomain);
      return;
    }
    setError(null);
    setTouched(false);
    onLoad(parsed.document);
  };

  const readFile = (file: File | undefined) => {
    if (!file) return;
    file.text().then((content) => {
      setText(content);
      setTouched(true);
      tryApply(content);
    });
  };

  const copy = () => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    nav?.clipboard?.writeText(generated).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const download = () => {
    const blob = new Blob([generated + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${slug(document.name ?? '')}.domain.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="dc-json">
      <div className="dc-section-head">
        <div>
          <h4>{editable ? L.importJson : L.preview}</h4>
          {editable && <p>{L.jsonHint}</p>}
        </div>
        <div className="dc-actions">
          {editable && (
            <>
              <button type="button" className="dc-btn dc-btn-sm" onClick={() => { setText(''); setTouched(true); setError(null); areaRef.current?.focus(); }}>
                {L.importJson}
              </button>
              <button type="button" className="dc-btn dc-btn-sm" onClick={() => fileRef.current?.click()}>{L.openFile}</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
            </>
          )}
          <button type="button" className="dc-btn dc-btn-sm" onClick={copy}><Icon.copy /> {copied ? L.copied : L.copy}</button>
          <button type="button" className="dc-btn dc-btn-sm" onClick={download}>{L.download}</button>
          {editable && touched && (
            <>
              <button type="button" className="dc-btn dc-btn-sm" onClick={() => { setTouched(false); setError(null); setText(generated); }}>{L.cancel}</button>
              <button type="button" className="dc-btn dc-btn-sm dc-btn-primary" onClick={() => tryApply(text)} disabled={!text.trim()}>{L.apply}</button>
            </>
          )}
        </div>
      </div>
      {error && <div className="dc-json-error" role="alert">{error}</div>}
      {editable ? (
        <textarea
          ref={areaRef}
          className={cx('dc-json-editor', drag && 'dc-dropzone')}
          value={text}
          spellCheck={false}
          placeholder={L.jsonPlaceholder}
          aria-label={L.json}
          onChange={(e) => { setText(e.target.value); setTouched(true); setError(null); }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); tryApply(text); }
          }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0]); }}
        />
      ) : (
        <pre className="dc-json-editor" aria-label={L.preview}>{generated}</pre>
      )}
    </div>
  );
}
