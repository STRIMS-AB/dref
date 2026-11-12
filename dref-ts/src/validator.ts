import {
  DomainDocument,
  DomainModel,
  DrefProperty,
  DrefRule,
  FieldType,
  Formats,
  ModelAuthority,
  ModelType,
  ValidationError,
  ValidationResult
} from './types.js';
import { validateMappingDefinition } from './mapper.js';

export function getRules(target?: { rules?: DrefRule[] } | null): DrefRule[] {
  return target?.rules ?? [];
}

export function errorIssue(field: string, code: string, message: string): ValidationError {
  return { field, rule: code, message };
}

const MODEL_NAME_REGEX = /^[A-Z][a-zA-Z0-9_]*$/;
const SCOPE_NAME_REGEX = /^[a-z0-9_-]+$/;
const FIELD_TYPE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Prefix that marks a property `type` as a cross-model reference (a foreign
 * key). A `#Customer` type links the property to the `Customer` model's key
 * property; its runtime value is the referenced key. See the specification's
 * "Model References" section.
 */
export const MODEL_REFERENCE_PREFIX = '#';

/** True when a property `type` is a cross-model reference (e.g. `#Customer`). */
export function isModelReference(type: unknown): type is string {
  return typeof type === 'string' && type.startsWith(MODEL_REFERENCE_PREFIX);
}

/**
 * The referenced model name for a `#Model` type. Returns the input unchanged
 * when it is not a reference.
 */
export function modelReferenceName(type: string): string {
  return isModelReference(type) ? type.slice(MODEL_REFERENCE_PREFIX.length) : type;
}
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/**
 * Simplified BCP-47 well-formedness: language[-extlang][-script][-region][-variant...](-x-private...).
 * Grandfathered and extension (singleton) subtags are not modelled.
 */
const LANG_TAG_REGEX =
  /^[a-zA-Z]{2,3}(-[a-zA-Z]{3}(-[a-zA-Z]{3}){0,2})?(-[a-zA-Z]{4})?(-[a-zA-Z]{2}|-[0-9]{3})?(-([a-zA-Z0-9]{5,8}|[0-9][a-zA-Z0-9]{3}))*(-x(-[a-zA-Z0-9]{1,8})+)?$/;

/** The builtin scalar field types a field type or property type may resolve to. */
export const BUILTIN_FIELD_TYPES: ReadonlySet<string> = new Set([
  'String',
  'Number',
  'Integer',
  'Boolean',
  'Date',
  'DateTime',
  'Time'
]);

/**
 * Thrown by `validateInstanceOrThrow` / `validateModelOrThrow` when validation
 * does not pass. The offending result is available via `.result`.
 */
export class DrefValidationError extends Error {
  readonly result: ValidationResult;

  constructor(result: ValidationResult) {
    super(
      `Validation failed with ${result.errors.length} error(s)${
        result.warnings.length ? ` and ${result.warnings.length} warning(s)` : ''
      }.`
    );
    this.name = 'DrefValidationError';
    this.result = result;
  }
}

/**
 * Validates a domain model definition itself.
 */
