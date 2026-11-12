import type {
  DrefRule,
  DrefFieldType,
  DrefProperty,
  DomainDocument,
  DomainModel,
  FieldMapping,
  Formats,
  MappingDefinition,
  ModelAuthority,
  Range,
  Transform,
  ValidationResult
} from './types.js';
import { validateDomain } from './validator.js';

/**
 * Framework-agnostic domain composer core: a plain (draft) state for a DRef
 * domain document (scopes, models, properties, rules and incoming
 * mappings), pure immutable CRUD operations over it, and serialization to and
 * from the canonical {@link DomainDocument} shape.
 *
 * The draft is intentionally close to the document it produces so that
 * {@link fromDocument} / {@link toDocument} are near-lossless round-trips.
 * Nothing here depends on a UI framework; `dref-react` binds React on top.
 */

export interface ComposerRule extends DrefRule {}

export interface ComposerField {
  name: string;
  type: string;
  required: boolean;
  key: boolean;
  list: boolean;
  authority?: ModelAuthority;
  description?: string;
  rules: ComposerRule[];
}

export interface ComposerTransformStep {
  type: string;
  param?: any;
}

/**
 * One mapping rule. `from` reads a single property of the incoming payload — or
 * an array of properties when the transform chain starts from several (e.g. a
 * `join` step). Mirror of the document's {@link FieldMapping}.
 */
export interface ComposerMappingField {
  from: string | string[];
  to?: string;
  transform: ComposerTransformStep[];
}

export interface ComposerMapping {
  name: string;
  provider?: string;
  version?: string;
  description?: string;
  fields: ComposerMappingField[];
}

export interface ComposerModel {
  name: string;
  scope?: string;
  authority?: ModelAuthority;
  ttl?: string;
  count?: Range;
  description?: string;
  mapsFrom: ComposerMapping[];
  properties: ComposerField[];
}

export interface ComposerScope {
  name: string;
  description?: string;
}

export interface DomainDraft {
  name: string;
  version: string;
  description: string;
  formats: Formats;
  /** Domain field types: named, reusable field definitions. */
  fields: Record<string, DrefFieldType>;
  scopes: ComposerScope[];
  models: ComposerModel[];
}

export type DraftValidator = (doc: DomainDocument) => ValidationResult;

export interface CreateDraftOptions {
  name: string;
  version?: string;
  description?: string;
  formats?: Formats;
  fields?: Record<string, DrefFieldType>;
}

const DEFAULT_VERSION = '1.0.0';

export function createDraft(options: CreateDraftOptions): DomainDraft {
  return {
    name: options.name ?? '',
    version: options.version ?? DEFAULT_VERSION,
    description: options.description ?? '',
    formats: options.formats ?? {},
    fields: options.fields ?? {},
    scopes: [],
    models: [],
  };
}

/** Build a draft from an existing domain document (import into the editor). */
export function fromDocument(doc: DomainDocument): DomainDraft {
  return {
    name: doc.name ?? '',
    version: doc.version ?? DEFAULT_VERSION,
    description: doc.description ?? '',
    formats: doc.defaults?.formats ?? {},
    fields: doc.defaults?.fields ?? {},
    scopes: (doc.scopes ?? []).map((s) => ({ name: s.name, description: s.description })),
    models: (doc.models ?? []).map(modelFromDocument),
  };
}

function modelFromDocument(m: DomainModel): ComposerModel {
  return {
    name: m.name ?? '',
    scope: m.scope,
    authority: m.authority,
    ttl: m.ttl,
    count: m.count,
    description: (m as { description?: string }).description,
    mapsFrom: (m.mapsFrom ?? []).map(mappingFromDocument),
    properties: (m.properties ?? []).map(propertyFromDocument),
  };
}

function propertyFromDocument(p: DrefProperty): ComposerField {
  const rulesList = (p.rules ?? []).map((c) => ({
    type: c.type,
    param: c.param,
    severity: c.severity,
    description: c.description
  }));
  return {
    name: p.name ?? '',
    type: p.type ?? 'String',
    required: p.required ?? false,
    key: p.key ?? false,
    list: p.list ?? false,
    authority: p.authority,
    description: p.description,
    rules: rulesList,
  };
}

function mappingFromDocument(m: MappingDefinition): ComposerMapping {
  return {
    name: m.name,
    provider: m.provider,
    version: m.version,
    description: m.description,
    fields: (m.fields ?? []).map((f) => {
      if (typeof f === 'string') return { from: f, transform: [] };
      const steps: ComposerTransformStep[] = (f.transform ?? []).map((t) =>
        typeof t === 'string'
          ? { type: t }
          : t.param === undefined
            ? { type: t.type }
            : { type: t.type, param: t.param }
      );
      return { from: f.from, to: f.to, transform: steps };
    }),
  };
}

