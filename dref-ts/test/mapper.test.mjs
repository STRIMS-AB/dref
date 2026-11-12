import test from 'node:test';
import assert from 'node:assert/strict';
import { mapInstance, applyTransform, validateMappingDefinition } from '../dist/index.js';

const stripePaymentIntentMapping = {
  name: 'Stripe PaymentIntent',
  provider: 'Stripe',
  version: '1.0.0',
  fields: [
    'id',
    'status',
    { from: 'order_id', to: 'orderId' },
    { from: 'payment_method', to: 'paymentMethodId' },
    { from: 'amount', transform: [{ type: 'divide', param: 100 }] },
    { from: 'currency', transform: ['upperCase'] },
    { from: 'description', transform: ['trim'] },
    { from: 'created', to: 'createdAt', transform: [{ type: 'formatDate', param: 'unix' }] },
  ],
};

test('mapInstance: 1:1 shorthand and transform chains', () => {
  const source = {
    id: 'pi_3NabcDEFxyz',
    amount: 1099,
    currency: 'usd',
    description: '  Chromecast  ',
    status: 'succeeded',
    order_id: 'ord_12',
    payment_method: 'pm_987',
    created: 1699899982,
  };

  const result = mapInstance(source, stripePaymentIntentMapping);
  assert.equal(result.isValid, true);
  assert.equal(result.instance.id, 'pi_3NabcDEFxyz');
  assert.equal(result.instance.status, 'succeeded');
  assert.equal(result.instance.orderId, 'ord_12');
  assert.equal(result.instance.paymentMethodId, 'pm_987');
  assert.equal(result.instance.amount, 10.99);
  assert.equal(result.instance.currency, 'USD');
  assert.equal(result.instance.description, 'Chromecast');
  assert.equal(result.instance.createdAt, '2023-11-13T18:26:22Z');
});

test('mapInstance: does not validate the incoming object', () => {
  const bad = { id: 'cus_1', amount: -5, currency: 'USD', status: 'succeeded', order_id: 'ord_1', created: 1699899982 };
  const result = mapInstance(bad, stripePaymentIntentMapping);
  assert.equal(result.isValid, true, "the mapper must not reject a payload that fails source-model validation");
  assert.equal(result.instance.id, 'cus_1');
  assert.equal(result.instance.amount, -0.05);
});

test('mapInstance: null payload is rejected', () => {
  const result = mapInstance(null, stripePaymentIntentMapping);
  assert.equal(result.isValid, false);
  assert.equal(result.instance, undefined);
});

test('mapInstance: multi-field from joins source values', () => {
  const mapping = {
    name: 'Contact Row',
    fields: [
      { from: ['first_name', 'last_name'], to: 'fullName', transform: [{ type: 'join', param: ' ' }] },
    ],
  };

  const result = mapInstance({ first_name: 'Ada', last_name: 'Lovelace' }, mapping);
  assert.equal(result.isValid, true);
  assert.equal(result.instance.fullName, 'Ada Lovelace');

  // A missing source is skipped by the join
  const partial = mapInstance({ first_name: 'Ada' }, mapping);
  assert.equal(partial.instance.fullName, 'Ada');

  // When no source is present the value is null and the chain passes it through
  const none = mapInstance({}, mapping);
  assert.equal(none.instance.fullName, null);
});

test('mapInstance: multi-field from without transform copies present values as a list', () => {
  const mapping = {
    name: 'Profile Row',
    fields: [
      { from: ['hobbies', 'interests'], to: 'tags' },
    ],
  };

  const result = mapInstance({ hobbies: 'chess', interests: 'math' }, mapping);
  assert.equal(result.isValid, true);
  assert.deepEqual(result.instance.tags, ['chess', 'math']);

  const partial = mapInstance({ hobbies: 'chess' }, mapping);
  assert.deepEqual(partial.instance.tags, ['chess']);
});

test('applyTransform: join only acts on arrays', () => {
  assert.equal(applyTransform(['a', 'b'], { type: 'join', param: '-' }), 'a-b');
  assert.equal(applyTransform(['a', null, 'b'], { type: 'join', param: '-' }), 'a-b');
  assert.equal(applyTransform(['x'], { type: 'join', param: '-' }), 'x');
  assert.equal(applyTransform('already a string', { type: 'join', param: '-' }), 'already a string');
});