export function validateModel(model: DomainModel): ValidationResult {
  const errors: ValidationError[] = [];

  if (!model.name || !MODEL_NAME_REGEX.test(model.name)) {
    errors.push({
      field: 'name',
      rule: 'pattern',
      message: "Model name must be PascalCase alphanumeric (e.g. 'Customer', 'PaymentIntent')."
    });
  }

  if (model.scope !== undefined && !SCOPE_NAME_REGEX.test(model.scope)) {
    errors.push({
      field: 'scope',
      rule: 'pattern',
      message: "Model scope must be a lowercase kebab-case scope identifier (e.g. 'catalog', 'orders')."
    });
  }

  if (model.count) {
    if (model.count.min !== undefined && model.count.min < 0) {
      errors.push({
        field: 'count',
        rule: 'greaterThanOrEqual',
        message: 'count.min must be non-negative.'
      });
    }

    if (
      model.count.min !== undefined &&
      model.count.max !== undefined &&
      model.count.min > model.count.max
    ) {
      errors.push({
        field: 'count',
        rule: 'range',
        message: `count.min (${model.count.min}) cannot exceed count.max (${model.count.max}).`
      });
    }
  }

  const names = new Set<string>();
  const typesByName = new Map<string, string>();
  for (const prop of model.properties || []) {
    if (names.has(prop.name)) {
      errors.push({
        field: prop.name,
        rule: 'duplicateProperty',
        message: `Duplicate property name in model: ${prop.name}`
      });
    }
    names.add(prop.name);
    if (!typesByName.has(prop.name) && typeof prop.type === 'string') {
      typesByName.set(prop.name, prop.type);
    }

    for (const c of getRules(prop)) {
      const issue = ruleParamIssue(c);
      if (issue) {
        errors.push({ field: prop.name, rule: 'param', message: issue });
      }
    }
  }

  // Cross-field reference parameters ("$fieldName"): the target must name
  // another property of the same model, never the evaluated property
  // itself, with a type compatible with the rule's parameter.
  for (const prop of model.properties || []) {
    for (const c of getRules(prop)) {
      if (!isFieldRef(c.param)) continue;
      const target = String(c.param).slice(1);
      if (target === '') {
        errors.push({
          field: prop.name,
          rule: 'fieldRef',
          message: `Rule '${c.type}' on '${prop.name}' has an empty field reference.`
        });
      } else if (!names.has(target)) {
        errors.push({
          field: prop.name,
          rule: 'unknownFieldRef',
          message: `Rule '${c.type}' on '${prop.name}' references unknown property '${target}'.`
        });
      } else if (target === prop.name) {
        errors.push({
          field: prop.name,
          rule: 'selfFieldRef',
          message: `Rule '${c.type}' on '${prop.name}' must not reference the property itself.`
        });
      } else {
        const expected = REF_PARAM_FIELD_TYPES[c.type];
        const targetType = typesByName.get(target);
        if (expected && targetType && BUILTIN_FIELD_TYPES.has(targetType) && targetType !== expected) {
          errors.push({
            field: prop.name,
            rule: 'fieldRefType',
            message: `Rule '${c.type}' expects a ${expected} parameter, but property '${target}' is a ${targetType}.`
          });
        }
      }
    }
  }

  if (classifyModel(model) === 'entity' && !(model.properties || []).some(p => p.key)) {
    errors.push({
      field: 'key',
      rule: 'required',
      message: `Entity model '${model.name}' must declare at least one key property.`
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: []
  };
}

/**
 * Validates a domain model definition, throwing a {@link DrefValidationError}
 * when it is invalid.
 */
export function validateModelOrThrow(model: DomainModel): void {
  const result = validateModel(model);
  throwIfInvalid(result);
}

/**
 * Validates a full Domain Document envelope: the domain name, default formats,
 * duplicate scope names, duplicate model names, each model (with `validateModel`)
 * and every `mapsFrom` definition, and that each model's optional `scope`
 * reference targets a declared scope of the domain.
 */
export function validateDomain(domain: DomainDocument): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!domain || typeof domain !== 'object') {
    return {
      isValid: false,
      errors: [{ field: 'domain', rule: 'required', message: 'Domain document must be a non-null object.' }],
      warnings: []
    };
  }

  if (!domain.name || typeof domain.name !== 'string' || domain.name.trim() === '') {
    errors.push({
      field: 'name',
      rule: 'required',
      message: 'Domain document must have a name.'
    });
  }

  const formats = domain.defaults?.formats ?? {};
  const formatKeys = ['date', 'time', 'dateTime'] as const;
  for (const key of formatKeys) {
    if (
      formats[key] !== undefined &&
      (typeof formats[key] !== 'string' || formats[key].trim() === '')
    ) {
      errors.push({
        field: `defaults.formats.${key}`,
        rule: 'pattern',
        message: `defaults.formats.${key} must be a non-empty format string, got '${formats[key]}'.`
      });
    }
  }

  const scopeNames = new Set<string>();
  for (const scope of domain.scopes ?? []) {
    if (!scope || typeof scope.name !== 'string' || !SCOPE_NAME_REGEX.test(scope.name)) {
      errors.push({
        field: scope?.name ? `scopes[${scope.name}]` : 'scopes',
        rule: 'pattern',
        message: "Each scope must have a lowercase kebab-case name (e.g. 'catalog', 'orders')."
      });
      continue;
    }
    if (scopeNames.has(scope.name)) {
      errors.push({
        field: `scopes[${scope.name}]`,
        rule: 'duplicateScope',
        message: `Duplicate scope name: ${scope.name}`
      });
    }
    scopeNames.add(scope.name);
  }

  const fieldTypes = collectFieldTypeErrors(domain, errors);

  // Model names are collected up front so references may point forward.
  const allModelNames = new Set<string>();
  for (const model of domain.models ?? []) {
    if (model?.name) allModelNames.add(model.name);
  }

  const modelNames = new Set<string>();
  for (const model of domain.models ?? []) {
    const label = model?.name ?? '(unnamed)';
    if (model?.name && modelNames.has(model.name)) {
      errors.push({
        field: model.name,
        rule: 'duplicateModel',
        message: `Duplicate model name within domain: ${model.name}`
      });
    }
    if (model?.name) {
      modelNames.add(model.name);
    }

    if (model?.scope !== undefined && !scopeNames.has(model.scope)) {
      errors.push({
        field: label,
        rule: 'unknownScope',
        message: `Model '${label}' references unknown scope '${model.scope}'.`
      });
    }

    for (const prop of model?.properties ?? []) {
      if (prop?.type == null) continue;
      if (isModelReference(prop.type)) {
        const target = modelReferenceName(prop.type);
        if (!MODEL_NAME_REGEX.test(target)) {
          errors.push({
            field: `${label}.${prop.name}`,
            rule: 'modelReference',
            message: `Property '${label}.${prop.name}' has an invalid model reference '${prop.type}' (expected '#ModelName' with an upper-case model name).`
          });
        } else if (!allModelNames.has(target)) {
          errors.push({
            field: `${label}.${prop.name}`,
            rule: 'unknownModelReference',
            message: `Property '${label}.${prop.name}' references unknown model '#${target}' (declare the model in this domain).`
          });
        }
        continue;
      }
      if (!BUILTIN_FIELD_TYPES.has(prop.type) && !fieldTypes.has(prop.type)) {
        errors.push({
          field: `${label}.${prop.name}`,
          rule: 'unknownFieldType',
          message: `Property '${label}.${prop.name}' references unknown field type '${prop.type}' (declare it under defaults.fields or use a builtin type).`
        });
      }
    }

    const modelResult = validateModel(model);
    errors.push(...modelResult.errors);
    warnings.push(...modelResult.warnings);

    for (const mapping of model.mapsFrom ?? []) {
      const mappingResult = validateMappingDefinition(mapping);
      errors.push(...mappingResult.errors);
      warnings.push(...mappingResult.warnings);
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Validates the domain's declared field types (`defaults.fields`): each name
 * must be a valid identifier that does not shadow a builtin, and its `type`
 * must resolve (builtin or declared) without cycles. Returns the set of valid
 * declared field type names for downstream property-type checks.
 */
function collectFieldTypeErrors(
  domain: DomainDocument,
  errors: ValidationError[]
): Set<string> {
  const declared = domain.defaults?.fields ?? {};
  const names = new Set<string>();

  for (const [name, fieldType] of Object.entries(declared)) {
    if (!FIELD_TYPE_NAME_REGEX.test(name)) {
      errors.push({
        field: `defaults.fields.${name}`,
        rule: 'pattern',
        message: "Domain field type names must be identifiers matching [a-zA-Z][a-zA-Z0-9_]* (no '#' prefix)."
      });
      continue;
    }
    if (BUILTIN_FIELD_TYPES.has(name)) {
      errors.push({
        field: `defaults.fields.${name}`,
        rule: 'shadowBuiltin',
        message: `Domain field type '${name}' shadows a builtin field type.`
      });
      continue;
    }
    if (names.has(name)) {
      errors.push({
        field: `defaults.fields.${name}`,
        rule: 'duplicateFieldType',
        message: `Duplicate field type declaration: ${name}`
      });
    }
    names.add(name);

    const base = fieldType?.type;
    if (base == null) {
      errors.push({
        field: `defaults.fields.${name}`,
        rule: 'required',
        message: `Domain field type '${name}' must declare a base 'type'.`
      });
    }

    for (const c of getRules(fieldType)) {
      const issue = ruleParamIssue(c);
      if (issue) {
        errors.push({ field: `defaults.fields.${name}`, rule: 'param', message: issue });
      }
    }
  }

  const visiting = new Set<string>();
  const resolved = new Set<string>();
  const resolve = (name: string, chain: string[]): boolean => {
    if (resolved.has(name)) return true;
    if (visiting.has(name)) {
      errors.push({
        field: `defaults.fields.${name}`,
        rule: 'fieldTypeCycle',
        message: `Domain field type cycle detected: ${[...chain, name].join(' -> ')}`
      });
      return false;
    }
    const base = declared[name]?.type;
    if (base == null) return true; // already reported as 'required'
    if (BUILTIN_FIELD_TYPES.has(base)) {
      resolved.add(name);
      return true;
    }
    if (!names.has(base)) {
      errors.push({
        field: `defaults.fields.${name}`,
        rule: 'unknownFieldType',
        message: `Domain field type '${name}' references unknown field type '${base}'.`
      });
      return false;
    }
    visiting.add(name);
    const ok = resolve(base, [...chain, name]);
    visiting.delete(name);
    if (ok) resolved.add(name);
    return ok;
  };

  for (const name of names) resolve(name, []);
  return names;
}

/**
 * A fully-expanded {@link DrefFieldType}: a base builtin field type plus the
 * declaration's list flag and rules merged with any inherited ones.
 */
export interface ResolvedFieldType {
  type: FieldType;
  list: boolean;
  rules: DrefRule[];
}

/**
 * Expands a domain document's `defaults.fields` declarations into a lookup of
 * resolved field types (name -> builtin type, effective list flag, and merged
 * rules, inherited definitions first). Throws when a declaration is
 * unresolvable (unknown base or a cycle).
 */
export function resolveFieldTypes(domain: DomainDocument): Map<string, ResolvedFieldType> {
  const raw = domain.defaults?.fields ?? {};
  const memo = new Map<string, ResolvedFieldType>();
  const visiting = new Set<string>();

  const resolve = (name: string, chain: string[]): ResolvedFieldType => {
    const cached = memo.get(name);
    if (cached) return cached;
    if (visiting.has(name)) {
      throw new Error(`Domain field type cycle detected: ${[...chain, name].join(' -> ')}`);
    }
    const decl = raw[name];
    if (!decl || typeof decl !== 'object') {
      throw new Error(`Unknown field type: '${name}' (declare it under defaults.fields or use a builtin type).`);
    }
    const base = decl.type;
    visiting.add(name);
    let resolvedType: FieldType;
    let list = !!decl.list;
    let rules: DrefRule[] = [...getRules(decl)];
    if (BUILTIN_FIELD_TYPES.has(base)) {
      resolvedType = base as FieldType;
    } else {
      const baseResolved = resolve(base, [...chain, name]);
      resolvedType = baseResolved.type;
      list = list || baseResolved.list;
      rules = [...baseResolved.rules, ...rules];
    }
    visiting.delete(name);
    const result: ResolvedFieldType = { type: resolvedType, list, rules };
    memo.set(name, result);
    return result;
  };

  for (const name of Object.keys(raw)) resolve(name, []);
  return memo;
}

/**
 * Expands every domain field type reference in the document to a concrete
 * builtin-backed model: a property whose `type` names a field type is replaced
 * with its resolved builtin type, effective list flag, and rules (the
 * field type's rules come first, then the property's own). Throws when a
 * property references an undeclared field type. Use the result with
 * {@link validateInstance} / {@link validateWrite}.
 */
export function resolveModels(domain: DomainDocument): DomainModel[] {
  if (!domain || typeof domain !== 'object') return [];
  const resolved = resolveFieldTypes(domain);

  const byName = new Map<string, DomainModel>();
  for (const m of domain.models ?? []) {
    if (m?.name) byName.set(m.name, m);
  }

  // A model reference is a foreign key: at instance level its value is the
  // referenced model's key value, so the property validates as that key's
  // scalar type. Falls back to String when the target (or its key) is unknown.
  const keyTypeOf = (modelName: string, seen: Set<string>): FieldType => {
    if (seen.has(modelName)) return 'String';
    seen.add(modelName);
    const target = byName.get(modelName);
    const props = target?.properties ?? [];
    const key = props.find((p) => p.key) ?? props[0];
    const t = key?.type;
    if (t == null || BUILTIN_FIELD_TYPES.has(t)) return (t as FieldType) ?? 'String';
    if (isModelReference(t)) return keyTypeOf(modelReferenceName(t), seen);
    const macro = resolved.get(t);
    return macro ? macro.type : 'String';
  };

  return (domain.models ?? []).map(model => {
    const properties = (model.properties ?? []).map(prop => {
      const typeLabel = prop.type;
      if (typeLabel == null || BUILTIN_FIELD_TYPES.has(typeLabel)) return { ...prop };
      if (isModelReference(typeLabel)) {
        return { ...prop, type: keyTypeOf(modelReferenceName(typeLabel), new Set()) };
      }
      const macro = resolved.get(typeLabel);
      if (!macro) {
        throw new Error(`Unknown field type: '${typeLabel}' (declare it under defaults.fields or use a builtin type).`);
      }
      const macroRules = getRules(macro);
      const propRules = getRules(prop);
      const mergedRules = macroRules.length ? [...macroRules, ...propRules] : propRules;
      return {
        ...prop,
        type: macro.type,
        list: !!prop.list || macro.list,
        rules: mergedRules,
      };
    });
    return { ...model, properties };
  });
}

/**
 * Resolves cross-field reference parameters ("$fieldName") against the
 * instance data: a reference whose sibling value is absent (null/undefined/
 * empty string) drops the rule entirely; otherwise the sibling value
 * replaces the parameter. Properties without references are returned
 * unchanged. Only {@link validateInstance} (and paths built on it) resolves
 * references — a standalone {@link validateProperty} skips them.
 */
function resolveFieldRefs(prop: DrefProperty, data: Record<string, any>): DrefProperty {
  const rules = getRules(prop);
  if (!rules || !rules.some((c) => isFieldRef(c.param))) return prop;
  const resolved: DrefRule[] = [];
  for (const c of rules) {
    if (!isFieldRef(c.param)) {
      resolved.push(c);
      continue;
    }
    const sibling = data[String(c.param).slice(1)];
    if (sibling === undefined || sibling === null || sibling === '') continue; // skip
    resolved.push({ ...c, param: sibling });
  }
  return { ...prop, rules: resolved };
}

export function validateInstance(
  data: Record<string, any>,
  model: DomainModel,
  onInvalid?: (result: ValidationResult) => void,
  formats?: Formats
): ValidationResult {
  let result: ValidationResult;
  if (!data || typeof data !== 'object') {
    result = {
      isValid: false,
      errors: [{ field: model.name, rule: 'required', message: 'Instance data must be a non-null object.' }],
      warnings: []
    };
  } else {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    for (const prop of model.properties || []) {
      const val = data[prop.name];
      const res = validateProperty(val, resolveFieldRefs(prop, data), formats);
      errors.push(...res.errors);
      warnings.push(...res.warnings);
    }
    result = {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  if (!result.isValid && onInvalid) {
    onInvalid(result);
  }
  return result;
}

/**
 * Validates a record instance written by a specific principal
 * ({@code writer}: {@code 'client'} | {@code 'internal'} | {@code 'external'}).
 * Runs the full authority-agnostic instance validation, then additionally fails
 * every property present in the payload whose effective authority (its own,
 * falling back to the model's) does not match the writer. Properties the
 * payload does not set are unrestricted.
 */
export function validateWrite(
  data: Record<string, any>,
  model: DomainModel,
  writer: ModelAuthority,
  onInvalid?: (result: ValidationResult) => void,
  formats?: Formats
): ValidationResult {
  const base = validateInstance(data, model, undefined, formats);
  const errors: ValidationError[] = [...base.errors];
  const warnings: ValidationError[] = [...base.warnings];

  if (data && typeof data === 'object' && writer) {
    for (const prop of model.properties || []) {
      if (data[prop.name] === undefined) continue;
      const effective = prop.authority ?? model.authority ?? 'internal';
      if (effective !== writer) {
        errors.push({
          field: prop.name,
          rule: 'authority',
          message: `Property '${prop.name}' is ${effective}-authored and cannot be written by '${writer}'.`
        });
      }
    }
  }

  const result = { isValid: errors.length === 0, errors, warnings };
  if (!result.isValid && onInvalid) {
    onInvalid(result);
  }
  return result;
}

/**
 * Validates a record instance written by a specific principal, throwing a
 * {@link DrefValidationError} when it does not pass.
 */
export function validateWriteOrThrow(
  data: Record<string, any>,
  model: DomainModel,
  writer: ModelAuthority
): void {
  throwIfInvalid(validateWrite(data, model, writer));
}

/**
 * Validates a full record instance against a domain model, throwing a
 * {@link DrefValidationError} when validation does not pass.
 */
export function validateInstanceOrThrow(data: Record<string, any>, model: DomainModel): void {
  throwIfInvalid(validateInstance(data, model));
}

/**
 * Validates an individual property value against its declared rules.
 */
/** A compact description of a value's runtime type, for type-mismatch messages. */
function valueKind(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
    const name = value?.constructor?.name;
    return name && name !== 'Object' ? name : 'object';
  }
  return typeof value;
}

/**
 * Mirrors the Java validator's scalar type-membership check: returns a reason
 * when {@code value} is not of the declared builtin field type, or {@code null}
 * when it matches (or the type is not a builtin).
 */
function scalarTypeMismatch(type: string, value: any): string | null {
  switch (type) {
    case 'String':
      return typeof value === 'string' ? null : `Expected a String, got ${valueKind(value)}.`;
    case 'Number':
      return typeof value === 'number' ? null : `Expected a Number, got ${valueKind(value)}.`;
    case 'Integer':
      // A whole number, not a class: the value is a number with no fractional
      // part, which is what regl's INTEGER target type checks.
      if (typeof value !== 'number') {
        return `Expected an Integer, got ${valueKind(value)}.`;
      }
      return Number.isInteger(value) ? null : 'Expected a whole number, got a fractional one.';
    case 'Boolean':
      return typeof value === 'boolean' ? null : `Expected a Boolean, got ${valueKind(value)}.`;
    case 'Date':
    case 'DateTime':
    case 'Time':
      return typeof value === 'string' || value instanceof Date
        ? null
        : `Expected a date/time value, got ${valueKind(value)}.`;
    default:
      return null;
  }
}

/**
 * Whether a rule parameter is a cross-field reference ("$fieldName"),
 * resolved against a sibling property's value during instance validation.
 */
function isFieldRef(param: any): boolean {
  return typeof param === 'string' && param.startsWith('$');
}

/**
 * The builtin field type a referenced property must have for the rule's
 * parameter to be type-compatible (e.g. `greaterThan: $limit` needs a Number).
 */
const REF_PARAM_FIELD_TYPES: Record<string, FieldType> = {
  minLength: 'Number',
  maxLength: 'Number',
  length: 'Number',
  precision: 'Number',
  greaterThan: 'Number',
  greaterThanOrEqual: 'Number',
  lessThan: 'Number',
  lessThanOrEqual: 'Number',
  multipleOf: 'Number',
  pattern: 'String',
  contains: 'String',
  startsWith: 'String',
  endsWith: 'String',
  after: 'String',
  before: 'String',
  dateFormat: 'String'
};

function ruleParamIssue(rule: DrefRule): string | null {
  const param = rule.param;
  const kind = (v: any): string => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return 'object';
    return typeof v;
  };

  switch (rule.type) {
    case 'minLength':
    case 'maxLength':
    case 'length':
    case 'precision':
      if (isFieldRef(param)) return null; // cross-field reference, checked in validateModel
      if (typeof param !== 'number' || !Number.isInteger(param)) {
        return `Rule '${rule.type}' requires an integer parameter, got ${kind(param)}.`;
      }
      return null;
    case 'pattern':
    case 'contains':
    case 'startsWith':
    case 'endsWith':
    case 'dateFormat':
      if (typeof param !== 'string' || param.trim() === '') {
        return `Rule '${rule.type}' requires a non-empty string parameter, got ${kind(param)}.`;
      }
      return null;
    case 'after':
    case 'before':
      if (isFieldRef(param)) return null;
      if (typeof param !== 'string' || param.trim() === '') {
        return `Rule '${rule.type}' requires a non-empty string parameter, got ${kind(param)}.`;
      }
      return null;
    case 'greaterThan':
    case 'greaterThanOrEqual':
    case 'lessThan':
    case 'lessThanOrEqual':
    case 'multipleOf':
      if (isFieldRef(param)) return null; // cross-field reference, checked in validateModel
      if (typeof param !== 'number') {
        return `Rule '${rule.type}' requires a number parameter, got ${kind(param)}.`;
      }
      return null;
    case 'text': {
      if (param === undefined || param === null) {
        return null; // the language parameter is optional
      }
      const got = typeof param === 'string' ? `'${param}'` : kind(param);
      if (typeof param !== 'string' || !LANG_TAG_REGEX.test(param)) {
        return `Rule 'text' parameter must be a BCP-47 language tag (e.g. 'en', 'pt-BR'), got ${got}.`;
      }
      return null;
    }
    case 'enum':
      if (!Array.isArray(param) || param.length === 0 || param.some((v) => typeof v !== 'string')) {
        return `Rule 'enum' requires a non-empty array of string values, got ${kind(param)}.`;
      }
      return null;
    case 'range': {
      if (typeof param !== 'object' || param === null || Array.isArray(param)) {
        return `Rule 'range' requires an object parameter { min?, max? }, got ${kind(param)}.`;
      }
      const { min, max } = param as { min?: unknown; max?: unknown };
      if (min !== undefined && typeof min !== 'number') return `Rule 'range' requires a numeric 'min'.`;
      if (max !== undefined && typeof max !== 'number') return `Rule 'range' requires a numeric 'max'.`;
      return null;
    }
    default:
      if (PARAMLESS_RULES.has(rule.type) && param !== undefined && param !== null) {
        return `Rule '${rule.type}' does not accept a parameter.`;
      }
      return null;
  }
}

/** Rules that never take a parameter, mirroring the Java evaluator registry. */
const PARAMLESS_RULES = new Set([
  'immutable',
  'email',
  'url',
  'uuid',
  'languageCode',
  'lowercase',
  'uppercase',
  'trimmed',
  'notEmpty',
  'positive',
  'negative',
  'positiveInteger',
  'negativeInteger',
  'unique',
  'isTrue',
  'isFalse',
  'epoch',
  'epochMillis',
  'isoDate',
  'isoDateTime',
  'isoTime'
]);

/**
 * Domain-format type membership for temporal fields. When the domain declares an
 * epoch format ({@code epoch} or {@code epochMillis}) for a {@code Date}/{@code Time}/
 * {@code DateTime} property, its values must be whole numbers (or a {@code Date});
 * any other format falls through to the scalar rule. Returns a {@code format}
 * issue to report, or {@code null} when the value fits the declared format.
 */
function temporalFormatIssue(
  type: string,
  value: any,
  formats?: Formats
): ValidationError | null {
  if (formats === undefined || (type !== 'Date' && type !== 'Time' && type !== 'DateTime')) {
    return null;
  }
  const key = (type === 'DateTime' ? 'dateTime' : type.toLowerCase()) as keyof Formats;
  const declared = formats[key];
  if (typeof declared !== 'string' || (declared.trim() !== 'epoch' && declared.trim() !== 'epochMillis')) {
    return null;
  }
  const unit = declared.trim() === 'epochMillis' ? 'milliseconds' : 'seconds';
  if (typeof value === 'number' || value instanceof Date) {
    if (typeof value === 'number' && !Number.isInteger(value)) {
      return {
        field: '',
        rule: 'format',
        message: `Expected a whole-number ${unit} value for domain format '${declared.trim()}', got ${value}.`
      };
    }
    return null;
  }
  return {
    field: '',
    rule: 'format',
    message: `Expected an ${declared.trim()} value (a whole Number of ${unit} since the Unix epoch), got ${valueKind(value)}.`
  };
}

/**
 * Whether the domain declares an epoch format ({@code epoch}/{@code epochMillis})
 * for a temporal field type, in which case a whole-number value is already
 * accepted by {@link temporalFormatIssue} and the scalar rule does not apply.
 */
function isEpochFormattedTemporal(type: string, formats?: Formats): boolean {
  if (formats === undefined || (type !== 'Date' && type !== 'Time' && type !== 'DateTime')) {
    return false;
  }
  const key = (type === 'DateTime' ? 'dateTime' : type.toLowerCase()) as keyof Formats;
  const declared = formats[key];
  return typeof declared === 'string' && (declared.trim() === 'epoch' || declared.trim() === 'epochMillis');
}

export function validateProperty(
  value: any,
  property: DrefProperty,
  formats?: Formats
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const field = property.name;

  // 1. Required check
  if (value === null || value === undefined || value === '') {
    if (property.required) {
      errors.push({
        field,
        rule: 'required',
        message: `Field '${field}' is required.`
      });
    }
    return { isValid: errors.length === 0, errors, warnings };
  }

  // 1b. Scalar type membership — a wrong scalar type is reported (alongside any
  // rule issues); list elements are checked per element below.
  if (!property.list) {
    const formatIssue = temporalFormatIssue(property.type, value, formats);
    if (formatIssue) {
      errors.push({ field, rule: formatIssue.rule, message: formatIssue.message });
    } else if (!isEpochFormattedTemporal(property.type, formats)) {
      const mismatch = scalarTypeMismatch(property.type, value);
      if (mismatch !== null) {
        errors.push({ field, rule: 'type', message: mismatch });
      }
    }
  }

  // 2. List handling
  if (property.list) {
    if (!Array.isArray(value)) {
      errors.push({
        field,
        rule: 'type',
        message: `Field '${field}' must be an array.`
      });
      return { isValid: false, errors, warnings };
    }

    const rules = getRules(property);
    for (const c of rules) {
      if (c.type === 'range') {
        const r = c.param as { min?: number; max?: number } | undefined;
        if (r?.min !== undefined && value.length < r.min) {
          recordIssue(errors, warnings, c, {
            field,
            rule: 'range',
            message: `List must have at least ${r.min} items, found ${value.length}.`
          });
        }
        if (r?.max !== undefined && value.length > r.max) {
          recordIssue(errors, warnings, c, {
            field,
            rule: 'range',
            message: `List cannot exceed ${r.max} items, found ${value.length}.`
          });
        }
      } else if (c.type === 'unique') {
        const set = new Set(value);
        if (set.size < value.length) {
          recordIssue(errors, warnings, c, {
            field,
            rule: 'unique',
            message: `All elements in list '${field}' must be unique.`
          });
        }
      }
    }

    // Validate each element in list
    const elementRules = rules.filter(
      c => !['range', 'unique'].includes(c.type)
    );
    value.forEach((item, idx) => {
      const itemProp: DrefProperty = {
        name: `${field}[${idx}]`,
        type: property.type,
        required: true,
        rules: elementRules,
      };
      const res = validateProperty(item, itemProp, formats);
      errors.push(...res.errors);
      warnings.push(...res.warnings);
    });

    return { isValid: errors.length === 0, errors, warnings };
  }

  // 3. String & Number rules
  for (const c of getRules(property)) {
    evaluateRule(field, value, c, errors, warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates an individual property value, throwing a {@link DrefValidationError}
 * when validation does not pass.
 */
export function validatePropertyOrThrow(value: any, property: DrefProperty): void {
  throwIfInvalid(validateProperty(value, property));
}

function recordIssue(
  errors: ValidationError[],
  warnings: ValidationError[],
  rule: DrefRule,
  issue: ValidationError
): void {
  const norm: ValidationError = {
    field: issue.field,
    rule: issue.rule,
    message: issue.message
  };
  if (rule.severity === 'warn') {
    warnings.push(norm);
  } else {
    errors.push(norm);
  }
}

function throwIfInvalid(result: ValidationResult): void {
  if (!result.isValid) {
    throw new DrefValidationError(result);
  }
}

function evaluateRule(
  field: string,
  value: any,
  rule: DrefRule,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  const { type, param } = rule;
  if (isFieldRef(param)) {
    return; // unresolvable outside instance context — only validateInstance resolves references
  }
  const record = (message: string): void => {
    recordIssue(errors, warnings, rule, { field, rule: type, message });
  };

  // String Rules
  if (typeof value === 'string') {
    switch (type) {
      case 'minLength': {
        const min = Number(param) || 0;
        if (value.length < min) {
          record(`Minimum length is ${min}, but got ${value.length}.`);
        }
        break;
      }
      case 'maxLength': {
        const max = Number(param);
        if (!isNaN(max) && value.length > max) {
          record(`Maximum length is ${max}, but got ${value.length}.`);
        }
        break;
      }
      case 'length': {
        const exact = Number(param);
        if (!isNaN(exact) && value.length !== exact) {
          record(`Exact length must be ${exact}, but got ${value.length}.`);
        }
        break;
      }
      case 'pattern': {
        if (param) {
          const regex = new RegExp(String(param));
          if (!regex.test(value)) {
            record(`Value does not match required regex pattern: ${param}`);
          }
        }
        break;
      }
      case 'contains': {
        if (param && !value.includes(String(param))) {
          record(`Value must contain '${param}'.`);
        }
        break;
      }
      case 'startsWith': {
        if (param && !value.startsWith(String(param))) {
          record(`Value must start with '${param}'.`);
        }
        break;
      }
      case 'endsWith': {
        if (param && !value.endsWith(String(param))) {
          record(`Value must end with '${param}'.`);
        }
        break;
      }
      case 'email': {
        if (!EMAIL_REGEX.test(value)) {
          record('Value is not a valid email address.');
        }
        break;
      }
      case 'url': {
        try {
          const u = new URL(value);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            record('Value must be a valid HTTP or HTTPS URL.');
          }
        } catch {
          record('Value is not a valid URL.');
        }
        break;
      }
      case 'uuid': {
        if (!UUID_REGEX.test(value)) {
          record('Value is not a valid UUID format.');
        }
        break;
      }
      case 'languageCode': {
        if (!LANG_TAG_REGEX.test(value)) {
          record('Value is not a well-formed BCP-47 language tag (e.g. \'en\', \'pt-BR\').');
        }
        break;
      }
      case 'lowercase': {
        if (value !== value.toLowerCase()) {
          record('Value must be all lowercase.');
        }
        break;
      }
      case 'uppercase': {
        if (value !== value.toUpperCase()) {
          record('Value must be all uppercase.');
        }
        break;
      }
      case 'trimmed': {
        if (value !== value.trim()) {
          record('Value must not have leading or trailing whitespace.');
        }
        break;
      }
      case 'notEmpty': {
        if (value.trim().length === 0) {
          record('Value cannot be blank or empty.');
        }
        break;
      }
      case 'enum': {
        const allowed = Array.isArray(param)
          ? param
          : String(param).split(',').map(s => s.trim());
        if (!allowed.includes(value)) {
          record(`Value '${value}' is not in allowed values: [${allowed.join(', ')}].`);
        }
        break;
      }
      case 'dateFormat': {
        const p = String(param);
        if (p === 'YYYY-MM-DD') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
            record(`Value does not match required date format: ${param}`);
          }
        } else if (p === 'HH:mm:ss') {
          if (!/^\d{2}:\d{2}:\d{2}$/.test(value)) {
            record(`Value does not match required date format: ${param}`);
          }
        } else if (p === 'iso' || p === 'iso8601') {
          if (isNaN(Date.parse(value))) {
            record(`Value does not match required date format: ${param}`);
          }
        } else {
          const regexStr = '^' + p
            .replace(/YYYY/g, '\\d{4}')
            .replace(/MM/g, '\\d{2}')
            .replace(/DD/g, '\\d{2}')
            .replace(/HH/g, '\\d{2}')
            .replace(/mm/g, '\\d{2}')
            .replace(/ss/g, '\\d{2}') + '$';
          if (!new RegExp(regexStr).test(value)) {
            record(`Value does not match required date format: ${param}`);
          }
        }
        break;
      }
      case 'isoDate': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
          record('Value must be a valid ISO-8601 date (YYYY-MM-DD).');
        }
        break;
      }
      case 'isoDateTime': {
        if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) || isNaN(Date.parse(value))) {
          record('Value must be a valid ISO-8601 date-time timestamp.');
        }
        break;
      }
      case 'isoTime': {
        if (!/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) {
          record('Value must be a valid ISO-8601 time (HH:mm:ss).');
        }
        break;
      }
      case 'after': {
        const parseMillis = (val: any) => typeof val === 'number' ? (val < 100000000000 ? val * 1000 : val) : Date.parse(val);
        const mA = parseMillis(value);
        const mB = parseMillis(param);
        if (isNaN(mA) || isNaN(mB) || mA <= mB) {
          record(`Value '${value}' must be chronologically after '${param}'.`);
        }
        break;
      }
      case 'before': {
        const parseMillis = (val: any) => typeof val === 'number' ? (val < 100000000000 ? val * 1000 : val) : Date.parse(val);
        const mA = parseMillis(value);
        const mB = parseMillis(param);
        if (isNaN(mA) || isNaN(mB) || mA >= mB) {
          record(`Value '${value}' must be chronologically before '${param}'.`);
        }
        break;
      }
    }
  }

  // Number Rules
  if (typeof value === 'number') {
    switch (type) {
      case 'greaterThan': {
        const limit = Number(param);
        if (value <= limit) {
          record(`Value must be strictly greater than ${limit}.`);
        }
        break;
      }
      case 'greaterThanOrEqual': {
        const limit = Number(param);
        if (value < limit) {
          record(`Value must be greater than or equal to ${limit}.`);
        }
        break;
      }
      case 'lessThan': {
        const limit = Number(param);
        if (value >= limit) {
          record(`Value must be strictly less than ${limit}.`);
        }
        break;
      }
      case 'lessThanOrEqual': {
        const limit = Number(param);
        if (value > limit) {
          record(`Value must be less than or equal to ${limit}.`);
        }
        break;
      }
      case 'positive': {
        if (value <= 0) {
          record('Value must be positive (> 0).');
        }
        break;
      }
      case 'negative': {
        if (value >= 0) {
          record('Value must be negative (< 0).');
        }
        break;
      }
      case 'positiveInteger': {
        if (!Number.isInteger(value) || value <= 0) {
          record('Value must be an integer greater than zero.');
        }
        break;
      }
      case 'negativeInteger': {
        if (!Number.isInteger(value) || value >= 0) {
          record('Value must be an integer less than zero.');
        }
        break;
      }
      case 'multipleOf': {
        const step = Number(param);
        if (step > 0 && Math.abs(value % step) > 0.000001) {
          record(`Value must be a multiple of ${step}.`);
        }
        break;
      }
      case 'precision': {
        const maxDecimals = Number(param) || 0;
        const decimals = (value.toString().split('.')[1] || '').length;
        if (decimals > maxDecimals) {
          record(`Value has ${decimals} decimal places, maximum allowed is ${maxDecimals}.`);
        }
        break;
      }
      case 'epoch': {
        if (!Number.isInteger(value) || value < 0) {
          record('Value must be a valid whole-number Unix timestamp in seconds.');
        }
        break;
      }
      case 'epochMillis': {
        if (!Number.isInteger(value) || value < 0) {
          record('Value must be a valid whole-number Unix timestamp in milliseconds.');
        }
        break;
      }
    }
  }

  // Boolean Rules
  if (typeof value === 'boolean') {
    if (type === 'isTrue' && !value) {
      record('Field must be true.');
    } else if (type === 'isFalse' && value) {
      record('Field must be false.');
    }
  }
}

/**
 * Whether the model constrains the number of instances (a count range is declared).
 */
export function modelHasCountRange(model: DomainModel): boolean {
  return !!(
    model.count &&
    (model.count.min !== undefined || model.count.max !== undefined)
  );
}

/**
 * A property is immutable when it declares the `immutable` rule.
 */
export function propertyIsImmutable(property: DrefProperty): boolean {
  return (property.rules || []).some(c => c.type === 'immutable');
}

/**
 * A model instance is immutable when every property is immutable.
 */
export function modelIsImmutable(model: DomainModel): boolean {
  return (model.properties || []).length > 0 &&
    (model.properties || []).every(propertyIsImmutable);
}

export function modelIsMutable(model: DomainModel): boolean {
  return !modelIsImmutable(model);
}

/**
 * Architectural classification is derived, not declared. A model that declares
 * a count range is a `configuration`; otherwise a model whose every property is
 * immutable is a `value`; anything else is an `entity` and must declare at
 * least one key property.
 */
export function classifyModel(model: DomainModel): ModelType {
  if (modelHasCountRange(model)) return 'configuration';
  if (modelIsImmutable(model)) return 'value';
  return 'entity';
}