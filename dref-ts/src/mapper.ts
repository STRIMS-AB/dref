import {
  DomainModel,
  FieldMapping,
  Formats,
  MappingDefinition,
  MappingResult,
  Transform,
  TransformType,
  ValidationResult,
} from './types.js';

type CustomResolver = (reference: string) => ((value: any) => any) | undefined;

/** Domain context for a mapping: which domain the mapper is importing into. */
export interface MapOptions {
  custom?: CustomResolver;
  /** Target DRef model, used to resolve the `formatDate` output format. */
  targetModel?: DomainModel;
  /** The domain document's `defaults.formats` (dref token patterns per field type). */
  formats?: Formats;
}

const ISO_FORMATS: Required<Formats> = {
  date: 'YYYY-MM-DD',
  time: 'HH:mm:ss',
  dateTime: 'YYYY-MM-DDTHH:mm:ssZ',
};

const DREF_TO_JAVA: Record<string, string> = {
  YYYY: 'uuuu',
  MM: 'MM',
  DD: 'dd',
  HH: 'HH',
  mm: 'mm',
  ss: 'ss',
};

/**
 * Maps a foreign payload onto the target instance. The mapper performs no
 * validation of the incoming object — validating it against its own model
 * document is the caller's responsibility. For each configured field it reads
 * the source property, runs the transform chain left to right, and writes the
 * result to the target property. `options` describes the domain being imported
 * into, so `formatDate` can emit the target model's format.
 */
export function mapInstance(
  source: Record<string, any>,
  mapping: MappingDefinition,
  options?: MapOptions | CustomResolver
): MappingResult {
  const opts: MapOptions = typeof options === 'function' ? { custom: options } : (options || {});
  if (source == null) {
    return {
      isValid: false,
      errors: [{
        field: mapping.name,
        rule: 'required',
        message: 'Foreign payload must be a non-null map. Validate it against its source model document first.',
      }],
    };
  }

  const instance: Record<string, any> = {};
  for (const entry of mapping.fields || []) {
    const field = typeof entry === 'string' ? { from: entry } : entry;
    const outputFormat = resolveOutputFormat(field, opts);
    instance[mappingTarget(field)] = applyChain(readSource(field, source), toTransforms(field), opts.custom, outputFormat);
  }
  return { isValid: true, errors: [], instance };
}

/** The target property a mapping field writes to (`to`, or `from` for a 1:1 copy). */
function mappingTarget(field: FieldMapping): string {
  return typeof field.from === 'string' ? (field.to ?? field.from) : (field.to as string);
}

/**
 * Reads a mapping field's source value: a single `from` property directly, or —
 * for an array `from` — the array of the source properties' present values in
 * declared order (absent/null sources are skipped; when none is present the
 * value is null, so the transform chain passes it through untouched).
 */
function readSource(field: FieldMapping, source: Record<string, any>): any {
  if (!Array.isArray(field.from)) {
    return source[field.from];
  }
  const present = field.from.map((f) => source[f]).filter((v) => v !== undefined && v !== null);
  return present.length > 0 ? present : null;
}

function toTransforms(field: FieldMapping): Transform[] {
  return (field.transform || []).map((step) =>
    typeof step === 'string' ? { type: step as TransformType } : step
  );
}

/**
 * The `formatDate` output format: the domain `defaults.formats` for the mapped
 * target property's field type, then the ISO standard. Named forms resolve as
 * follows: `iso8601` becomes that value kind's ISO token pattern, while
 * `epoch`/`epochMillis` pass through as names so `formatEpoch` emits numbers.
 */
function resolveOutputFormat(field: FieldMapping, options: MapOptions): string {
  const target = mappingTarget(field);
  const property = options.targetModel?.properties.find((p) => p.name === target);
  const formats = options.formats ?? {};
  let key: keyof Formats = 'dateTime';
  if (property && property.type === 'DateTime') {
    key = 'dateTime';
  } else if (property && (property.type === 'Date' || property.type === 'Time')) {
    key = property.type.toLowerCase() as keyof Formats;
  }
  const declared = (formats[key] && String(formats[key]).trim()) || ISO_FORMATS[key as keyof Required<Formats>];
  if (declared === 'iso8601') {
    return ISO_FORMATS[key as keyof Required<Formats>];
  }
  return declared;
}

/**
 * Runs a transform chain left to right. Null passes through untouched except
 * through `default`, `constant` and `custom`. `dateFormat` is the dref token
 * pattern used by a `formatDate` step (default: the ISO dateTime standard).
 */
