import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  fromDocument,
  toDocument,
  validateDraft,
  validateDomain,
  addScope,
  renameScope,
  removeScope,
  addModel,
  updateModel,
  removeModel,
  addProperty,
  updateProperty,
  removeProperty,
  moveProperty,
  addRule,
  updateRule,
  removeRule,
  addMapping,
  addMappingField,
  updateMappingField,
  removeMappingField,
  updateMapping,
  setFormats,
  setFieldType,
  removeFieldType,
} from '../dist/index.js';

test('composer: createDraft serializes and validates as an empty domain', () => {
  const draft = createDraft({ name: 'Inventory', version: '1.0.0', description: 'Stock' });
  assert.equal(draft.scopes.length, 0);
  assert.equal(draft.models.length, 0);
  const doc = toDocument(draft);
  assert.equal(doc.name, 'Inventory');
  assert.equal(doc.version, undefined, 'default version must not be emitted');
  assert.equal(doc.description, 'Stock');
  const res = validateDraft(draft);
  assert.equal(res.isValid, true, JSON.stringify(res.errors));
});

test('composer: toDocument emits canonical shape with internal values omitted', () => {
  const draft = createDraft({ name: 'Commerce' });
  let d = addScope(draft, { name: 'orders' });
  d = addModel(d, { name: 'PaymentIntent', scope: 'orders', authority: 'external' });
  d = addProperty(d, 0, {
    name: 'id',
    type: 'String',
    required: true,
    key: true,
    rules: [{ type: 'startsWith', param: 'pi_' }],
  });
  d = addProperty(d, 0, { name: 'amount', type: 'Number', list: true });
  d = addRule(d, 0, 1, { type: 'immutable' });
  d = addMapping(d, 0, { name: 'Stripe PaymentIntent', provider: 'Stripe' });
  d = addMappingField(d, 0, 0, { from: 'status' });
  d = addMappingField(d, 0, 0, { from: 'amount_cents', to: 'amount', transform: [{ type: 'divide', param: 100 }] });
  d = updateProperty(d, 0, 0, { description: 'External id' });

  const doc = toDocument(d);
  assert.equal(doc.name, 'Commerce');
  assert.deepEqual(doc.scopes, [{ name: 'orders' }]);

  const model = doc.models[0];
  assert.equal(model.name, 'PaymentIntent');
  assert.equal(model.scope, 'orders');
  assert.equal(model.authority, 'external');
  assert.deepEqual(model.properties[0], {
    name: 'id',
    type: 'String',
    required: true,
    key: true,
    description: 'External id',
    rules: [{ type: 'startsWith', param: 'pi_' }],
  });
  assert.deepEqual(model.properties[1], {
    name: 'amount',
    type: 'Number',
    list: true,
    rules: [{ type: 'immutable' }],
  });

  const mapping = model.mapsFrom[0];
  assert.equal(mapping.name, 'Stripe PaymentIntent');
  assert.equal(mapping.provider, 'Stripe');
  assert.equal(mapping.fields[0], 'status', 'simple field collapses to a string shorthand');
  assert.deepEqual(mapping.fields[1], {
    from: 'amount_cents',
    to: 'amount',
    transform: [{ type: 'divide', param: 100 }],
  });

  const res = validateDraft(d);
  assert.equal(res.isValid, true, JSON.stringify(res.errors));
});

test('composer: renameScope re-points models; removeScope detaches them', () => {
  let d = createDraft({ name: 'D' });
  d = addScope(d, { name: 'old' });
  d = addModel(d, { name: 'M', scope: 'old' });
  d = renameScope(d, 0, 'new');
  assert.equal(d.scopes[0].name, 'new');
  assert.equal(d.models[0].scope, 'new');

  d = removeScope(d, 0);
  assert.equal(d.scopes.length, 0);
  assert.equal(d.models[0].scope, undefined, 'detached model must lose its scope reference');
});

test('composer: property CRUD including move/remove', () => {
  let d = createDraft({ name: 'D' });
  d = addModel(d, { name: 'M' });
  d = addProperty(d, 0, { name: 'a', type: 'String' });
  d = addProperty(d, 0, { name: 'b', type: 'Number' });
  d = addProperty(d, 0, { name: 'c', type: 'Boolean' });
  d = moveProperty(d, 0, 2, 0);
  assert.deepEqual(d.models[0].properties.map((p) => p.name), ['c', 'a', 'b']);
  d = removeProperty(d, 0, 1);
  assert.deepEqual(d.models[0].properties.map((p) => p.name), ['c', 'b']);
  d = updateProperty(d, 0, 0, { required: true });
  assert.equal(d.models[0].properties[0].required, true);
});

