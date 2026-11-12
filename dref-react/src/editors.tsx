import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  addMapping,
  addMappingField,
  addModel,
  addProperty,
  classifyModel,
  moveProperty,
  removeFieldType,
  removeMapping,
  removeMappingField,
  removeModel,
  removeProperty,
  removeScope,
  renameScope,
  setFieldType,
  setFormats,
  updateMapping,
  updateMappingField,
  updateModel,
  updateProperty,
  updateScope,
  toDocument,
} from '@dref/validator';
import type {
  ComposerField,
  ComposerMapping,
  ComposerMappingField,
  ComposerModel,
  ComposerRule,
  ComposerTransformStep,
  DomainDraft,
  DrefFieldType,
  ModelAuthority,
} from '@dref/validator';
import { FIELD_TYPES, FORMAT_SUGGESTIONS, MODEL_AUTHORITIES, TRANSFORM_OPTIONS, optionsFor } from './catalog.js';
import type { RuleOption } from './catalog.js';
import type { ComposerLabels } from './labels.js';
import { fmt } from './labels.js';
import type { ComposerIssue, IssueIndex } from './issues.js';
import { BufferedInput, Check, ConfirmButton, DragHandle, Field, Icon, NumberInput, ParamInput, Select, TabBar, Text, Tip, cx, displayValue, formatParam, modelIcon, useReorder } from './ui.js';
import { movedIndex } from './ordering.js';

export type Selection = { kind: 'domain' } | { kind: 'scope'; index: number } | { kind: 'model'; index: number };

/**
 * `full` — the complete designer: domain settings, scopes, model fields and
 * mappings. `mappings` — embedded mapping console: models are fixed, only the
 * per-model Mappings view is reachable (fields editing is hidden).
 */
export type ComposerMode = 'full' | 'mappings';

export type RuleOptionsFn = (type: string, list: boolean) => RuleOption[];

export interface PanelProps {
  draft: DomainDraft;
  apply: (d: DomainDraft) => void;
  editable: boolean;
  labels: ComposerLabels;
  issues: IssueIndex;
  select: (s: Selection) => void;
  mode: ComposerMode;
  ruleOptions?: RuleOptionsFn;
}

