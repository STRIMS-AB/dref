/**
 * Every user-facing string of the composer. Hosts translate by passing a
 * partial `labels` object; missing keys fall back to {@link DEFAULT_LABELS}.
 * `{n}` / `{name}` placeholders are interpolated at render time.
 */
export interface ComposerLabels {
  explorer: string;
  settings: string;
  overview: string;
  searchStructure: string;
  noSearchResults: string;
  expandScope: string;
  collapseScope: string;
  reorderScope: string;
  scopeOrderHint: string;
  emptyScope: string;
  fieldsHint: string;
  mappingFieldsHint: string;
  noMappingFields: string;
  editMapping: string;
  unnamed: string;
  modelSettingsHint: string;
  structureHint: string;
  allChangesSaved: string;
  // Toolbar / tabs
  design: string;
  json: string;
  preview: string;
  importJson: string;
  openFile: string;
  download: string;
  copy: string;
  copied: string;
  undo: string;
  redo: string;
  reset: string;
  save: string;
  saving: string;
  unsaved: string;
  readOnlyHint: string;
  // Status
  valid: string;
  invalid: string;
  errorsCount: string;
  warningsCount: string;
  // Sidebar
  domain: string;
  domainSettings: string;
  scopes: string;
  models: string;
  unscoped: string;
  addScope: string;
  addModel: string;
  searchModels: string;
  noModels: string;
  noScopes: string;
  modelsCount: string;
  propertiesCount: string;
  // Domain panel
  domainName: string;
  version: string;
  description: string;
  formats: string;
  formatsHint: string;
  dateFormat: string;
  timeFormat: string;
  dateTimeFormat: string;
  fieldTypes: string;
  fieldTypesHint: string;
  fieldTypeName: string;
  addFieldType: string;
  baseType: string;
  modelReferences: string;
  modelReferenceHint: string;
  // Scope panel
  scope: string;
  scopeName: string;
  scopeNameHint: string;
  scopeModels: string;
  deleteScope: string;
  deleteScopeHint: string;
  // Model panel
  model: string;
  modelName: string;
  modelNameHint: string;
  noScope: string;
  authority: string;
  authorityHint: string;
  ttl: string;
  ttlHint: string;
  count: string;
  countHint: string;
  min: string;
  max: string;
  deleteModel: string;
  duplicateModel: string;
  // Properties
  properties: string;
  addProperty: string;
  propertyName: string;
  type: string;
  required: string;
  key: string;
  list: string;
  noProperties: string;
  noPropertiesHint: string;
  moveUp: string;
  moveDown: string;
  reorderRows: string;
  details: string;
  // Rules
  rules: string;
  addRule: string;
  noRules: string;
  
  fieldRefHint: string;
  warnSeverity: string;
  warnSeverityHint: string;
  // Mappings
  mappings: string;
  mappingsHint: string;
  mappingsTab: string;
  fieldsTab: string;
  addMapping: string;
  mappingName: string;
  provider: string;
  sourceVersion: string;
  fields: string;
  fieldsCount: string;
  mappingsCount: string;
  addField: string;
  source: string;
  target: string;
  from: string;
  fromHint: string;
  to: string;
  transform: string;
  addTransform: string;
  noMappings: string;
  noMappingsTitle: string;
  noMappingsHint: string;
  selectModel: string;
  // Generic
  remove: string;
  confirmRemove: string;
  cancel: string;
  none: string;
  issues: string;
  // JSON / import
  jsonHint: string;
  jsonPlaceholder: string;
  apply: string;
  applied: string;
  parseError: string;
  notADomain: string;
  newDomain: string;
}

