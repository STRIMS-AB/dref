import { validateDomain, validateModel, validateMappingDefinition } from '@dref/validator';
import type { DomainDocument, DomainModel, ValidationResult } from '@dref/validator';

export type IssueTarget =
  | { kind: 'domain' }
  | { kind: 'scope'; index: number }
  | { kind: 'model'; index: number; property?: string; mapping?: number };

export interface ComposerIssue {
  severity: 'error' | 'warning';
  target: IssueTarget;
  field: string;
  rule: string;
  message: string;
}

export interface IssueIndex {
  all: ComposerIssue[];
  domain: ComposerIssue[];
  byScope: Map<number, ComposerIssue[]>;
  byModel: Map<number, ComposerIssue[]>;
}

const MODEL_LEVEL = (field: string, rule: string): boolean =>
  (field === 'name' && rule === 'pattern') ||
  (field === 'scope' && rule === 'pattern') ||
  field === 'count' ||
  (field === 'key' && rule === 'required');

const DOMAIN_MODEL_RULES = new Set(['duplicateModel', 'unknownScope', 'unknownFieldType', 'modelReference', 'unknownModelReference']);

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Attributes validation issues to the element that caused them (domain,
 * scope, model, property or mapping) so the designer can badge the sidebar
 * and highlight rows. The canonical validators do not return structured
 * paths, so this re-validates each model on its own and routes domain-level
 * findings by their `field` convention.
 */
export function indexIssues(doc: DomainDocument, extra?: ValidationResult): IssueIndex {
  const all: ComposerIssue[] = [];
  const domain = safe(() => validateDomain(doc), { isValid: false, errors: [], warnings: [] } as ValidationResult);
  const models: DomainModel[] = doc.models ?? [];
  const scopes = doc.scopes ?? [];
  const modelResults = models.map((m) => safe(() => validateModel(m), { isValid: true, errors: [], warnings: [] } as ValidationResult));
  const mappingsByModel = models.map((m) => (m.mapsFrom ?? []).map((mp) => safe(() => validateMappingDefinition(mp), { isValid: true, errors: [], warnings: [] } as ValidationResult)));
  const diagnosticKey = (e: { field: string; rule: string; message: string }) => `${e.field}|${e.rule}|${e.message}`;
  const modelErrorKeys = new Set([...modelResults, ...mappingsByModel.flat()].flatMap((r) => r.errors).map(diagnosticKey));

  let invalidScopeCursor = 0;
  for (const e of domain.errors) {
    // Domain validation aggregates child diagnostics. A mapping's `name`
    // error belongs to that mapping, not to the domain-name editor.
    if (modelErrorKeys.has(diagnosticKey(e))) continue;
    if (e.field === 'name' || e.field === 'domain' || e.field.startsWith('defaults.')) {
      all.push({ severity: 'error', target: { kind: 'domain' }, ...e });
    } else if (e.field === 'scopes' || e.field.startsWith('scopes[')) {
      const name = /^scopes\[(.*)\]$/.exec(e.field)?.[1];
      let index = name !== undefined ? scopes.findIndex((s) => s.name === name) : -1;
      if (index < 0 && name !== undefined && /^\d+$/.test(name)) {
        const num = Number(name);
        if (num >= 0 && num < scopes.length) index = num;
      }
      if (index < 0 && e.field === 'scopes') {
        const nextInvalidIndex = scopes.findIndex((s, i) => i >= invalidScopeCursor && !/^[a-z0-9_-]+$/.test(s?.name ?? ''));
        if (nextInvalidIndex >= 0) {
          index = nextInvalidIndex;
          invalidScopeCursor = nextInvalidIndex + 1;
        }
      }
      all.push({ severity: 'error', target: index >= 0 ? { kind: 'scope', index } : { kind: 'domain' }, ...e });
    } else if (DOMAIN_MODEL_RULES.has(e.rule)) {
      models.forEach((m, index) => {
        const label = m?.name ?? '(unnamed)';
        if (e.field === label) {
          all.push({ severity: 'error', target: { kind: 'model', index }, ...e });
        } else if (e.field.startsWith(label + '.')) {
          all.push({ severity: 'error', target: { kind: 'model', index, property: e.field.slice(label.length + 1) }, ...e });
        }
      });
    }
  }

  models.forEach((m, index) => {
    const res = modelResults[index];
    const mappingResults = mappingsByModel[index];
    const names = new Set((m.properties ?? []).map((p) => p.name));
    const route = (severity: 'error' | 'warning') => (e: { field: string; rule: string; message: string }) => {
      const property = !MODEL_LEVEL(e.field, e.rule) && names.has(e.field) ? e.field : undefined;
      all.push({ severity, target: { kind: 'model', index, property }, ...e });
    };
    res.errors.forEach(route('error'));
    res.warnings.forEach(route('warning'));
    mappingResults.forEach((r, mapping) => {
      r.errors.forEach((e) => all.push({ severity: 'error', target: { kind: 'model', index, mapping }, ...e }));
      r.warnings.forEach((e) => all.push({ severity: 'warning', target: { kind: 'model', index, mapping }, ...e }));
    });
  });

  for (const w of domain.warnings) {
    if (!all.some((i) => i.message === w.message)) all.push({ severity: 'warning', target: { kind: 'domain' }, ...w });
  }

  // Findings from a host-supplied validator that the canonical one did not report.
  if (extra) {
    for (const e of extra.errors) {
      if (!all.some((i) => i.message === e.message)) all.push({ severity: 'error', target: { kind: 'domain' }, ...e });
    }
    for (const w of extra.warnings) {
      if (!all.some((i) => i.message === w.message)) all.push({ severity: 'warning', target: { kind: 'domain' }, ...w });
    }
  }

  const isDuplicate = (a: ComposerIssue, b: ComposerIssue) =>
    a.message === b.message &&
    a.field === b.field &&
    a.rule === b.rule &&
    (a.target.kind === 'model' && b.target.kind === 'model' ? a.target.property === b.target.property : true);

  const index: IssueIndex = { all, domain: [], byScope: new Map(), byModel: new Map() };
  for (const issue of all) {
    const t = issue.target;
    if (t.kind === 'domain') {
      if (!index.domain.some((existing) => isDuplicate(existing, issue))) {
        index.domain.push(issue);
      }
    } else {
      const map = t.kind === 'scope' ? index.byScope : index.byModel;
      const list = map.get(t.index) ?? [];
      if (!list.some((existing) => isDuplicate(existing, issue))) {
        list.push(issue);
      }
      map.set(t.index, list);
    }
  }
  return index;
}