test('validateMappingDefinition: multi-field from rules', () => {
  const ok = validateMappingDefinition({
    name: 'M',
    fields: [{ from: ['first_name', 'last_name'], to: 'fullName', transform: [{ type: 'join', param: ' ' }] }],
  });
  assert.equal(ok.isValid, true, JSON.stringify(ok.errors));

  const noTo = validateMappingDefinition({ name: 'M', fields: [{ from: ['a', 'b'] }] });
  assert.equal(noTo.isValid, false);
  assert.ok(noTo.errors.some(e => e.field === 'to' && e.rule === 'required'), JSON.stringify(noTo.errors));

  const empty = validateMappingDefinition({ name: 'M', fields: [{ from: [], to: 'x' }] });
  assert.equal(empty.isValid, false);
  assert.ok(empty.errors.some(e => e.rule === 'required'));

  const duplicate = validateMappingDefinition({
    name: 'M',
    fields: [{ from: 'a', to: 'x' }, { from: ['a', 'b'], to: 'y' }],
  });
  assert.equal(duplicate.isValid, false);
  assert.ok(duplicate.errors.some(e => e.rule === 'duplicateField'), JSON.stringify(duplicate.errors));
});

test('mapInstance: default/constant fill missing values', () => {
  const mapping = {
    name: 'Legacy Row',
    fields: [
      { from: 'email', transform: [{ type: 'default', param: 'unknown@example.com' }] },
      { from: 'source', transform: [{ type: 'constant', param: 'legacy-import' }] },
    ],
  };

  const result = mapInstance({}, mapping);
  assert.equal(result.isValid, true);
  assert.equal(result.instance.email, 'unknown@example.com');
  assert.equal(result.instance.source, 'legacy-import');
});

test('mapInstance: custom resolver', () => {
  const mapping = {
    name: 'Acme Event',
    fields: [
      { from: 'product_code', to: 'productCode', transform: [{ type: 'custom', param: 'com.acme.slug' }] },
    ],
  };

  const result = mapInstance({ product_code: '  Widget Pro  ' }, mapping, () => (s) => String(s).toUpperCase());
  assert.equal(result.isValid, true);
  assert.equal(result.instance.productCode, '  WIDGET PRO  ');
});

test('mapInstance: custom without resolver throws', () => {
  const mapping = {
    name: 'Acme Event',
    fields: [{ from: 'code', transform: [{ type: 'custom', param: 'x' }] }],
  };
  assert.throws(() => mapInstance({ code: 'y' }, mapping), /requires a custom resolver/);
});

test('formatDate: unix source, domain formats, rule override, patterns', () => {
  const unix = { type: 'formatDate', param: 'unix' };
  assert.equal(applyTransform(1699899982, unix), '2023-11-13T18:26:22Z');
  assert.equal(applyTransform('1699899982', unix), '2023-11-13T18:26:22Z');
  assert.equal(applyTransform(1699899982000, unix), '2023-11-13T18:26:22Z');
  assert.equal(applyTransform(1699899982, { type: 'formatDate', param: 'unix' }, undefined, 'DD/MM/YYYY'), '13/11/2023');
  assert.equal(applyTransform('2023/11/13', { type: 'formatDate', param: 'YYYY/MM/DD' }), '2023-11-13T00:00:00Z');
  assert.equal(applyTransform('not-a-date', unix), 'not-a-date');
});

test('mapInstance: formatDate uses domain formats fallback to ISO', () => {
  const mapping = {
    name: 'Acme Event',
    fields: [
      { from: 'created', to: 'createdAt', transform: [{ type: 'formatDate', param: 'unix' }] },
      { from: 'refreshed_at', to: 'refreshedAt', transform: [{ type: 'formatDate', param: 'unix' }] },
    ],
  };
  const targetModel = {
    name: 'Event',
    properties: [{ name: 'createdAt', type: 'DateTime' }],
  };

  const domain = mapInstance({ created: 1699899982, refreshed_at: 1699899982 }, mapping, {
    targetModel,
    formats: { dateTime: 'DD-MM-YYYY HH:mm:ss' },
  });
  assert.equal(domain.instance.createdAt, '13-11-2023 18:26:22');

  const iso = mapInstance({ created: 1699899982 }, mapping, { targetModel });
  assert.equal(iso.instance.createdAt, '2023-11-13T18:26:22Z');
});