/** Serialize the draft to a canonical domain document. */
export function toDocument(
  draft: DomainDraft,
  opts?: { schema?: string }
): DomainDocument {
  const output: DomainDocument = { name: draft.name ?? '' };
  if (opts?.schema) output.$schema = opts.schema;
  if (draft.version && draft.version !== DEFAULT_VERSION) output.version = draft.version;

  const defaults: DomainDocument['defaults'] = {};
  const formats: Formats = {};
  for (const k of ['date', 'time', 'dateTime'] as const) {
    if (draft.formats?.[k]) formats[k] = draft.formats[k];
  }
  if (Object.keys(formats).length > 0) defaults.formats = formats;
  if (draft.fields && Object.keys(draft.fields).length > 0) defaults.fields = draft.fields;
  if (Object.keys(defaults).length > 0) output.defaults = defaults;

  if (draft.description) output.description = draft.description;
  if (draft.scopes.length > 0) {
    output.scopes = draft.scopes.map((s) => {
      const scope: { name: string; description?: string } = { name: s.name };
      if (s.description) scope.description = s.description;
      return scope;
    });
  }
  if (draft.models.length > 0) {
    output.models = draft.models.map((m) => {
      const model: DomainModel = { name: m.name, properties: m.properties.map(propertyToDocument) };
      if (m.scope) model.scope = m.scope;
      if (m.authority) model.authority = m.authority;
      if (m.ttl) model.ttl = m.ttl as DomainModel['ttl'];
      if (m.count && (m.count.min !== undefined || m.count.max !== undefined)) {
        model.count = { ...m.count };
      }
      if (m.mapsFrom.length > 0) model.mapsFrom = m.mapsFrom.map(mappingToDocument);
      return model;
    });
  }
  return output;
}

function propertyToDocument(p: ComposerField): DrefProperty {
  const out: DrefProperty = { name: p.name, type: p.type };
  if (p.required) out.required = true;
  if (p.key) out.key = true;
  if (p.list) out.list = true;
  if (p.authority) out.authority = p.authority;
  if (p.description) out.description = p.description;
  if (p.rules && p.rules.length > 0) {
    out.rules = p.rules.map(ruleToDocument);
  }
  return out;
}

function ruleToDocument(c: ComposerRule): DrefRule {
  const out: DrefRule = { type: c.type };
  if (c.param !== undefined) out.param = c.param;
  if (c.severity) out.severity = c.severity;
  if (c.description) out.description = c.description;
  return out;
}

function mappingToDocument(m: ComposerMapping): MappingDefinition {
  const out: MappingDefinition = { name: m.name, fields: m.fields.map(fieldToDocument) };
  if (m.provider) out.provider = m.provider;
  if (m.version) out.version = m.version;
  if (m.description) out.description = m.description;
  return out;
}

function fieldToDocument(f: ComposerMappingField): string | FieldMapping {
  if (f.transform.length === 0 && f.to === undefined) {
    return typeof f.from === 'string' ? f.from : { from: f.from };
  }
  const rule: FieldMapping = { from: f.from };
  if (f.to !== undefined) rule.to = f.to;
  if (f.transform.length > 0) {
    rule.transform = f.transform.map((t): string | Transform =>
      t.param === undefined ? t.type : { type: t.type, param: t.param }
    );
  }
  return rule;
}

/** Validate the draft's serialized output with the given validator (defaults to {@link validateDomain}). */
export function validateDraft(
  draft: DomainDraft,
  validate: DraftValidator = validateDomain,
  opts?: { schema?: string }
): ValidationResult {
  return validate(toDocument(draft, opts));
}

function updateScopes(draft: DomainDraft, scopes: ComposerScope[]): DomainDraft {
  return { ...draft, scopes };
}

function updateModels(draft: DomainDraft, models: ComposerModel[]): DomainDraft {
  return { ...draft, models };
}

