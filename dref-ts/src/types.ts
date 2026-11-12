export type ModelType = 'configuration' | 'entity' | 'value';
export type ModelAuthority = 'client' | 'internal' | 'external';

export type FieldType =
  | 'String'
  | 'Number'
  | 'Integer'
  | 'Boolean'
  | 'Date'
  | 'DateTime'
  | 'Time';

export type DateRuleType =
  | 'dateFormat'
  | 'isoDate'
  | 'isoDateTime'
  | 'isoTime'
  | 'after'
  | 'before'
  | 'epoch'
  | 'epochMillis';

export type StringRuleType =
  | 'minLength'
  | 'maxLength'
  | 'length'
  | 'pattern'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'email'
  | 'url'
  | 'uuid'
  | 'languageCode'
  | 'lowercase'
  | 'uppercase'
  | 'trimmed'
  | 'notEmpty'
  | 'text'
  | 'enum'

  | 'dateFormat'
  | 'isoDate'
  | 'isoDateTime'
  | 'isoTime'
  | 'after'
  | 'before';

export type NumberRuleType =
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'positive'
  | 'negative'
  | 'positiveInteger'
  | 'negativeInteger'
  | 'multipleOf'
  | 'precision'

  | 'epoch'
  | 'epochMillis';

export type ListRuleType = 'range' | 'unique';

export type BooleanRuleType = 'isTrue' | 'isFalse';

export type ModelRuleType = 'ttl' | 'authority' | 'count';

/**
 * TTL is an expression: a positive integer + a unit — s (seconds), m (minutes), h (hours),
 * d (days), M (months), y (years). An omitted ttl is lifecycle-manager-determined (persistent
 * by default) and is not modelled in DRef.
 */
export type TtlDuration = `${number}${'s' | 'm' | 'h' | 'd' | 'M' | 'y'}`;

export type RuleType =
  | StringRuleType
  | NumberRuleType
  | ListRuleType
  | BooleanRuleType
  | ModelRuleType
  | DateRuleType
  | string;

export interface DrefRule {
  type: RuleType;
  /**
   * The rule's parameter. A string of the form `'$fieldName'` is a
   * cross-field reference: during instance validation it is resolved against
   * the sibling property's value (skipped when that sibling is unset).
   */
  param?: any;
  description?: string;
  /**
   * Whether a failure of this rule blocks. `warn` demotes the failure to a
   * non-blocking warning, which surfaces in `ValidationResult.warnings` instead
   * of `errors`; omitted or `error` means blocking.
   *
   * Mirrors regl's per-rule `severity`, which replaced its old boolean
   * `warnOnly` flag.
   */
  severity?: 'error' | 'warn';
}

/**
 * A domain field type declared under `defaults.fields` — a named, reusable
 * field definition referenced from a property's `type` (e.g. `'orderStatus'`).
 * Names are plain identifiers (no `#` prefix — that space is reserved for model
 * references) and must not shadow a builtin field type. A declaration may be
 * built on either a builtin field type (`type: 'String'`) or another declared
 * domain field type, but never cyclically.
 */
export interface DrefFieldType {
  type: FieldType | string;
  list?: boolean;
  rules?: DrefRule[];
}

export interface DrefProperty {
  name: string;
  type: FieldType | string;
  required?: boolean;
  key?: boolean;
  list?: boolean;
  /**
   * Principal permitted to set this property's value. Omitted properties
   * inherit the model's authority (which defaults to `'internal'`). Enforced
   * by `validateWrite` against the writer's authority; `validateInstance` is
   * authority-agnostic.
   */
  authority?: ModelAuthority;
  description?: string;
  rules?: DrefRule[];
}

/**
 * Inclusive cardinality range. Either bound may be omitted (unbounded on that side).
 */
export interface Range {
  min?: number;
  max?: number;
}

export interface DomainModel {
  name: string;
  /**
   * Optional reference to one of the domain's scopes by name. Not mandatory —
   * a model without a scope lives directly in the domain.
   */
  scope?: string;
  /**
   * Origin of the record: `'client'`, `'internal'` or `'external'`. Defaults
   * to `'internal'` when omitted; properties without their own authority
   * inherit this value.
   */
  authority?: ModelAuthority;
  ttl?: TtlDuration;
  count?: Range;
  /**
   * Incoming mapping definitions describing how foreign payloads can be mapped
   * onto this model.
   */
  mapsFrom?: MappingDefinition[];
  properties: DrefProperty[];
}

/** A named scope within a domain. Models reference a scope by name; scopes do not contain models. */
export interface DomainScope {
  name: string;
  description?: string;
}

/** The primary DRef artifact: a bounded business domain with its scopes and models as siblings. */
export interface DomainDocument {
  $schema?: string;
  name: string;
  version?: string;
  description?: string;
  defaults?: {
    formats?: Formats;
    /** Domain field types: named, reusable field definitions referenced from a property's `type`. */
    fields?: Record<string, DrefFieldType>;
    [k: string]: unknown;
  };
  scopes?: DomainScope[];
  models?: DomainModel[];
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  /** Blocking issues — the result is invalid when this is non-empty. */
  errors: ValidationError[];
  /** Non-blocking issues from warn-only rules. */
  warnings: ValidationError[];
}

/**
 * Transformation functions available inside mapping documents. The catalog is
 * managed by the DRef project. `custom` carries a free-text reference that the
 * runtime resolves to a user-supplied function.
 */
export type TransformType =
  | 'lowerCase'
  | 'upperCase'
  | 'trim'
  | 'prefix'
  | 'suffix'
  | 'stripPrefix'
  | 'stripSuffix'
  | 'replace'
  | 'substring'
  | 'join'
  | 'multiply'
  | 'divide'
  | 'abs'
  | 'round'
  | 'roundTo'
  | 'toNumber'
  | 'toString'
  | 'toBoolean'
  | 'formatDate'
  | 'default'
  | 'constant'
  | 'custom';

/**
 * A single transformation step. `param` is required only for transforms that
 * declare a parameter (prefix, suffix, divide, replace, ...).
 */
export interface Transform {
  type: TransformType | string;
  param?: any;
}

/**
 * The mapping rule for one field. `from` reads a property of the incoming
 * foreign payload — or, as an array, several properties whose present values
 * the transform chain starts from (e.g. a `join` step; `to` is then required);
 * `to` is the target property it lands on (defaults to `from` for a 1:1 copy);
 * `transform` is a chain applied left to right — bare strings stand for
 * parameterless transforms, objects carry a `param`.
 */
export interface FieldMapping {
  from: string | string[];
  to?: string;
  transform?: (string | Transform)[];
}

/** A mapping field: `"id"` shorthand for a 1:1 copy, or an object carrying `from`. */
export type MappingField = string | FieldMapping;

/**
 * A Mapping Definition describes how a foreign payload can be mapped onto its
 * containing model. It lives in a model's `mapsFrom` array. It contains only the
 * mapping information — read fields, target properties, and optional transform
 * chains. Validating the incoming object against its own model document is the
 * caller's responsibility, not the mapping's.
 */
export interface MappingDefinition {
  name: string;
  provider?: string;
  version?: string;
  description?: string;
  fields: MappingField[];
}

export interface MappingResult {
  isValid: boolean;
  errors: ValidationError[];
  instance?: Record<string, any>;
}

/**
 * Lexical format conventions for the `Date`, `Time` and `DateTime` field types —
 * the `defaults.formats` of a DRef domain document. Patterns use dref tokens
 * (YYYY MM DD HH mm ss).
 */
export interface Formats {
  date?: string;
  time?: string;
  dateTime?: string;
}