test('formatDate: named epoch and iso8601 outputs', () => {
  const unix = { type: 'formatDate', param: 'unix' };
  assert.equal(applyTransform(1699899982, unix, undefined, 'epoch'), 1699899982);
  assert.equal(applyTransform(1699899982, unix, undefined, 'epochMillis'), 1699899982000);
  assert.equal(applyTransform(1699899982, unix, undefined, 'iso8601'), '2023-11-13T18:26:22Z');

  const mapping = {
    name: 'Epoch Event',
    fields: [{ from: 'created', to: 'createdAt', transform: [{ type: 'formatDate', param: 'unix' }] }],
  };
  const targetModel = { name: 'Event', properties: [{ name: 'createdAt', type: 'DateTime' }] };
  const dateModel = { name: 'Event', properties: [{ name: 'createdAt', type: 'Date' }] };
  const epoch = mapInstance({ created: 1699899982 }, mapping, { targetModel, formats: { dateTime: 'epoch' } });
  assert.equal(epoch.instance.createdAt, 1699899982);
  const millis = mapInstance({ created: 1699899982 }, mapping, { targetModel, formats: { dateTime: 'epochMillis' } });
  assert.equal(millis.instance.createdAt, 1699899982000);
  const iso8601 = mapInstance({ created: 1699899982 }, mapping, { targetModel, formats: { dateTime: 'iso8601' } });
  assert.equal(iso8601.instance.createdAt, '2023-11-13T18:26:22Z');
  const dateIso = mapInstance({ created: 1699899982 }, mapping, { targetModel: dateModel, formats: { date: 'iso8601' } });
  assert.equal(dateIso.instance.createdAt, '2023-11-13');
});

test('applyTransform: catalog transforms', () => {
  assert.equal(applyTransform('  A B c ', { type: 'trim' }), 'A B c');
  assert.equal(applyTransform('a', { type: 'lowerCase' }), 'a');
  assert.equal(applyTransform('abc', { type: 'upperCase' }), 'ABC');
  assert.equal(applyTransform('x', { type: 'prefix', param: 'pi_' }), 'pi_x');
  assert.equal(applyTransform('y', { type: 'suffix', param: '_end' }), 'y_end');
  assert.equal(applyTransform('pre_fixme', { type: 'stripPrefix', param: 'pre_' }), 'fixme');
  assert.equal(applyTransform('a-b-a', { type: 'replace', param: { pattern: '-', replacement: '/' } }), 'a/b/a');
  assert.equal(applyTransform('hello world', { type: 'substring', param: { start: 6 } }), 'world');
  assert.equal(applyTransform(10, { type: 'multiply', param: 3 }), 30);
  assert.equal(applyTransform(7, { type: 'divide', param: 2 }), 3.5);
  assert.equal(applyTransform(-4.7, { type: 'abs' }), 4.7);
  assert.equal(applyTransform(3.14159, { type: 'roundTo', param: 2 }), 3.14);
  assert.equal(applyTransform('42', { type: 'toNumber' }), 42);
  assert.equal(applyTransform(1, { type: 'toString' }), '1');
  assert.equal(applyTransform('no', { type: 'toBoolean' }), false);
  assert.equal(applyTransform(null, { type: 'default', param: 'fallback' }), 'fallback');
  assert.equal(applyTransform('anything', { type: 'constant', param: 'fixed' }), 'fixed');
});

test('validateMappingDefinition: rejects missing from / duplicate fields', () => {
  assert.equal(validateMappingDefinition({ name: 'X', fields: ['id'] }).isValid, true);
  const dup = validateMappingDefinition({
    name: 'X',
    fields: ['id', { from: 'id' }],
  });
  assert.equal(dup.isValid, false);
  assert.ok(dup.errors.some(e => e.rule === 'duplicateField'));
  const missingFrom = validateMappingDefinition({ name: 'X', fields: [{ to: 'id' }] });
  assert.equal(missingFrom.isValid, false);
  assert.ok(missingFrom.errors.some(e => e.rule === 'required'));
  const noName = validateMappingDefinition({ fields: ['id'] });
  assert.equal(noName.isValid, false);
  assert.ok(noName.errors.some(e => e.field === 'name'));
});