export const DEFAULT_LABELS: ComposerLabels = {
  explorer: 'Explorer',
  settings: 'Settings',
  overview: 'Overview',
  searchStructure: 'Find a scope or model…',
  noSearchResults: 'No matching scopes or models.',
  expandScope: 'Expand {name}',
  collapseScope: 'Collapse {name}',
  reorderScope: 'Reorder scope {name}: drag or use Up / Down',
  scopeOrderHint: 'Drag scopes to arrange your workspace.',
  emptyScope: '',
  fieldsHint: 'Define the data each record carries. Open a field to edit its rules.',
  mappingFieldsHint: 'Match an incoming source field to a model field. Add transforms when the values need to change.',
  noMappingFields: 'No field rules yet. Add a source field and choose where its value belongs.',
  editMapping: 'Mapping details',
  unnamed: 'Untitled',
  modelSettingsHint: 'Identity, ownership and retention for this model.',
  structureHint: 'Group related models into scopes, then define their fields and incoming mappings.',
  allChangesSaved: 'No unsaved changes',
  design: 'Design',
  json: 'JSON',
  preview: 'Generated JSON',
  importJson: 'Paste / import',
  openFile: 'Open file…',
  download: 'Download',
  copy: 'Copy JSON',
  copied: 'Copied',
  undo: 'Undo',
  redo: 'Redo',
  reset: 'Reset changes',
  save: 'Save',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  readOnlyHint: 'Read-only view',
  valid: 'Valid',
  invalid: 'Not valid',
  errorsCount: '{n} errors',
  warningsCount: '{n} warnings',
  domain: 'Domain',
  domainSettings: 'Domain settings',
  scopes: 'Scopes',
  models: 'Models',
  unscoped: 'No scope',
  addScope: 'New scope',
  addModel: 'New model',
  searchModels: 'Filter models…',
  noModels: 'No models yet.',
  noScopes: 'No scopes. Scopes are optional groups for models.',
  modelsCount: '{n} models',
  propertiesCount: '{n} props',
  domainName: 'Domain name',
  version: 'Version',
  description: 'Description',
  formats: 'Default formats',
  formatsHint: 'How Date, Time and DateTime values are serialized, unless overridden.',
  dateFormat: 'Date',
  timeFormat: 'Time',
  dateTimeFormat: 'Date-time',
  fieldTypes: 'Field types',
  fieldTypesHint: 'Reusable named types (e.g. emailAddress) that properties can use as their type.',
  fieldTypeName: 'Type name',
  addFieldType: 'New field type',
  baseType: 'Base type',
  modelReferences: 'Model references',
  modelReferenceHint: 'Links this property to another model’s key — a cross-model relationship.',
  scope: 'Scope',
  scopeName: 'Scope name',
  scopeNameHint: 'lowercase kebab-case, e.g. billing or order-lines',
  scopeModels: 'Models in this scope',
  deleteScope: 'Delete scope',
  deleteScopeHint: 'Models in this scope are kept and become unscoped.',
  model: 'Model',
  modelName: 'Model name',
  modelNameHint: 'PascalCase, e.g. Customer or PaymentIntent',
  noScope: '— none —',
  authority: 'Authority',
  authorityHint: 'Who owns the record.',
  ttl: 'TTL',
  ttlHint: 'Retention, integer + unit (s m h d M y), e.g. 30d',
  count: 'Instance count',
  countHint: 'Inclusive range; max 1 = configuration model.',
  min: 'Min',
  max: 'Max',
  deleteModel: 'Delete model',
  duplicateModel: 'Duplicate',
  properties: 'Properties',
  addProperty: 'Add property',
  propertyName: 'Name',
  type: 'Type',
  required: 'Required',
  key: 'Key',
  list: 'List',
  noProperties: 'No properties yet.',
  noPropertiesHint: 'Properties are the fields a record of this model carries. Add the first one — every model needs at least a key.',
  moveUp: 'Move up',
  moveDown: 'Move down',
  reorderRows: 'Reorder row (drag, or focus and use arrow keys)',
  details: 'Details',
  rules: 'Rules',
  addRule: '+ rule',
  noRules: 'No rules',
  warnSeverity: 'warn',
  warnSeverityHint: 'Report failures as warnings instead of blocking errors',
  fieldRefHint: 'Use $otherProperty to compare with a sibling property',
  mappings: 'Incoming mappings',
  mappingsHint: 'How payloads from other systems map onto this model.',
  mappingsTab: 'Mappings',
  fieldsTab: 'Fields',
  addMapping: 'Add mapping',
  mappingName: 'Source model',
  provider: 'Provider',
  sourceVersion: 'Source version',
  fields: 'Fields',
  fieldsCount: '{n} fields',
  mappingsCount: '{n} mappings',
  addField: 'Add field',
  source: 'Source',
  target: 'Target',
  from: 'From',
  fromHint: 'source field(s), comma-separated',
  to: 'To',
  transform: 'Transform',
  addTransform: '+ step',
  noMappings: 'No incoming mappings.',
  noMappingsTitle: 'No mappings yet',
  noMappingsHint: 'A mapping tells DRef how a payload from another system (a source model) fills this model’s properties. Add one per upstream source.',
  selectModel: 'Select a model in the sidebar to configure its mappings.',
  remove: 'Remove',
  confirmRemove: 'Confirm',
  cancel: 'Cancel',
  none: 'None',
  issues: 'Issues',
  jsonHint: 'Paste an existing domain descriptor, then apply it to load it into the designer.',
  jsonPlaceholder: 'Paste a DRef domain document here…',
  apply: 'Apply',
  applied: 'Applied',
  parseError: 'Invalid JSON: {name}',
  notADomain: 'This JSON is not a domain document (expected an object with a "name" and "models").',
  newDomain: 'New domain',
};

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

// Locale registry
const localeRegistry: Record<string, ComposerLabels> = {
  en: DEFAULT_LABELS,
};

let currentLocale = 'en';

export function registerLocale(code: string, labels: ComposerLabels): void {
  localeRegistry[code] = labels;
}

export function setLocale(code: string): boolean {
  if (code in localeRegistry) {
    currentLocale = code;
    return true;
  }
  return false;
}

export function getLocale(): string {
  return currentLocale;
}

export function getLabels(locale?: string): ComposerLabels {
  const code = locale ?? currentLocale;
  return localeRegistry[code] ?? DEFAULT_LABELS;
}

export function resolveLabels(overrides?: Partial<ComposerLabels>, locale?: string): ComposerLabels {
  const base = getLabels(locale);
  return overrides ? { ...base, ...overrides } : base;
}