function withModel(draft: DomainDraft, index: number, model: ComposerModel): DomainDraft {
  const models = draft.models.slice();
  models[index] = model;
  return updateModels(draft, models);
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export function addScope(
  draft: DomainDraft,
  scope: { name: string; description?: string }
): DomainDraft {
  return updateScopes(draft, [...draft.scopes, { name: scope.name, description: scope.description }]);
}

export function updateScope(
  draft: DomainDraft,
  index: number,
  patch: Partial<ComposerScope>
): DomainDraft {
  const scopes = draft.scopes.slice();
  scopes[index] = { ...scopes[index], ...patch };
  return updateScopes(draft, scopes);
}

/** Removes the scope and detaches every model that referenced it. */
export function removeScope(draft: DomainDraft, index: number): DomainDraft {
  const removed = draft.scopes[index];
  const scopes = draft.scopes.slice();
  scopes.splice(index, 1);
  const models = removed
    ? draft.models.map((m) => (m.scope === removed.name ? { ...m, scope: undefined } : m))
    : draft.models;
  return { ...updateScopes(draft, scopes), models };
}

/** Renames the scope and re-points every model that referenced it. */
export function renameScope(draft: DomainDraft, index: number, name: string): DomainDraft {
  const scopes = draft.scopes.slice();
  const previous = scopes[index].name;
  scopes[index] = { ...scopes[index], name };
  const models = draft.models.map((m) => (m.scope === previous ? { ...m, scope: name } : m));
  return { ...updateScopes(draft, scopes), models };
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function addModel(draft: DomainDraft, model?: Partial<ComposerModel>): DomainDraft {
  const base: ComposerModel = {
    name: '',
    properties: [],
    mapsFrom: [],
    ...model,
  };
  base.properties = model?.properties ?? [];
  base.mapsFrom = model?.mapsFrom ?? [];
  return updateModels(draft, [...draft.models, base]);
}

export function updateModel(
  draft: DomainDraft,
  index: number,
  patch: Partial<ComposerModel>
): DomainDraft {
  return withModel(draft, index, { ...draft.models[index], ...patch });
}

export function removeModel(draft: DomainDraft, index: number): DomainDraft {
  const models = draft.models.slice();
  models.splice(index, 1);
  return updateModels(draft, models);
}

export function setModelScope(draft: DomainDraft, index: number, scope?: string): DomainDraft {
  return withModel(draft, index, { ...draft.models[index], scope });
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export function addProperty(
  draft: DomainDraft,
  modelIndex: number,
  prop?: Partial<ComposerField>
): DomainDraft {
  const model = draft.models[modelIndex];
  const rulesList = (prop?.rules ?? []).map((c) => ({ ...c }));
  const field: ComposerField = {
    name: '',
    type: 'String',
    required: false,
    key: false,
    list: false,
    ...prop,
    rules: rulesList,
  };
  return withModel(draft, modelIndex, { ...model, properties: [...model.properties, field] });
}

export function updateProperty(
  draft: DomainDraft,
  modelIndex: number,
  propertyIndex: number,
  patch: Partial<ComposerField>
): DomainDraft {
  const model = draft.models[modelIndex];
  const properties = model.properties.slice();
  const current = properties[propertyIndex];
  const updatedRules = (patch.rules ?? current.rules ?? []).map((c) => ({ ...c }));
  properties[propertyIndex] = {
    ...current,
    ...patch,
    rules: updatedRules,
  };
  return withModel(draft, modelIndex, { ...model, properties });
}

export function removeProperty(
  draft: DomainDraft,
  modelIndex: number,
  propertyIndex: number
): DomainDraft {
  const model = draft.models[modelIndex];
  const properties = model.properties.slice();
  properties.splice(propertyIndex, 1);
  return withModel(draft, modelIndex, { ...model, properties });
}

export function moveProperty(
  draft: DomainDraft,
  modelIndex: number,
  from: number,
  to: number
): DomainDraft {
  const model = draft.models[modelIndex];
  const properties = model.properties.slice();
  const [moved] = properties.splice(from, 1);
  properties.splice(to, 0, moved);
  return withModel(draft, modelIndex, { ...model, properties });
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function addRule(
  draft: DomainDraft,
  modelIndex: number,
  propertyIndex: number,
  rule: ComposerRule
): DomainDraft {
  const model = draft.models[modelIndex];
  const property = model.properties[propertyIndex];
  const rules = [...(property.rules ?? []), rule];
  return withModel(draft, modelIndex, {
    ...model,
    properties: [
      ...model.properties.slice(0, propertyIndex),
      { ...property, rules },
      ...model.properties.slice(propertyIndex + 1),
    ],
  });
}

export function updateRule(
  draft: DomainDraft,
  modelIndex: number,
  propertyIndex: number,
  ruleIndex: number,
  patch: Partial<ComposerRule>
): DomainDraft {
  const model = draft.models[modelIndex];
  const property = model.properties[propertyIndex];
  const rules = (property.rules ?? []).slice();
  rules[ruleIndex] = { ...rules[ruleIndex], ...patch };
  return withModel(draft, modelIndex, {
    ...model,
    properties: [
      ...model.properties.slice(0, propertyIndex),
      { ...property, rules },
      ...model.properties.slice(propertyIndex + 1),
    ],
  });
}

export function removeRule(
  draft: DomainDraft,
  modelIndex: number,
  propertyIndex: number,
  ruleIndex: number
): DomainDraft {
  const model = draft.models[modelIndex];
  const property = model.properties[propertyIndex];
  const rules = (property.rules ?? []).slice();
  rules.splice(ruleIndex, 1);
  return withModel(draft, modelIndex, {
    ...model,
    properties: [
      ...model.properties.slice(0, propertyIndex),
      { ...property, rules },
      ...model.properties.slice(propertyIndex + 1),
    ],
  });
}

// ---------------------------------------------------------------------------
// Incoming mappings (mapsFrom)
// ---------------------------------------------------------------------------

export function addMapping(
  draft: DomainDraft,
  modelIndex: number,
  mapping?: Partial<ComposerMapping>
): DomainDraft {
  const model = draft.models[modelIndex];
  const base: ComposerMapping = { name: '', fields: [], ...mapping };
  base.fields = mapping?.fields ?? [];
  return withModel(draft, modelIndex, { ...model, mapsFrom: [...model.mapsFrom, base] });
}

export function updateMapping(
  draft: DomainDraft,
  modelIndex: number,
  mappingIndex: number,
  patch: Partial<ComposerMapping>
): DomainDraft {
  const model = draft.models[modelIndex];
  const mapsFrom = model.mapsFrom.slice();
  mapsFrom[mappingIndex] = { ...mapsFrom[mappingIndex], ...patch };
  return withModel(draft, modelIndex, { ...model, mapsFrom });
}

export function removeMapping(
  draft: DomainDraft,
  modelIndex: number,
  mappingIndex: number
): DomainDraft {
  const model = draft.models[modelIndex];
  const mapsFrom = model.mapsFrom.slice();
  mapsFrom.splice(mappingIndex, 1);
  return withModel(draft, modelIndex, { ...model, mapsFrom });
}

export function addMappingField(
  draft: DomainDraft,
  modelIndex: number,
  mappingIndex: number,
  field?: Partial<ComposerMappingField>
): DomainDraft {
  const model = draft.models[modelIndex];
  const mapping = model.mapsFrom[mappingIndex];
  const base: ComposerMappingField = { from: '', transform: [], ...field };
  base.transform = field?.transform ?? [];
  return withModel(draft, modelIndex, {
    ...model,
    mapsFrom: [
      ...model.mapsFrom.slice(0, mappingIndex),
      { ...mapping, fields: [...mapping.fields, base] },
      ...model.mapsFrom.slice(mappingIndex + 1),
    ],
  });
}

export function updateMappingField(
  draft: DomainDraft,
  modelIndex: number,
  mappingIndex: number,
  fieldIndex: number,
  patch: Partial<ComposerMappingField>
): DomainDraft {
  const model = draft.models[modelIndex];
  const mapping = model.mapsFrom[mappingIndex];
  const fields = mapping.fields.slice();
  fields[fieldIndex] = {
    ...fields[fieldIndex],
    ...patch,
    transform: patch.transform ?? fields[fieldIndex].transform,
  };
  return withModel(draft, modelIndex, {
    ...model,
    mapsFrom: [
      ...model.mapsFrom.slice(0, mappingIndex),
      { ...mapping, fields },
      ...model.mapsFrom.slice(mappingIndex + 1),
    ],
  });
}

export function removeMappingField(
  draft: DomainDraft,
  modelIndex: number,
  mappingIndex: number,
  fieldIndex: number
): DomainDraft {
  const model = draft.models[modelIndex];
  const mapping = model.mapsFrom[mappingIndex];
  const fields = mapping.fields.slice();
  fields.splice(fieldIndex, 1);
  return withModel(draft, modelIndex, {
    ...model,
    mapsFrom: [
      ...model.mapsFrom.slice(0, mappingIndex),
      { ...mapping, fields },
      ...model.mapsFrom.slice(mappingIndex + 1),
    ],
  });
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function setFormats(draft: DomainDraft, formats: Formats): DomainDraft {
  return { ...draft, formats: { ...draft.formats, ...formats } };
}

export function setFieldType(
  draft: DomainDraft,
  name: string,
  def: DrefFieldType
): DomainDraft {
  return { ...draft, fields: { ...draft.fields, [name]: { ...def } } };
}

export function removeFieldType(draft: DomainDraft, name: string): DomainDraft {
  const fields = { ...draft.fields };
  delete fields[name];
  return { ...draft, fields };
}