const SCOPE_RE = /^[a-z0-9_-]+$/;
const MODEL_RE = /^[A-Z][a-zA-Z0-9_]*$/;
const TTL_RE = /^[1-9][0-9]*[smhdMy]$/;
const IDENT_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Light-touch input normalisation so names converge to the spec's patterns. */
export const normalizeScopeName = (v: string): string => v.toLowerCase().replace(/[\s.]+/g, '-');
export const normalizeModelName = (v: string): string => {
  const s = v.replace(/[^a-zA-Z0-9_]/g, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const normalizeIdent = (v: string): string => v.replace(/[^a-zA-Z0-9_$]/g, '');

/** The `#`-prefixed namespace marks a cross-model reference (a foreign key). */
export const MODEL_REFERENCE_PREFIX = '#';

export function isModelReferenceType(type: string): boolean {
  return typeof type === 'string' && type.startsWith(MODEL_REFERENCE_PREFIX);
}

/** Resolve a (possibly domain-declared) field type to its builtin base type and list flag. */
export function resolveBase(
  type: string,
  fields: Record<string, DrefFieldType>,
  models?: { name: string; properties: { name: string; type: string; key?: boolean }[] }[]
): { base: string; list: boolean } {
  // A model reference validates as its target model's key field type.
  if (isModelReferenceType(type)) {
    const targetName = type.slice(MODEL_REFERENCE_PREFIX.length);
    const target = models?.find((m) => m.name === targetName);
    const key = target?.properties.find((p) => p.key) ?? target?.properties[0];
    if (key?.type) return resolveBase(key.type, fields, models);
    return { base: 'String', list: false };
  }
  let current = type;
  let list = false;
  for (let i = 0; i < 16; i++) {
    if (FIELD_TYPES.includes(current)) return { base: current, list };
    const def = fields[current];
    if (!def) return { base: current, list };
    list = list || !!def.list;
    current = def.type;
  }
  return { base: current, list };
}

function typeOptions(draft: DomainDraft, labels: ComposerLabels, exclude?: string) {
  const custom = Object.keys(draft.fields).filter((n) => n !== exclude);
  const modelRefs = draft.models
    .map((m) => m.name)
    .filter((n): n is string => !!n && n !== exclude);
  return [
    ...FIELD_TYPES.map((t) => ({ value: t, label: t, group: custom.length || modelRefs.length ? 'Builtin' : undefined })),
    ...custom.map((t) => ({ value: t, label: t, group: labels.fieldTypes })),
    ...modelRefs.map((n) => ({ value: `${MODEL_REFERENCE_PREFIX}${n}`, label: `${MODEL_REFERENCE_PREFIX}${n}`, group: labels.modelReferences })),
  ];
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export function IssueList({ issues, labels, onNavigate }: { issues: ComposerIssue[]; labels: ComposerLabels; onNavigate?: (i: ComposerIssue) => void }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === 'error');
  return (
    <div className={cx('dc-issues', errors.length === 0 && 'dc-issues-warn')} role="alert">
      {issues.map((i, k) => (
        <div className="dc-issue" key={k}>
          <span className={`dc-issue-sev-${i.severity}`}>{i.severity === 'error' ? '✕' : '!'}</span>
          {onNavigate ? (
            <button type="button" className="dc-link" style={{ fontWeight: 400, color: 'inherit' }} onClick={() => onNavigate(i)}>
              {i.message}
            </button>
          ) : (
            <span>{i.message}</span>
          )}
          <code>{i.rule}</code>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="dc-section-head">
      <div>
        <h4>{title}</h4>
        {hint && <p>{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function AddButton({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" className={cx('dc-btn dc-btn-sm', primary && 'dc-btn-primary')} onClick={onClick}>
      <Icon.plus /> {label}
    </button>
  );
}

/** Empty state that teaches: what is missing, why it matters, and what to do. */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="dc-empty dc-empty-rich">
      <span className="dc-empty-title">{title}</span>
      {hint && <span className="dc-empty-hint">{hint}</span>}
      {action}
    </div>
  );
}

function ruleChip(c: ComposerRule, key: number) {
  const p = c.param === undefined ? '' : typeof c.param === 'object' ? formatParam(Array.isArray(c.param) ? 'string-list' : 'range', c.param) : String(c.param);
  return (
    <span key={key} className={cx('dc-chip', c.severity === 'warn' && 'dc-chip-warn')} title={c.severity === 'warn' ? 'warn only' : undefined}>
      {c.type}
      {p !== '' && <b>{p}</b>}
    </span>
  );
}

/** Plain-text rule summary for row tooltips (same formatting as the chips). */
function ruleTitle(rules: ComposerRule[]): string | undefined {
  if (rules.length === 0) return undefined;
  return rules
    .map((c) => {
      const p = c.param === undefined ? '' : typeof c.param === 'object' ? ` ${formatParam(Array.isArray(c.param) ? 'string-list' : 'range', c.param)}` : ` ${String(c.param)}`;
      return `${c.type}${p}${c.severity === 'warn' ? ' (warn only)' : ''}`;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Rules editor
// ---------------------------------------------------------------------------

export function RulesEditor({
  rules,
  onChange,
  options,
  siblings,
  editable,
  labels,
}: {
  rules: ComposerRule[];
  onChange: (next: ComposerRule[]) => void;
  options: RuleOption[];
  siblings: string[];
  editable: boolean;
  labels: ComposerLabels;
}) {
  if (!editable) {
    return rules.length ? <div className="dc-chips">{rules.map(ruleChip)}</div> : <span className="dc-muted dc-small">{labels.noRules}</span>;
  }
  const used = new Set(rules.map((c) => c.type));
  const available = options.filter((o) => !used.has(o.type));
  const setAt = (i: number, patch: Partial<ComposerRule>) => onChange(rules.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const listId = `dc-sib-${siblings.join('_')}`;
  return (
    <div className="dc-section" style={{ gap: 6 }}>
      {siblings.length > 0 && (
        <datalist id={listId}>
          {siblings.map((s) => <option key={s} value={`$${s}`} />)}
        </datalist>
      )}
      {rules.map((c, i) => {
        const opt = options.find((o) => o.type === c.type);
        return (
          <div className="dc-rule" key={i}>
            <span className="dc-rule-type">{c.type}</span>
            {opt?.param ? (
              <ParamInput
                kind={opt.param}
                value={c.param}
                allowRef={opt.ref}
                onChange={(v) => setAt(i, { param: v })}
                title={opt.ref ? labels.fieldRefHint : undefined}
              />
            ) : c.param !== undefined ? (
              <ParamInput kind="any" value={c.param} onChange={(v) => setAt(i, { param: v })} />
            ) : (
              <span />
            )}
            <Check editable checked={c.severity === 'warn'} onChange={(v) => setAt(i, { severity: v ? 'warn' : undefined })} label={labels.warnSeverity} title={labels.warnSeverityHint} />
            <button type="button" className="dc-icon-btn dc-danger" aria-label={labels.remove} title={labels.remove} onClick={() => onChange(rules.filter((_, k) => k !== i))}>
              <Icon.x />
            </button>
          </div>
        );
      })}
      <div>
        <select
          className="dc-select dc-select-sm dc-mono"
          style={{ width: 'auto', minWidth: 160 }}
          value=""
          aria-label={labels.addRule}
          onChange={(e) => {
            const type = e.target.value;
            if (!type) return;
            onChange([...rules, { type } as ComposerRule]);
          }}
        >
          <option value="">{labels.addRule}</option>
          {available.map((o) => (
            <option key={o.type} value={o.type}>
              {o.type}
              {o.param ? ' …' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain panel (name, version, description, formats, field types)
// ---------------------------------------------------------------------------

export function DomainPanel({ draft, apply, editable, labels: L, issues, select, ruleOptions }: PanelProps) {
  const fieldNames = Object.keys(draft.fields);
  const renameFieldType = (from: string, to: string) => {
    const next: Record<string, DrefFieldType> = {};
    for (const [k, v] of Object.entries(draft.fields)) next[k === from ? to : k] = v;
    const models = draft.models.map((m) => ({ ...m, properties: m.properties.map((p) => (p.type === from ? { ...p, type: to } : p)) }));
    apply({ ...draft, fields: next, models });
  };
  const addType = () => {
    let n = 1;
    while (draft.fields[`fieldType${n}`]) n++;
    apply(setFieldType(draft, `fieldType${n}`, { type: 'String' }));
  };
  return (
    <>
      <div className="dc-panel-head">
        <div>
          <div className="dc-kicker">{L.domain}</div>
          <h3 className="dc-title">{draft.name || <span className="dc-muted">{L.newDomain}</span>}</h3>
        </div>
      </div>
      <IssueList issues={issues.domain} labels={L} onNavigate={() => select({ kind: 'domain' })} />
      <div className="dc-grid">
        <Field label={L.domainName} error={!draft.name.trim() && editable ? L.domainName + ' *' : undefined}>
          <Text editable={editable} value={draft.name} placeholder="e.g. Billing" onChange={(v) => apply({ ...draft, name: v })} invalid={!draft.name.trim()} />
        </Field>
        <Field label={L.version}>
          <Text editable={editable} mono value={draft.version} placeholder="1.0.0" onChange={(v) => apply({ ...draft, version: v })} />
        </Field>
        <Field label={L.description} grow>
          <Text editable={editable} multiline value={draft.description} onChange={(v) => apply({ ...draft, description: v })} />
        </Field>
      </div>

      <section className="dc-section">
        <SectionHead title={L.formats} hint={L.formatsHint} />
        <div className="dc-grid">
          {(['date', 'time', 'dateTime'] as const).map((k) => (
            <Field key={k} label={k === 'date' ? L.dateFormat : k === 'time' ? L.timeFormat : L.dateTimeFormat}>
              <Text
                editable={editable}
                mono
                list={`dc-fmt-${k}`}
                value={draft.formats[k] ?? ''}
                placeholder={FORMAT_SUGGESTIONS[k][0]}
                onChange={(v) => apply(setFormats(draft, { [k]: v || undefined }))}
              />
              {editable && (
                <datalist id={`dc-fmt-${k}`}>
                  {FORMAT_SUGGESTIONS[k].map((s) => <option key={s} value={s} />)}
                </datalist>
              )}
            </Field>
          ))}
        </div>
      </section>

      <section className="dc-section">
        <SectionHead title={L.fieldTypes} hint={L.fieldTypesHint} action={editable && <AddButton label={L.addFieldType} onClick={addType} />} />
        {fieldNames.length === 0 && <div className="dc-empty">{L.none}</div>}
        {fieldNames.map((name) => {
          const def = draft.fields[name];
          const { base, list } = resolveBase(def.type, draft.fields);
          const opts = ruleOptions?.(base, list || !!def.list) ?? optionsFor(base, list || !!def.list);
          const bad = !IDENT_RE.test(name) || FIELD_TYPES.includes(name);
          return (
            <div className="dc-card" key={name}>
              <div className="dc-card-body">
                <div className="dc-grid" style={{ alignItems: 'end' }}>
                  <Field label={L.fieldTypeName} error={editable && bad ? 'identifier, not a builtin' : undefined}>
                    {editable ? (
                      <BufferedInput<string>
                        value={name}
                        small={false}
                        format={(v) => v}
                        parse={(raw) => {
                          const v = normalizeIdent(raw);
                          return v && (v === name || !draft.fields[v]) ? { ok: true, value: v } : { ok: false };
                        }}
                        onCommit={(v) => v !== name && renameFieldType(name, v)}
                      />
                    ) : (
                      <span className="dc-value dc-mono">{name}</span>
                    )}
                  </Field>
                  <Field label={L.baseType}>
                    <Select editable={editable} mono value={def.type} options={typeOptions(draft, L, name)} onChange={(v) => apply(setFieldType(draft, name, { ...def, type: v }))} />
                  </Field>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 30 }}>
                    <Check editable={editable} checked={!!def.list} label={L.list} onChange={(v) => apply(setFieldType(draft, name, { ...def, list: v || undefined }))} />
                    <span style={{ flex: 1 }} />
                    {editable && <ConfirmButton icon label={L.remove} confirmLabel={L.confirmRemove} onConfirm={() => apply(removeFieldType(draft, name))} />}
                  </div>
                </div>
                <Field label={L.rules}>
                  <RulesEditor
                    rules={(def.rules ?? []) as ComposerRule[]}
                    options={opts}
                    siblings={[]}
                    editable={editable}
                    labels={L}
                    onChange={(next) => apply(setFieldType(draft, name, { ...def, rules: next.length ? next : undefined }))}
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Scope panel
// ---------------------------------------------------------------------------

export function ScopePanel({ draft, apply, editable, labels: L, issues, select, index }: PanelProps & { index: number }) {
  const scope = draft.scopes[index];
  if (!scope) return null;
  const members = draft.models.map((m, i) => ({ m, i })).filter(({ m }) => m.scope === scope.name);
  const bad = !SCOPE_RE.test(scope.name);
  return (
    <>
      <div className="dc-panel-head">
        <div>
          <div className="dc-kicker">{L.scope}</div>
          <h3 className="dc-title dc-mono">{scope.name || '—'}</h3>
        </div>
        {editable && (
          <div className="dc-actions">
            <AddButton
              label={L.addModel}
              onClick={() => {
                apply(addModel(draft, newModel(draft, scope.name)));
                select({ kind: 'model', index: draft.models.length });
              }}
            />
            <ConfirmButton
              label={L.deleteScope}
              confirmLabel={L.confirmRemove}
              onConfirm={() => {
                apply(removeScope(draft, index));
                select({ kind: 'domain' });
              }}
            />
          </div>
        )}
      </div>
      <IssueList issues={issues.byScope.get(index) ?? []} labels={L} />
      <div className="dc-grid">
        <Field label={L.scopeName} hint={L.scopeNameHint} error={editable && bad ? L.scopeNameHint : undefined}>
          {editable ? (
            <BufferedInput<string>
              value={scope.name}
              format={v => v}
              parse={raw => {
                const v = normalizeScopeName(raw);
                return v && SCOPE_RE.test(v) ? { ok: true, value: v } : { ok: false };
              }}
              onCommit={v => apply(renameScope(draft, index, v))}
              placeholder="my-scope"
              small={false}
              mono
              ariaLabel={L.scopeName}
            />
          ) : (
            <Text editable={false} mono value={scope.name} onChange={() => {}} />
          )}
        </Field>
        <Field label={L.description} grow>
          <Text editable={editable} multiline value={scope.description} onChange={(v) => apply(updateScope(draft, index, { description: v || undefined }))} />
        </Field>
      </div>
      <section className="dc-section">
        <SectionHead title={L.scopeModels} hint={editable ? L.deleteScopeHint : undefined} />
        {members.length === 0 ? (
          <div className="dc-empty">{L.noModels}</div>
        ) : (
          <div className="dc-model-list">
            {members.map(({ m, i }) => (
              <button key={i} type="button" className="dc-model-card" onClick={() => select({ kind: 'model', index: i })}>
                {modelIcon(m.authority)}<div><strong>{m.name || L.unnamed}</strong>
                  <div className="dc-panel-meta"><span>{fmt(L.fieldsCount, { n: m.properties.length })}</span><span>{fmt(L.mappingsCount, { n: m.mapsFrom.length })}</span></div>
                </div><Icon.chevron />
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Model panel
// ---------------------------------------------------------------------------

export function newModel(draft: DomainDraft, scope?: string): Partial<ComposerModel> {
  let n = draft.models.length + 1;
  const names = new Set(draft.models.map((m) => m.name));
  while (names.has(`Model${n}`)) n++;
  return {
    name: `Model${n}`,
    scope,
    properties: [{ name: 'id', type: 'String', required: true, key: true, list: false, rules: [{ type: 'immutable' } as ComposerRule] }],
    mapsFrom: [],
  };
}

export function ModelPanel(props: PanelProps & { index: number; issueTarget?: ComposerIssue }) {
  const { draft, apply, editable, labels: L, issues, select, index, mode } = props;
  const model = draft.models[index];
  const [view, setView] = useState<'fields' | 'mappings' | 'settings'>('fields');
  const [open, setOpen] = useState<number | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const tabsId = useId();
  useEffect(() => {
    const target = props.issueTarget?.target;
    if (target?.kind !== 'model') return;
    setView(target.mapping !== undefined ? 'mappings' : target.property ? 'fields' : 'settings');
    if (target.property) setOpen(model.properties.findIndex((p) => p.name === target.property));
  }, [props.issueTarget]);
  if (!model) return null;

  const modelIssues = issues.byModel.get(index) ?? [];
  const propIssues = (name: string) => modelIssues.filter((i) => i.target.kind === 'model' && i.target.property === name);
  const nameBad = !MODEL_RE.test(model.name);
  const ttlBad = !!model.ttl && !TTL_RE.test(model.ttl);
  const kind = useMemo(() => {
    try {
      return classifyModel(toDocument({ ...draft, models: [model] }).models![0]);
    } catch {
      return undefined;
    }
  }, [draft, model]);

  const scopeOptions = [{ value: '', label: L.noScope }, ...draft.scopes.map((s) => ({ value: s.name, label: s.name }))];

  const head = (
    <div className="dc-panel-head">
      <div>
        <div className="dc-kicker">
          <button type="button" className="dc-link" onClick={() => select({ kind: 'domain' })} disabled={mode === 'mappings'}>{draft.name || L.domain}</button>
          <span className="dc-breadcrumb-divider">/</span>{model.scope || L.unscoped}
          {kind && <span className="dc-badge" style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>{kind}</span>}
        </div>
        <h3 className="dc-title">{model.name || L.unnamed}</h3>
        {model.description && <p className="dc-panel-description">{model.description}</p>}
          <div className="dc-panel-meta">
            <span>{fmt(L.fieldsCount, { n: model.properties.length })}</span>
            <span>{fmt(L.mappingsCount, { n: model.mapsFrom.length })}</span>
            {model.authority && <span>{L.authority}: {model.authority}</span>}
          </div>
      </div>
      {editable && mode === 'full' && view === 'settings' && (
        <div className="dc-actions">
          <button
            type="button"
            className="dc-btn dc-btn-sm"
            onClick={() => {
              const names = new Set(draft.models.map((m) => m.name));
              let name = `${model.name}Copy`;
              for (let n = 2; names.has(name); n++) name = `${model.name}Copy${n}`;
              apply(addModel(draft, { ...structuredCloneSafe(model), name }));
              select({ kind: 'model', index: draft.models.length });
            }}
          >
            <Icon.duplicate /> {L.duplicateModel}
          </button>
          <ConfirmButton
            label={L.deleteModel}
            confirmLabel={L.confirmRemove}
            onConfirm={() => {
              apply(removeModel(draft, index));
              select(draft.models.length > 1 ? { kind: 'model', index: Math.max(0, index - 1) } : { kind: 'domain' });
            }}
          />
        </div>
      )}
    </div>
  );

  // Mapping-only mode: models are fixed; the Mappings view is the whole screen.
  if (mode === 'mappings') {
    return (
      <>
        {head}
        <MappingsSection {...props} model={model} />
      </>
    );
  }

  const settings = (
    <div className="dc-grid">
      <Field label={L.modelName} hint={L.modelNameHint} error={editable && nameBad ? L.modelNameHint : undefined}>
        {editable ? (
          <BufferedInput<string>
            value={model.name}
            format={v => v}
            parse={raw => {
              const v = normalizeModelName(raw);
              return v && MODEL_RE.test(v) ? { ok: true, value: v } : { ok: false };
            }}
            onCommit={v => apply(updateModel(draft, index, { name: v }))}
            placeholder="MyModel"
            small={false}
            mono
            ariaLabel={L.modelName}
          />
        ) : (
          <Text editable={false} mono value={model.name} onChange={() => {}} />
        )}
      </Field>
      <Field label={L.scope}>
        <Select editable={editable} mono value={model.scope ?? ''} options={scopeOptions} onChange={(v) => apply(updateModel(draft, index, { scope: v || undefined }))} />
      </Field>
      <Field label={L.authority} hint={editable ? L.authorityHint : undefined}>
        <Select
          editable={editable}
          value={model.authority ?? ''}
          options={[{ value: '', label: '' }, ...MODEL_AUTHORITIES]}
          onChange={(v) => apply(updateModel(draft, index, { authority: (v || undefined) as ModelAuthority | undefined }))}
        />
      </Field>
      <Field label={L.ttl} hint={editable ? L.ttlHint : undefined} error={ttlBad ? L.ttlHint : undefined}>
        <Text editable={editable} mono value={model.ttl ?? ''} placeholder="30d" invalid={ttlBad} onChange={(v) => apply(updateModel(draft, index, { ttl: v.trim() || undefined }))} />
      </Field>
      <Field label={L.count} hint={editable ? L.countHint : undefined}>
        {editable ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <NumberInput integer ariaLabel={L.min} placeholder={L.min} value={model.count?.min} onChange={(v) => apply(updateModel(draft, index, { count: cleanRange({ ...model.count, min: v }) }))} />
            <span className="dc-muted">–</span>
            <NumberInput integer ariaLabel={L.max} placeholder={L.max} value={model.count?.max} onChange={(v) => apply(updateModel(draft, index, { count: cleanRange({ ...model.count, max: v }) }))} />
          </div>
        ) : (
          <span className="dc-value dc-mono">{model.count ? `${model.count.min ?? 0} – ${model.count.max ?? '∞'}` : '—'}</span>
        )}
      </Field>
      <Field label={L.description} grow>
        <Text editable={editable} multiline value={model.description} onChange={(v) => apply(updateModel(draft, index, { description: v || undefined }))} />
      </Field>
    </div>
  );

  const modelLevelIssues = modelIssues.filter((i) => i.target.kind === 'model' && i.target.mapping === undefined);
  const navigate = (i: ComposerIssue) => {
    const prop = i.target.kind === 'model' ? i.target.property : undefined;
    const at = prop === undefined ? -1 : model.properties.findIndex((p) => p.name === prop);
    setView('fields');
    if (at >= 0) setOpen(at);
  };

  // Read-only renders as one continuous, printable document: fields, then mappings.
  if (!editable) {
    return (
      <>
        {head}
        <IssueList issues={modelLevelIssues} labels={L} />
        {settings}
        <PropertiesTable {...props} model={model} open={open} setOpen={setOpen} focusRow={focusRow} setFocusRow={setFocusRow} propIssues={propIssues} />
        <MappingsSection {...props} model={model} />
      </>
    );
  }

  return (
    <>
      {head}
      <IssueList issues={modelLevelIssues} labels={L} onNavigate={navigate} />
      <TabBar id={tabsId} value={view} onChange={setView} label={model.name || L.model} items={[
        { value: 'fields', label: L.fieldsTab, count: model.properties.length },
        { value: 'mappings', label: L.mappingsTab, count: model.mapsFrom.length },
        { value: 'settings', label: L.settings },
      ]} />
      <div className="dc-subview" role="tabpanel" id={`${tabsId}-fields`} aria-labelledby={`${tabsId}-fields-tab`} hidden={view !== 'fields'}>
        <PropertiesTable {...props} model={model} open={open} setOpen={setOpen} focusRow={focusRow} setFocusRow={setFocusRow} propIssues={propIssues} />
      </div>
      <div className="dc-subview" role="tabpanel" id={`${tabsId}-mappings`} aria-labelledby={`${tabsId}-mappings-tab`} hidden={view !== 'mappings'}>
        <MappingsSection {...props} model={model} />
      </div>
      <div className="dc-subview dc-section" role="tabpanel" id={`${tabsId}-settings`} aria-labelledby={`${tabsId}-settings-tab`} hidden={view !== 'settings'}>
        <SectionHead title={L.settings} hint={L.modelSettingsHint} />
        {settings}
      </div>
    </>
  );
}

function cleanRange(r: { min?: number; max?: number }): { min?: number; max?: number } | undefined {
  const out: { min?: number; max?: number } = {};
  if (r.min !== undefined) out.min = r.min;
  if (r.max !== undefined) out.max = r.max;
  return Object.keys(out).length ? out : undefined;
}

function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

function PropertiesTable({
  draft,
  apply,
  editable,
  labels: L,
  index,
  model,
  open,
  setOpen,
  focusRow,
  setFocusRow,
  propIssues,
  ruleOptions,
}: PanelProps & {
  index: number;
  model: ComposerModel;
  open: number | null;
  setOpen: (n: number | null) => void;
  focusRow: number | null;
  setFocusRow: (n: number | null) => void;
  propIssues: (name: string) => ComposerIssue[];
}) {
  const props = model.properties;
  const set = (i: number, patch: Partial<ComposerField>) => apply(updateProperty(draft, index, i, patch));
  const add = () => {
    const names = new Set(props.map((p) => p.name));
    let n = props.length + 1;
    while (names.has(`field${n}`)) n++;
    apply(addProperty(draft, index, { name: `field${n}` }));
    setFocusRow(props.length);
    setOpen(null);
  };
  const reorder = useReorder(props.length, (from, to) => {
    apply(moveProperty(draft, index, from, to));
    if (open !== null) setOpen(movedIndex(open, from, to));
  });
  const types = typeOptions(draft, L);
  const cols = editable ? 8 : 6;

  return (
    <section className="dc-section">
      <SectionHead title={L.fieldsTab} hint={editable ? L.fieldsHint : undefined} action={editable && props.length > 0 && <AddButton primary label={L.addProperty} onClick={add} />} />
      {props.length === 0 ? (
        editable ? (
          <EmptyState title={L.noProperties} hint={L.noPropertiesHint} action={<AddButton primary label={L.addProperty} onClick={add} />} />
        ) : (
          <div className="dc-empty">{L.noProperties}</div>
        )
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="dc-table" data-reorder="fields">
            <thead>
              <tr>
                {editable && <th className="dc-cell-grip" aria-label={L.reorderRows} />}
                <th style={{ width: 26 }} />
                <th>{L.propertyName}</th>
                <th>{L.type}</th>
                <th className="dc-center">{L.required}</th>
                <th className="dc-center">{L.key}</th>
                <th className="dc-center">{L.list}</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {props.map((p, i) => {
                const isOpen = open === i;
                const errs = propIssues(p.name).filter((x) => x.severity === 'error');
                const { base, list } = resolveBase(p.type, draft.fields, draft.models);
                const opts = ruleOptions?.(base, p.list || list) ?? optionsFor(base, p.list || list);
                const siblings = props.filter((_, k) => k !== i).map((s) => s.name).filter(Boolean);
                const rTitle = ruleTitle(p.rules);
                const overrides = !!p.authority && p.authority !== (model.authority ?? 'internal');
                return (
                  <Fragment key={i}>
                    <tr className={cx(editable && isOpen && 'dc-row-open', errs.length > 0 && 'dc-row-err', editable && reorder.rowClass(i)) || undefined} {...(editable ? reorder.rowProps(i) : {})}>
                      {editable && (
                        <td className="dc-cell-grip">
                          <DragHandle label={L.reorderRows} handleProps={reorder.handleProps(i)} />
                        </td>
                      )}
                      <td>
                        {editable && <button type="button" className="dc-icon-btn" aria-expanded={isOpen} aria-label={`${L.details}: ${p.name}`} title={L.details} onClick={() => setOpen(isOpen ? null : i)}>
                          <span className="dc-chevron" data-open={isOpen}><Icon.chevron /></span>
                        </button>}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        {editable ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <Text editable small mono value={p.name} autoFocus={focusRow === i} invalid={!p.name || errs.length > 0} onChange={(v) => set(i, { name: normalizeIdent(v) })} ariaLabel={L.propertyName} />
                            {overrides && (
                              <Tip label={`${L.authority}: ${p.authority}`}>
                                <span className="dc-icon-authority">{modelIcon(p.authority)}</span>
                              </Tip>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="dc-mono" style={{ fontWeight: 550 }}>{p.name}</span>
                            {overrides && (
                              <Tip label={`${L.authority}: ${p.authority}`}>
                                <span className="dc-icon-authority" style={{ marginLeft: 5 }}>{modelIcon(p.authority)}</span>
                              </Tip>
                            )}
                            {p.description && <div className="dc-hint">{p.description}</div>}
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <Select editable={editable} small mono value={p.type} options={types} onChange={(v) => set(i, { type: v })} ariaLabel={L.type} />
                          {rTitle && (
                            <Tip label={rTitle}>
                              {editable ? (
                                <button type="button" className="dc-icon-btn dc-icon-rule" aria-label={`${L.rules}: ${p.name}`} onClick={() => setOpen(isOpen ? null : i)}>
                                  <Icon.alert />
                                </button>
                              ) : (
                                <span className="dc-icon-rule">
                                  <Icon.alert />
                                </span>
                              )}
                            </Tip>
                          )}
                        </div>
                      </td>
                      <td className="dc-center"><Check editable={editable} checked={p.required} onChange={(v) => set(i, { required: v })} title={L.required} /></td>
                      <td className="dc-center"><Check editable={editable} checked={p.key} onChange={(v) => set(i, { key: v, required: v ? true : p.required })} title={L.key} /></td>
                      <td className="dc-center"><Check editable={editable} checked={p.list} onChange={(v) => set(i, { list: v })} title={L.list} /></td>
                      {editable && (
                        <td>
                          <div className="dc-row-actions">
                            <ConfirmButton icon label={L.remove} confirmLabel={L.confirmRemove} onConfirm={() => { apply(removeProperty(draft, index, i)); setOpen(null); }} />
                          </div>
                        </td>
                      )}
                    </tr>
                    {editable && isOpen && (
                      <tr className="dc-detail">
                        <td colSpan={cols}>
                          <div className="dc-detail-inner">
                            <IssueList issues={propIssues(p.name)} labels={L} />
                            <div className="dc-grid dc-grid-detail">
                              <Field label={L.description}>
                                <Text editable={editable} value={p.description} onChange={(v) => set(i, { description: v || undefined })} />
                              </Field>
                              <Field label={L.authority}>
                                <Select
                                  editable={editable}
                                  small
                                  value={p.authority ?? ''}
                                  options={[{ value: '', label: '' }, ...MODEL_AUTHORITIES]}
                                  onChange={(v) => set(i, { authority: (v || undefined) as ModelAuthority | undefined })}
                                />
                              </Field>
                            </div>
                            <Field label={L.rules} hint={editable && opts.some((o) => o.ref) ? L.fieldRefHint : undefined}>
                              <RulesEditor
                                rules={p.rules}
                                options={opts}
                                siblings={siblings}
                                editable={editable}
                                labels={L}
                                onChange={(next) => set(i, { rules: next })}
                              />
                            </Field>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mappings (mapsFrom) — first-class view per model
// ---------------------------------------------------------------------------

function MappingsSection({ draft, apply, editable, labels: L, index, model, issues }: PanelProps & { index: number; model: ComposerModel }) {
  const listId = useId();
  const maps = model.mapsFrom;
  const propNames = model.properties.map((p) => p.name).filter(Boolean);
  const modelIssues = issues.byModel.get(index) ?? [];
  const add = () => apply(addMapping(draft, index, { name: `${model.name || 'Source'}Source`, fields: [] }));
  return (
    <section className="dc-section">
      <SectionHead title={L.mappings} hint={editable ? L.mappingsHint : undefined} action={editable && maps.length > 0 && <AddButton primary label={L.addMapping} onClick={add} />} />
      {editable && (
        <datalist id={listId}>
          {propNames.map((n) => <option key={n} value={n} />)}
        </datalist>
      )}
      {maps.length === 0 &&
        (editable ? (
          <EmptyState title={L.noMappingsTitle} hint={L.noMappingsHint} action={<AddButton primary label={L.addMapping} onClick={add} />} />
        ) : (
          <div className="dc-empty">{L.noMappings}</div>
        ))}
      {maps.map((mp, mi) => (
        <MappingCard
          key={mi}
          mapping={mp}
          editable={editable}
          labels={L}
          listId={listId}
          issues={modelIssues.filter((i) => i.target.kind === 'model' && i.target.mapping === mi)}
          onPatch={(patch) => apply(updateMapping(draft, index, mi, patch))}
          onRemove={() => apply(removeMapping(draft, index, mi))}
          onAddField={() => apply(addMappingField(draft, index, mi, { from: '' }))}
          onFieldPatch={(fi, patch) => apply(updateMappingField(draft, index, mi, fi, patch))}
          onFieldRemove={(fi) => apply(removeMappingField(draft, index, mi, fi))}
        />
      ))}
    </section>
  );
}

function MappingCard({
  mapping,
  editable,
  labels: L,
  listId,
  issues,
  onPatch,
  onRemove,
  onAddField,
  onFieldPatch,
  onFieldRemove,
}: {
  mapping: ComposerMapping;
  editable: boolean;
  labels: ComposerLabels;
  listId: string;
  issues: ComposerIssue[];
  onPatch: (p: Partial<ComposerMapping>) => void;
  onRemove: () => void;
  onAddField: () => void;
  onFieldPatch: (i: number, p: Partial<ComposerMappingField>) => void;
  onFieldRemove: (i: number) => void;
}) {
  const count = mapping.fields.length;
  const cardRef = useRef<HTMLDivElement>(null);
  const previousCount = useRef(count);
  useEffect(() => {
    if (count > previousCount.current) cardRef.current?.querySelector<HTMLTableRowElement>('tbody tr:last-child')?.querySelector<HTMLInputElement>('input')?.focus();
    previousCount.current = count;
  }, [count]);
  // The composer API has no moveMappingField; re-ordering the array and
  // patching it back through updateMapping is the supported mutation.
  const reorder = useReorder(count, (from, to) => {
    const fields = mapping.fields.slice();
    const [moved] = fields.splice(from, 1);
    fields.splice(to, 0, moved);
    onPatch({ fields });
  });
  return (
    <div className="dc-card dc-mapping-card" ref={cardRef}>
      <div className="dc-card-head">
        <div><span className="dc-kicker">{L.mappingName}</span><h4>{mapping.name || L.unnamed}</h4>
          <div className="dc-panel-meta">{mapping.provider && <span>{mapping.provider}</span>}{mapping.version && <span>{mapping.version}</span>}<span>{fmt(L.fieldsCount, { n: count })}</span></div>
        </div>
        {editable && <ConfirmButton icon label={L.remove} confirmLabel={L.confirmRemove} onConfirm={onRemove} />}
      </div>
      <div className="dc-card-body">
        {editable ? (
          <details className="dc-settings-disclosure" open={count === 0 || !mapping.name}>
            <summary><Icon.settings />{L.editMapping}<span className="dc-chevron"><Icon.chevron /></span></summary>
            <div className="dc-grid" style={{ alignItems: 'end' }}>
              <Field label={L.mappingName}>
                <Text editable mono value={mapping.name} onChange={(v) => onPatch({ name: v })} />
              </Field>
              <Field label={L.provider}>
                <Text editable value={mapping.provider} onChange={(v) => onPatch({ provider: v || undefined })} />
              </Field>
              <Field label={L.sourceVersion}>
                <Text editable mono value={mapping.version} onChange={(v) => onPatch({ version: v || undefined })} />
              </Field>
              <Field label={L.description} grow>
                <Text editable value={mapping.description} onChange={(v) => onPatch({ description: v || undefined })} />
              </Field>
            </div>
          </details>
        ) : (
          mapping.description && <p className="dc-hint">{mapping.description}</p>
        )}
        <IssueList issues={issues} labels={L} />
        {editable && count > 0 && <p className="dc-hint">{L.mappingFieldsHint}</p>}
        {count === 0 ? (
          <div className="dc-chips">
            <span className="dc-muted dc-small">{editable ? L.noMappingFields : L.none}</span>
            {editable && (
              <button type="button" className="dc-link dc-small" onClick={onAddField}>+ {L.addField}</button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
             <table className="dc-table dc-table-map" data-reorder="mapping-fields">
              <thead>
                <tr>
                  {editable && <th className="dc-cell-grip" aria-label={L.reorderRows} />}
                  <th className="dc-col-source">{L.source}</th>
                  <th className="dc-col-target">{L.target}</th>
                  <th>{L.transform}</th>
                  {editable && <th style={{ width: 30 }} />}
                </tr>
              </thead>
              <tbody>
                {mapping.fields.map((f, fi) => (
                  <MappingFieldRow
                    key={fi}
                    index={fi}
                    field={f}
                    editable={editable}
                    labels={L}
                    listId={listId}
                    reorder={reorder}
                    onPatch={(p) => onFieldPatch(fi, p)}
                    onRemove={() => onFieldRemove(fi)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editable && count > 0 && (
          <div>
            <button type="button" className="dc-link dc-small" onClick={onAddField}>+ {L.addField}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MappingFieldRow({
  field,
  index,
  editable,
  labels: L,
  listId,
  reorder,
  onPatch,
  onRemove,
}: {
  field: ComposerMappingField;
  index: number;
  editable: boolean;
  labels: ComposerLabels;
  listId: string;
  reorder: ReturnType<typeof useReorder>;
  onPatch: (p: Partial<ComposerMappingField>) => void;
  onRemove: () => void;
}) {
  const steps = field.transform;
  const setSteps = (next: ComposerTransformStep[]) => onPatch({ transform: next });

  if (!editable) {
    return (
      <tr>
        <td className="dc-mono dc-map-src">{displayValue(field.from)}</td>
        <td className="dc-mono">{field.to ?? (Array.isArray(field.from) ? '—' : field.from)}</td>
        <td>
          <div className="dc-chips">
            {steps.length === 0 ? (
              <span className="dc-muted">—</span>
            ) : (
              steps.map((s, k) => (
                <span className="dc-chip" key={k}>
                  {s.type}
                  {s.param !== undefined && <b>{typeof s.param === 'object' ? JSON.stringify(s.param) : String(s.param)}</b>}
                </span>
              ))
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={reorder.rowClass(index) || undefined} {...reorder.rowProps(index)}>
      <td className="dc-cell-grip">
        <DragHandle label={L.reorderRows} handleProps={reorder.handleProps(index)} />
      </td>
      <td>
        <BufferedInput<string | string[]>
          value={field.from}
          format={displayValue}
          parse={(raw) => {
            const parts = raw.split(',').map((s) => s.trim());
            return { ok: true, value: parts.length > 1 ? parts.filter(Boolean) : raw.trim() };
          }}
          onCommit={(v) => onPatch({ from: v })}
          placeholder={L.fromHint}
          ariaLabel={L.source}
        />
      </td>
      <td>
        <input
          className="dc-input dc-input-sm dc-mono"
          list={listId}
          value={field.to ?? ''}
          placeholder={Array.isArray(field.from) ? `${L.target} *` : field.from || L.target}
          aria-label={L.target}
          aria-invalid={(Array.isArray(field.from) && !field.to) || undefined}
          onChange={(e) => onPatch({ to: e.target.value || undefined })}
        />
      </td>
      <td>
        <div className="dc-chips">
          {steps.map((s, k) => {
            const opt = TRANSFORM_OPTIONS.find((o) => o.type === s.type);
            return (
              <span className="dc-step dc-chip" key={k}>
                {s.type}
                {opt?.param && (
                  <span style={{ width: 110 }}>
                    <ParamInput kind={opt.param} value={s.param} placeholder={opt.example} onChange={(v) => setSteps(steps.map((x, j) => (j === k ? { ...x, param: v } : x)))} />
                  </span>
                )}
                <button type="button" className="dc-icon-btn" style={{ width: 16, height: 16 }} aria-label={L.remove} onClick={() => setSteps(steps.filter((_, j) => j !== k))}>
                  <Icon.x />
                </button>
              </span>
            );
          })}
          <select
            className="dc-select dc-select-sm dc-mono"
            style={{ width: 'auto' }}
            value=""
            aria-label={L.addTransform}
            onChange={(e) => {
              const t = e.target.value;
              if (t) setSteps([...steps, { type: t }]);
            }}
          >
            <option value="">{L.addTransform}</option>
            {TRANSFORM_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.type}</option>)}
          </select>
        </div>
      </td>
      <td>
        <div className="dc-row-actions">
          <ConfirmButton icon label={L.remove} confirmLabel={L.confirmRemove} onConfirm={onRemove} />
        </div>
      </td>
    </tr>
  );
}

export { fmt };