test('composer: rule and mapping CRUD', () => {
  let d = createDraft({ name: 'D' });
  d = addModel(d, { name: 'M' });
  d = addProperty(d, 0, { name: 'email', type: 'String' });
  d = addRule(d, 0, 0, { type: 'email' });
  d = addRule(d, 0, 0, { type: 'lowercase' });
  d = updateRule(d, 0, 0, 0, { severity: 'warn' });
  assert.deepEqual(d.models[0].properties[0].rules.map((c) => c.type), ['email', 'lowercase']);
  assert.equal(d.models[0].properties[0].rules[0].severity, 'warn');
  d = removeRule(d, 0, 0, 0);
  assert.deepEqual(d.models[0].properties[0].rules.map((c) => c.type), ['lowercase']);

  d = addMapping(d, 0, { name: 'In' });
  d = addMappingField(d, 0, 0, { from: 'x' });
  d = updateMappingField(d, 0, 0, 0, { to: 'y' });
  assert.deepEqual(d.models[0].mapsFrom[0].fields[0], { from: 'x', to: 'y', transform: [] });
  d = removeMappingField(d, 0, 0, 0);
  assert.equal(d.models[0].mapsFrom[0].fields.length, 0);
  d = updateMapping(d, 0, 0, { provider: 'X' });
  assert.equal(d.models[0].mapsFrom[0].provider, 'X');
});

test('composer: defaults (formats + field types) round-trip through toDocument', () => {
  let d = createDraft({ name: 'D' });
  d = setFormats(d, { dateTime: 'epoch' });
  d = setFieldType(d, 'emailAddress', { type: 'String', rules: [{ type: 'email' }] });
  const doc = toDocument(d);
  assert.deepEqual(doc.defaults.formats, { dateTime: 'epoch' });
  assert.deepEqual(doc.defaults.fields.emailAddress, { type: 'String', rules: [{ type: 'email' }] });

  d = addModel(d, { name: 'M' });
  d = addProperty(d, 0, { name: 'label', type: 'String' });
  assert.equal(validateDraft(d).isValid, false, 'an entity model with no key property is invalid');

  d = removeModel(d, 0);
  d = removeFieldType(d, 'emailAddress');
  d = setFormats(d, { dateTime: undefined });
  assert.equal(toDocument(d).defaults, undefined);
});

test('composer: fromDocument round-trips a valid domain near-losslessly', () => {
  const doc = {
    name: 'Identity',
    version: '1.0.0',
    description: 'User accounts',
    defaults: {
      formats: { date: 'iso8601' },
      fields: { emailAddress: { type: 'String', rules: [{ type: 'email' }] } },
    },
    scopes: [{ name: 'core', description: 'Identity core' }],
    models: [
      {
        name: 'User',
        scope: 'core',
        authority: 'client',
        ttl: '30d',
        count: { min: 0, max: 1000000 },
        mapsFrom: [
          {
            name: 'Legacy User',
            fields: ['legacy_id', { from: 'full_name', to: 'name', transform: [{ type: 'trim' }], from2: undefined }],
          },
        ],
        properties: [
          { name: 'id', type: 'String', required: true, key: true, rules: [{ type: 'startsWith', param: 'u_' }] },
          { name: 'email', type: 'emailAddress', required: true },
          { name: 'roles', type: 'String', list: true },
        ],
      },
    ],
  };
  const draft = fromDocument(doc);
  assert.equal(draft.name, 'Identity');
  assert.equal(draft.models[0].mapsFrom[0].fields[0].from, 'legacy_id');
  assert.deepEqual(draft.models[0].mapsFrom[0].fields[1].transform, [{ type: 'trim' }]);
  assert.deepEqual(draft.models[0].properties.map((p) => p.name), ['id', 'email', 'roles']);

  const rebuilt = toDocument(draft);
  assert.equal(rebuilt.name, 'Identity');
  assert.equal(rebuilt.version, undefined, 'default version collapses back to omitted');
  assert.equal(rebuilt.scopes[0].name, 'core');
  assert.ok(rebuilt.models[0].mapsFrom.some((m) => m.fields.length === 2));
  const res = validateDomain(rebuilt);
  assert.equal(res.isValid, true, JSON.stringify(res.errors));
  assert.equal(
    JSON.stringify({ name: rebuilt.name, models: rebuilt.models[0].properties }),
    JSON.stringify({ name: doc.name, models: doc.models[0].properties }),
    'model properties must survive the round-trip'
  );
});