export function applyChain(
  value: any,
  transforms: Transform[],
  custom?: CustomResolver,
  dateFormat?: string
): any {
  let current = value;
  for (const transform of transforms) {
    if (
      current === null ||
      current === undefined
    ) {
      if (transform.type !== 'default' && transform.type !== 'constant' && transform.type !== 'custom') {
        continue;
      }
    }
    current = applyTransform(current, transform, custom, dateFormat);
  }
  return current;
}

/**
 * Applies a single transform to a value. `dateFormat` is the dref token
 * pattern used by a `formatDate` step (default: the ISO dateTime standard).
 */
export function applyTransform(
  value: any,
  transform: Transform,
  custom?: CustomResolver,
  dateFormat?: string
): any {
  const { type, param } = transform;
  switch (type) {
    // STRING
    case 'lowerCase':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'upperCase':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'trim':
      return typeof value === 'string' ? value.trim() : value;
    case 'prefix':
      return typeof value === 'string' ? String(param) + value : value;
    case 'suffix':
      return typeof value === 'string' ? value + String(param) : value;
    case 'stripPrefix':
      return typeof value === 'string' && value.startsWith(String(param))
        ? value.slice(String(param).length)
        : value;
    case 'stripSuffix':
      return typeof value === 'string' && value.endsWith(String(param))
        ? value.slice(0, value.length - String(param).length)
        : value;
    case 'replace': {
      const pattern = String(param?.pattern ?? '');
      const replacement = String(param?.replacement ?? '');
      return typeof value === 'string' && pattern ? value.split(pattern).join(replacement) : value;
    }
    case 'substring': {
      if (typeof value !== 'string') return value;
      const start = Number(param?.start ?? 0);
      const end = param?.end;
      return end !== undefined ? value.substring(start, Math.min(Number(end), value.length)) : value.substring(start);
    }
    // STRING (array-level)
    case 'join': {
      if (!Array.isArray(value)) return value;
      const separator = param === null || param === undefined ? '' : String(param);
      return value
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v))
        .join(separator);
    }
    // NUMBER
    case 'multiply':
      return typeof value === 'number' ? value * Number(param ?? 1) : value;
    case 'divide':
      return typeof value === 'number' && Number(param ?? 1) !== 0 ? value / Number(param) : value;
    case 'abs':
      return typeof value === 'number' ? Math.abs(value) : value;
    case 'round':
      return typeof value === 'number' ? Math.round(value) : value;
    case 'roundTo': {
      if (typeof value !== 'number') return value;
      const factor = Math.pow(10, Number(param ?? 0));
      return Math.round(value * factor) / factor;
    }
    // COERCION
    case 'toNumber': {
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value.trim());
        return Number.isNaN(n) ? value : n;
      }
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    }
    case 'toString':
      return typeof value === 'string' ? value : String(value);
    case 'toBoolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        const t = value.trim().toLowerCase();
        if (['true', '1', 'yes'].includes(t)) return true;
        if (['false', '0', 'no'].includes(t)) return false;
      }
      return value;
    }
    // TEMPORAL
    case 'formatDate':
      return formatDate(value, param, dateFormat ?? ISO_FORMATS.dateTime);
    // COMMON
    case 'default':
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        return param;
      }
      return value;
    case 'constant':
      return param;
    // CUSTOM
    case 'custom': {
      if (!custom) {
        throw new Error(`Custom transform '${String(param)}' requires a custom resolver to be supplied to mapInstance.`);
      }
      const fn = custom(String(param));
      if (!fn) {
        throw new Error(`No custom transform registered for: ${String(param)}`);
      }
      return fn(value);
    }
    default:
      return value;
  }
}

function formatDate(value: any, param: any, output: string): any {
  if (value === null || value === undefined) return value;
  const source = String(param ?? '').trim();
  const unix = source.toLowerCase() === 'unix';

  if (typeof value === 'number') {
    return formatEpoch(value, output);
  }

  if (typeof value === 'string') {
    if (unix || source === '') {
      const n = Number(value.trim());
      if (!Number.isNaN(n)) return formatEpoch(n, output);
    }
    const from = source === '' ? ISO_FORMATS.dateTime : source;
    const parsed = parseDref(value.trim(), from);
    if (parsed) {
      return formatWithPattern(parsed, javaPattern(output));
    }
    return value;
  }
  return value;
}

