import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import Ajv from 'ajv';
import { validateModel, validateMappingDefinition, validateDomain as validateDomainEnvelope, resolveModels } from '@dref/validator';

const here = dirname(fileURLToPath(import.meta.url));
const domainsDir = join(here, '../domains');
const schema = JSON.parse(readFileSync(join(here, '../domain.schema.json'), 'utf8'));

const KNOWN_TRANSFORMS = new Set([
  'lowerCase', 'upperCase', 'trim', 'prefix', 'suffix',
  'stripPrefix', 'stripSuffix', 'replace', 'substring',
  'multiply', 'divide', 'abs', 'round', 'roundTo',
  'toNumber', 'toString', 'toBoolean', 'formatDate',
  'default', 'constant', 'custom',
]);

const ajv = new Ajv({ strict: false });
const validateDomain = ajv.compile(schema);

let failed = 0;

function report(label, result) {
  if (result.isValid) return true;
  failed += 1;
  console.error(`FAIL ${label}: ${result.errors.map(e => e.message).join('; ')}`);
  return false;
}

function reportBool(label, ok, message) {
  if (ok) return;
  failed += 1;
  console.error(`FAIL ${label}: ${message}`);
}

function validateDomainDoc(file) {
  const domain = JSON.parse(readFileSync(join(domainsDir, file), 'utf8'));

  reportBool(`${file} / domain document`,
    validateDomain(domain),
    (validateDomain.errors || [])[0]?.message || 'does not conform to domain.schema.json');

  if (!domain.name || typeof domain.name !== 'string') {
    reportBool(`${file} / name`, false, 'domain document must have a name');
  }

  report(`${file} / domain document (validateDomain)`, validateDomainEnvelope(domain));

  let resolvedModels;
  try {
    resolvedModels = resolveModels(domain);
  } catch (err) {
    reportBool(`${file} / field type resolution`, false, err.message);
    return;
  }
  for (const resolved of resolvedModels) {
    report(`${file} / resolved model ${resolved.name ?? '(unnamed)'}`, validateModel(resolved));
  }

  const formats = domain.defaults?.formats ?? {};
  for (const key of ['date', 'time', 'dateTime']) {
    if (formats[key] !== undefined && (typeof formats[key] !== 'string' || formats[key].trim() === '')) {
      reportBool(`${file} / defaults.formats.${key}`, false, `must be a non-empty format string, got '${formats[key]}'`);
    }
  }

  const scopeNames = new Set();
  for (const scope of domain.scopes ?? []) {
    if (scopeNames.has(scope.name)) {
      reportBool(`${file} / scope ${scope.name}`, false, 'duplicate scope name');
    }
    scopeNames.add(scope.name);
  }

  const modelNames = new Set();
  for (const model of domain.models ?? []) {
    const label = `${file} / model ${model.name}`;
    if (modelNames.has(model.name)) {
      reportBool(label, false, 'duplicate model name within domain');
    }
    modelNames.add(model.name);

    if (model.scope !== undefined && !scopeNames.has(model.scope)) {
      reportBool(label, false, `model references unknown scope '${model.scope}'`);
    }

    report(label, validateModel(model));

    for (const mapping of model.mapsFrom ?? []) {
      const mappingLabel = `${label} / mapsFrom ${mapping.name}`;
      reportBool(mappingLabel,
        validateMappingDefinition(mapping),
        (validateMappingDefinition(mapping).errors || []).map(e => e.message).join('; '));

      const transforms = new Set();
      for (const field of mapping.fields ?? []) {
        const entry = typeof field === 'string' ? {} : field;
        if (Array.isArray(entry.transform)) {
          for (const step of entry.transform) {
            transforms.add(typeof step === 'string' ? step : step.type);
          }
        }
      }
      for (const transformType of transforms) {
        reportBool(`${mappingLabel} / transform ${transformType}`,
          KNOWN_TRANSFORMS.has(transformType),
          `'${transformType}' is not a cataloged transform`);
      }
    }
  }
}

for (const file of readdirSync(domainsDir).filter(f => f.endsWith('.json')).sort()) {
  validateDomainDoc(file);
}

if (failed > 0) {
  process.exit(1);
}
console.log(`OK: ${readdirSync(domainsDir).filter(f => f.endsWith('.json')).length} domain documents are valid DRef domain documents.`);