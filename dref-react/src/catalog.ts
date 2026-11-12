/**
 * Rule / field-type metadata used by the composer's editors. This is a
 * convenience mirror of the DRef rule and transformation catalogs
 * sufficient for interactive authoring; hosts can pass a richer catalog by
 * supplying `ruleOptions` to the component.
 */

/** The shape of a rule / transform parameter, which drives its editor. */
export type ParamKind = 'number' | 'integer' | 'range' | 'string' | 'enum-list' | 'string-list' | 'json' | 'any';

export interface RuleOption {
  type: string;
  /** The shape of the parameter the rule takes (absent = no parameter). */
  param?: ParamKind;
  /** Whether a `$field` cross-field reference is allowed as parameter. */
  ref?: boolean;
}

export const STRING_OPTIONS: RuleOption[] = [
  { type: 'notEmpty' },
  { type: 'trimmed' },
  { type: 'lowercase' },
  { type: 'uppercase' },
  { type: 'email' },
  { type: 'url' },
  { type: 'uuid' },
  { type: 'languageCode' },
  { type: 'minLength', param: 'integer', ref: true },
  { type: 'maxLength', param: 'integer', ref: true },
  { type: 'length', param: 'integer', ref: true },
  { type: 'pattern', param: 'string' },
  { type: 'startsWith', param: 'string', ref: true },
  { type: 'endsWith', param: 'string', ref: true },
  { type: 'contains', param: 'string', ref: true },
  { type: 'text', param: 'string' },
  { type: 'enum', param: 'string-list' },
  { type: 'immutable' },
];

export const NUMBER_OPTIONS: RuleOption[] = [
  { type: 'integer' },
  { type: 'positive' },
  { type: 'negative' },
  { type: 'positiveInteger' },
  { type: 'negativeInteger' },
  { type: 'greaterThan', param: 'number', ref: true },
  { type: 'greaterThanOrEqual', param: 'number', ref: true },
  { type: 'lessThan', param: 'number', ref: true },
  { type: 'lessThanOrEqual', param: 'number', ref: true },
  { type: 'multipleOf', param: 'number', ref: true },
  { type: 'precision', param: 'integer' },
  { type: 'immutable' },
];

export const BOOLEAN_OPTIONS: RuleOption[] = [
  { type: 'isTrue' },
  { type: 'isFalse' },
  { type: 'immutable' },
];

/** Date, DateTime and Time values are strings on the wire. */
export const TEMPORAL_OPTIONS: RuleOption[] = [
  { type: 'notEmpty' },
  { type: 'pattern', param: 'string' },
  { type: 'immutable' },
];

export const LIST_OPTIONS: RuleOption[] = [
  { type: 'range', param: 'range' },
  { type: 'unique' },
  { type: 'immutable' },
];

export const FIELD_TYPES: string[] = ['String', 'Number', 'Integer', 'Boolean', 'Date', 'DateTime', 'Time'];

export const MODEL_AUTHORITIES: string[] = ['client', 'internal', 'external'];

/** Suggested values for `defaults.formats`. */
export const FORMAT_SUGGESTIONS: Record<'date' | 'time' | 'dateTime', string[]> = {
  date: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'iso8601', 'epoch', 'epochMillis'],
  time: ['HH:mm:ss', 'HH:mm', 'iso8601'],
  dateTime: ['YYYY-MM-DDTHH:mm:ssZ', 'iso8601', 'epoch', 'epochMillis'],
};

export const TTL_UNITS: { unit: string; label: string }[] = [
  { unit: 's', label: 'seconds' },
  { unit: 'm', label: 'minutes' },
  { unit: 'h', label: 'hours' },
  { unit: 'd', label: 'days' },
  { unit: 'M', label: 'months' },
  { unit: 'y', label: 'years' },
];

/** Base rule choices for a (builtin) property type, computed with its list flag. */
export function optionsFor(type: string, list: boolean): RuleOption[] {
  if (list) return LIST_OPTIONS;
  if (type === 'Number') return NUMBER_OPTIONS;
  if (type === 'Boolean') return BOOLEAN_OPTIONS;
  if (type === 'Date' || type === 'DateTime' || type === 'Time') return TEMPORAL_OPTIONS;
  return STRING_OPTIONS;
}

export interface TransformOption {
  type: string;
  param?: ParamKind;
  /** Placeholder / example for the parameter editor. */
  example?: string;
}

/** Options usable for a mapping transform step. */
export const TRANSFORM_OPTIONS: TransformOption[] = [
  { type: 'lowerCase' },
  { type: 'upperCase' },
  { type: 'trim' },
  { type: 'prefix', param: 'string', example: 'cus_' },
  { type: 'suffix', param: 'string', example: '.json' },
  { type: 'stripPrefix', param: 'string', example: 'cus_' },
  { type: 'stripSuffix', param: 'string', example: '.json' },
  { type: 'replace', param: 'json', example: '{"pattern":"-","replacement":"_"}' },
  { type: 'substring', param: 'json', example: '{"start":0,"end":8}' },
  { type: 'join', param: 'string', example: ' ' },
  { type: 'multiply', param: 'number', example: '100' },
  { type: 'divide', param: 'number', example: '100' },
  { type: 'abs' },
  { type: 'round' },
  { type: 'roundTo', param: 'integer', example: '2' },
  { type: 'toNumber' },
  { type: 'toString' },
  { type: 'toBoolean' },
  { type: 'formatDate', param: 'string', example: 'YYYY-MM-DD' },
  { type: 'default', param: 'any', example: '"n/a"' },
  { type: 'constant', param: 'any', example: '"EUR"' },
  { type: 'custom', param: 'string', example: 'myResolver' },
];