/**
 * Emits an epoch value into the resolved output format: `epoch`/`epochMillis`
 * outputs are whole numbers, any other format a token-pattern string.
 */
function formatEpoch(epoch: number, output: string): any {
  let e = epoch;
  if (Math.abs(e) > 10_000_000_000) {
    e = e / 1000; // milliseconds
  }
  if (output === 'epoch') return e;
  if (output === 'epochMillis') return e * 1000;
  if (output === 'iso8601') output = ISO_FORMATS.dateTime; // no field-type context here
  return formatWithPattern(new Date(e * 1000), javaPattern(output));
}

/**
 * Parses a string against a dref token pattern (YYYY MM DD HH mm ss).
 * Missing fields default: MM/DD -> 1, time -> 0, YYYY -> 1970.
 * Returns a UTC-anchored Date, or null when the input does not match.
 */
function parseDref(input: string, pattern: string): Date | null {
  const tokens = ['YYYY', 'MM', 'DD', 'HH', 'mm', 'ss'];
  let regex = '';
  const order: { token: string; group: number }[] = [];
  let i = 0;
  let group = 1;
  while (i < pattern.length) {
    let matched = false;
    for (const token of tokens) {
      if (pattern.startsWith(token, i)) {
        order.push({ token, group: group++ });
        regex += token === 'YYYY' ? '(\\d{4})' : '(\\d{1,2})';
        i += token.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    regex += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i++;
  }
  const m = new RegExp(`^${regex}$`).exec(input);
  if (!m) return null;
  const value = (token: string, fallback: number): number => {
    const entry = order.find((o) => o.token === token);
    return entry ? Number(m[entry.group]) : fallback;
  };
  const date = new Date(Date.UTC(
    value('YYYY', 1970),
    value('MM', 1) - 1,
    value('DD', 1),
    value('HH', 0),
    value('mm', 0),
    value('ss', 0),
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

function javaPattern(drefPattern: string): string {
  let i = 0;
  let out = '';
  while (i < drefPattern.length) {
    let matched = false;
    for (const token of Object.keys(DREF_TO_JAVA).sort((a, b) => b.length - a.length)) {
      if (drefPattern.startsWith(token, i)) {
        out += DREF_TO_JAVA[token];
        i += token.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    out += drefPattern[i];
    i++;
  }
  return out;
}

function formatWithPattern(date: Date, javaPatternStr: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const parts: Record<string, string> = {
    uuuu: String(date.getUTCFullYear()),
    MM: pad(date.getUTCMonth() + 1),
    dd: pad(date.getUTCDate()),
    HH: pad(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
  };
  return javaPatternStr.replace(/uuuu|MM|dd|HH|mm|ss/g, (token) => parts[token] ?? token);
}

export function validateMappingDefinition(mapping: MappingDefinition): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  if (!mapping.name) {
    errors.push({ field: 'name', rule: 'required', message: 'Mapping definition requires a name.' });
  }
  const names = new Set<string>();
  for (const entry of mapping.fields || []) {
    const field = typeof entry === 'string' ? { from: entry as string } : entry;
    const from = field?.from;
    if (typeof from === 'string') {
      if (!from) {
        errors.push({ field: 'from', rule: 'required', message: 'Every mapping field needs a `from` source property.' });
        continue;
      }
      if (names.has(from)) {
        errors.push({ field: from, rule: 'duplicateField', message: `Duplicate source field in mapping: ${from}` });
      }
      names.add(from);
    } else if (Array.isArray(from)) {
      if (from.length === 0) {
        errors.push({ field: 'from', rule: 'required', message: 'A multi-field mapping `from` array must not be empty.' });
        continue;
      }
      for (const f of from) {
        if (typeof f !== 'string' || !f || f.trim() === '') {
          errors.push({ field: 'from', rule: 'required', message: 'Every `from` entry must be a non-empty source property name.' });
          continue;
        }
        if (names.has(f)) {
          errors.push({ field: f, rule: 'duplicateField', message: `Duplicate source field in mapping: ${f}` });
        }
        names.add(f);
      }
      if (typeof field.to !== 'string' || field.to.trim() === '') {
        errors.push({ field: 'to', rule: 'required', message: 'A multi-field mapping requires a `to` target property.' });
      }
    } else {
      errors.push({ field: 'from', rule: 'required', message: 'Every mapping field needs a `from` source property.' });
    }
  }
  return { isValid: errors.length === 0, errors, warnings: [] };
}