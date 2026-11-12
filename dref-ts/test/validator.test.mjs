import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModel, validateDomain, validateProperty, validateInstance, validateInstanceOrThrow, validateWrite, validateWriteOrThrow, DrefValidationError, resolveModels, modelHasCountRange, classifyModel, propertyIsImmutable, modelIsImmutable, modelIsMutable } from '../dist/index.js';

test('validateProperty: string rules', () => {
  const prop = {
    name: 'email',
    type: 'String',
    required: true,
    rules: [
      { type: 'email' },
      { type: 'lowercase' },
      { type: 'trimmed' }
    ]
  };

  const valid = validateProperty('user@example.com', prop);
  assert.equal(valid.isValid, true);
  assert.equal(valid.errors.length, 0);

  const invalid = validateProperty('Bad Email ', prop);
  assert.equal(invalid.isValid, false);
  assert.ok(invalid.errors.length >= 2);
});

test('validateProperty: languageCode and text rules', () => {
  const langProp = {
    name: 'language',
    type: 'String',
    rules: [{ type: 'languageCode' }]
  };

  assert.equal(validateProperty('en', langProp).isValid, true, 'ISO 639-1 code passes');
  assert.equal(validateProperty('pt-BR', langProp).isValid, true, 'language + region passes');
  assert.equal(validateProperty('zh-Hant-TW', langProp).isValid, true, 'language + script + region passes');
  assert.equal(validateProperty('english', langProp).isValid, false, 'language name fails');
  assert.equal(validateProperty('e1', langProp).isValid, false, 'malformed tag fails');
  assert.equal(validateProperty(' ', langProp).isValid, false, 'whitespace-only fails');

  const textProp = {
    name: 'bio',
    type: 'String',
    rules: [{ type: 'text', param: 'en' }, { type: 'text' }]
  };
  const res = validateProperty('Any prose passes.', textProp);
  assert.equal(res.isValid, true, 'text is a marker: no value-level enforcement');
  assert.equal(res.errors.length, 0);
});

test('validateInstance: cross-field reference parameters', () => {
  const model = {
    name: 'Campaign',
    properties: [
      { name: 'id', type: 'String', required: true, key: true },
      { name: 'startDate', type: 'Number' },
      { name: 'endDate', type: 'Number', required: true, rules: [{ type: 'greaterThan', param: '$startDate' }] }
    ]
  };

  assert.equal(validateModel(model).isValid, true, JSON.stringify(validateModel(model).errors));

  assert.equal(validateInstance({ id: 'c_1', startDate: 10, endDate: 20 }, model).isValid, true);
  assert.equal(
    validateInstance({ id: 'c_1', endDate: 5 }, model).isValid, true,
    'an absent referenced value skips the reference rule'
  );

  const res = validateInstance({ id: 'c_1', startDate: 10, endDate: 5 }, model);
  assert.equal(res.isValid, false);
  assert.ok(res.errors.some(e => e.field === 'endDate' && e.rule === 'greaterThan'));

  // String-parameter rules can reference a String sibling too.
  const prefixModel = {
    name: 'Prefixed',
    properties: [
      { name: 'id', type: 'String', required: true, key: true },
      { name: 'prefix', type: 'String' },
      { name: 'code', type: 'String', rules: [{ type: 'startsWith', param: '$prefix' }] }
    ]
  };
  assert.equal(validateInstance({ id: 'p_1', prefix: 'usr_', code: 'usr_42' }, prefixModel).isValid, true);
  assert.equal(validateInstance({ id: 'p_1', prefix: 'usr_', code: 'sys_42' }, prefixModel).isValid, false);

  // validateWrite resolves references through the same instance path.
  assert.equal(validateWrite({ id: 'c_1', startDate: 10, endDate: 5 }, model, 'client').isValid, false);
});

test('validateModel: cross-field references are validated', () => {
  const base = { name: 'M' };
  const withModel = (props) => validateModel({
    ...base,
    properties: [{ name: 'id', type: 'String', key: true }, ...props]
  });

  const unknown = withModel([{ name: 'endDate', type: 'Number', rules: [{ type: 'greaterThan', param: '$startDate' }] }]);
  assert.equal(unknown.isValid, false);
  assert.ok(unknown.errors.some(e => e.rule === 'unknownFieldRef'), JSON.stringify(unknown.errors));

  const selfRef = withModel([{ name: 'endDate', type: 'Number', rules: [{ type: 'greaterThan', param: '$endDate' }] }]);
  assert.equal(selfRef.isValid, false);
  assert.ok(selfRef.errors.some(e => e.rule === 'selfFieldRef'));

  const typeMismatch = withModel([
    { name: 'name', type: 'String' },
    { name: 'code', type: 'String', rules: [{ type: 'minLength', param: '$name' }] }
  ]);
  assert.equal(typeMismatch.isValid, false);
  assert.ok(typeMismatch.errors.some(e => e.rule === 'fieldRefType'), JSON.stringify(typeMismatch.errors));

  const empty = withModel([{ name: 'code', type: 'String', rules: [{ type: 'minLength', param: '$' }] }]);
  assert.equal(empty.isValid, false);
  assert.ok(empty.errors.some(e => e.rule === 'fieldRef'));

  // A valid reference (Number sibling for a number-parameter rule) passes.
  const ok = withModel([
    { name: 'min', type: 'Number' },
    { name: 'code', type: 'String', rules: [{ type: 'minLength', param: '$min' }] }
  ]);
  assert.equal(ok.isValid, true, JSON.stringify(ok.errors));
});

test('validateProperty: unresolved field references are skipped outside instance context', () => {
  const prop = {
    name: 'endDate',
    type: 'Number',
    rules: [{ type: 'greaterThan', param: '$startDate' }]
  };
  assert.equal(validateProperty(5, prop).isValid, true,
    'standalone validateProperty has no sibling context and skips references');
});

test('validateProperty: numeric rules', () => {
  const prop = {
    name: 'score',
    type: 'Number',
    required: true,
    rules: [
      { type: 'positiveInteger' },
      { type: 'greaterThanOrEqual', param: 100 },
      { type: 'lessThanOrEqual', param: 1000 }
    ]
  };

  assert.equal(validateProperty(500, prop).isValid, true);
  assert.equal(validateProperty(50, prop).isValid, false);
  assert.equal(validateProperty(1500, prop).isValid, false);
  assert.equal(validateProperty(500.5, prop).isValid, false);
});

test('validateProperty: list rules', () => {
  const prop = {
    name: 'tags',
    type: 'String',
    list: true,
    rules: [
      { type: 'range', param: { min: 1, max: 3 } },
      { type: 'unique' }
    ]
  };

  assert.equal(validateProperty(['admin', 'dev'], prop).isValid, true);
  assert.equal(validateProperty([], prop).isValid, false);
  assert.equal(validateProperty(['a', 'b', 'c', 'd'], prop).isValid, false);
  assert.equal(validateProperty(['dup', 'dup'], prop).isValid, false);
});

test('validateModel: domain model governance', () => {
  const validModel = {
    name: 'UserProfile',
    authority: 'client',
    count: { min: 0, max: 1000 },
    properties: [
      { name: 'id', type: 'String', required: true, key: true }
    ]
  };
  assert.equal(validateModel(validModel).isValid, true);

  const invalidModel = {
    name: 'invalid_lowercase',
    count: { min: 10, max: 5 },
    properties: [
      { name: 'id', type: 'String' },
      { name: 'id', type: 'String' }
    ]
  };
  const res = validateModel(invalidModel);
  assert.equal(res.isValid, false);
  assert.ok(res.errors.some(e => e.rule === 'pattern'));
  assert.ok(res.errors.some(e => e.rule === 'range'));
  assert.ok(res.errors.some(e => e.rule === 'duplicateProperty'));
});

test('model classification is derived, not declared', () => {
  const mutableNoKey = {
    name: 'Anything',
    properties: [{ name: 'id', type: 'String' }]
  };
  assert.equal(classifyModel(mutableNoKey), 'entity');
  const res = validateModel(mutableNoKey);
  assert.equal(res.isValid, false, 'a model that is neither configuration nor value is an entity and needs a key');
  assert.ok(res.errors.some(e => e.rule === 'required' && e.field === 'key'));

  const entityWithKey = {
    name: 'Customer',
    properties: [{ name: 'id', type: 'String', key: true }]
  };
  assert.equal(classifyModel(entityWithKey), 'entity');
  assert.equal(validateModel(entityWithKey).isValid, true);

  const valueByImmutability = {
    name: 'Amount',
    properties: [
      { name: 'amount', type: 'Number', rules: [{ type: 'immutable' }] },
      { name: 'currency', type: 'String', rules: [{ type: 'immutable' }] }
    ]
  };
  assert.equal(classifyModel(valueByImmutability), 'value');
  assert.equal(validateModel(valueByImmutability).isValid, true, 'a value is identified entirely by its attributes');

  const valueWithKey = {
    name: 'OrderPlaced',
    properties: [
      { name: 'id', type: 'String', key: true, rules: [{ type: 'immutable' }] },
      { name: 'amount', type: 'Number', rules: [{ type: 'immutable' }] }
    ]
  };
  assert.equal(classifyModel(valueWithKey), 'value', 'events fold into values: key plus all-immutable');
  assert.equal(validateModel(valueWithKey).isValid, true);

  const configurationByCount = {
    name: 'GatewaySettings',
    count: { max: 1 },
    properties: [{ name: 'key', type: 'String' }]
  };
  assert.equal(classifyModel(configurationByCount), 'configuration');
  assert.equal(validateModel(configurationByCount).isValid, true, 'a declared count range makes a model a configuration');
});

test('validateModel: rule parameter shapes are validated eagerly', () => {
  const base = {
    name: 'M',
    properties: [{ name: 'id', type: 'String', required: true, key: true }]
  };

  const cases = [
    [{ type: 'minLength', param: '3' }, 'minLength requires an integer parameter'],
    [{ type: 'precision', param: 1.5 }, 'precision requires an integer parameter'],
    [{ type: 'pattern', param: '' }, 'pattern requires a non-empty string parameter'],
    [{ type: 'startsWith', param: 42 }, 'startsWith requires a non-empty string parameter'],
    [{ type: 'greaterThan', param: '10' }, 'greaterThan requires a number parameter'],
    [{ type: 'multipleOf', param: 'abc' }, 'multipleOf requires a number parameter'],
    [{ type: 'enum', param: 'active' }, 'enum requires a non-empty array of string values'],
    [{ type: 'range', param: [1, 10] }, 'range requires an object parameter'],
    [{ type: 'range', param: { min: '0' } }, 'range requires a numeric min'],
    [{ type: 'text', param: 'english' }, 'text parameter must be a BCP-47 language tag'],
    [{ type: 'text', param: 42 }, 'text parameter must be a string language tag'],
    [{ type: 'languageCode', param: 'en' }, 'languageCode does not accept a parameter'],
    [{ type: 'email', param: true }, 'email does not accept a parameter'],
    [{ type: 'immutable', param: 'x' }, 'immutable does not accept a parameter']
  ];
  for (const [rule, why] of cases) {
    const model = { ...base, properties: [...base.properties, { name: 'value', type: 'String', rules: [rule] }] };
    const res = validateModel(model);
    assert.equal(res.isValid, false, why);
    assert.ok(res.errors.some(e => e.field === 'value' && e.rule === 'param'), `${why}: ${JSON.stringify(res.errors)}`);
  }

  // Valid parameter shapes pass, including omitted optional bounds and the
  // optional BCP-47 parameter of the text marker.
  const ok = validateModel({
    ...base,
    properties: [
      ...base.properties,
      {
        name: 'value',
        type: 'String',
        rules: [
          { type: 'minLength', param: 3 },
          { type: 'range', param: { max: 10 } },
          { type: 'email' },
          { type: 'text' },
          { type: 'text', param: 'en' }
        ]
      }
    ]
  });
  assert.equal(ok.isValid, true, JSON.stringify(ok.errors));
});

test('validateDomain: field type rule parameter shapes are validated', () => {
  const domain = {
    name: 'Identity',
    defaults: {
      fields: {
        handle: {
          type: 'String',
          rules: [{ type: 'maxLength', param: '32' }]
        }
      }
    },
    models: [
      { name: 'User', properties: [{ name: 'id', type: 'String', key: true }, { name: 'username', type: 'handle' }] }
    ]
  };
  const res = validateDomain(domain);
  assert.equal(res.isValid, false);
  assert.ok(
    res.errors.some(e => e.field === 'defaults.fields.handle' && e.rule === 'param'),
    JSON.stringify(res.errors)
  );
});

test('validateModel: optional scope reference', () => {
  const scoped = {
    name: 'Customer',
    scope: 'catalog',
    properties: [{ name: 'id', type: 'String', key: true }]
  };
  assert.equal(validateModel(scoped).isValid, true);

  const noScope = {
    name: 'Standalone',
    properties: [{ name: 'id', type: 'String', key: true }]
  };
  assert.equal(validateModel(noScope).isValid, true);

  const invalid = {
    name: 'Customer',
    scope: 'Not_Kebab',
    properties: [{ name: 'id', type: 'String' }]
  };
  const res = validateModel(invalid);
  assert.equal(res.isValid, false);
  assert.ok(res.errors.some(e => e.field === 'scope' && e.rule === 'pattern'));
});

test('validateDomain: scopes and models are siblings with optional scope references', () => {
  const valid = {
    name: 'Commerce',
    defaults: { formats: { date: 'YYYY-MM-DD', dateTime: 'YYYY-MM-DDTHH:mm:ssZ' } },
    scopes: [
      { name: 'catalog', description: 'Products and pricing' },
      { name: 'orders' }
    ],
    models: [
      { name: 'Product', scope: 'catalog', authority: 'internal', properties: [{ name: 'id', type: 'String', required: true, key: true }] },
      { name: 'PaymentIntent', scope: 'orders', authority: 'external', properties: [{ name: 'id', type: 'String', key: true }] },
      { name: 'SystemConfig', count: { max: 1 }, properties: [{ name: 'key', type: 'String' }] }
    ]
  };
  assert.equal(validateDomain(valid).isValid, true);

  const badScopeRef = {
    name: 'Commerce',
    scopes: [{ name: 'catalog' }],
    models: [{ name: 'Product', scope: 'missing', properties: [{ name: 'id', type: 'String' }] }]
  };
  assert.ok(validateDomain(badScopeRef).errors.some(e => e.rule === 'unknownScope'));

  const dupScopes = {
    name: 'Commerce',
    scopes: [{ name: 'catalog' }, { name: 'catalog' }],
    models: []
  };
  assert.ok(validateDomain(dupScopes).errors.some(e => e.rule === 'duplicateScope'));

  const dupModels = {
    name: 'Commerce',
    scopes: [],
    models: [
      { name: 'Product', properties: [{ name: 'id', type: 'String' }] },
      { name: 'Product', properties: [{ name: 'id', type: 'String' }] }
    ]
  };
  assert.ok(validateDomain(dupModels).errors.some(e => e.rule === 'duplicateModel'));

  const badDefaults = { name: 'Commerce', defaults: { formats: { date: '  ' } }, models: [] };
  assert.ok(validateDomain(badDefaults).errors.some(e => e.field === 'defaults.formats.date'));

  assert.equal(validateDomain(null).isValid, false);
});

test('validateInstance: full record validation', () => {
  const model = {
    name: 'Order',
    authority: 'client',
    properties: [
      { name: 'orderId', type: 'String', required: true, key: true, rules: [{ type: 'startsWith', param: 'ord_' }] },
      { name: 'amount', type: 'Number', required: true, rules: [{ type: 'positive' }] },
      { name: 'status', type: 'String', required: true, rules: [{ type: 'enum', param: ['PENDING', 'PAID'] }] }
    ]
  };

  const validRecord = {
    orderId: 'ord_12345',
    amount: 99.95,
    status: 'PAID'
  };
  assert.equal(validateInstance(validRecord, model).isValid, true);

  const invalidRecord = {
    orderId: 'bad_id',
    amount: -10,
    status: 'UNKNOWN'
  };
  const res = validateInstance(invalidRecord, model);
  assert.equal(res.isValid, false);
  assert.equal(res.errors.length, 3);
});

test('validateProperty: boolean isTrue/isFalse rules', () => {
  const t = { name: 'active', type: 'Boolean', rules: [{ type: 'isTrue' }] };
  const f = { name: 'active', type: 'Boolean', rules: [{ type: 'isFalse' }] };
  assert.equal(validateProperty(true, t).isValid, true);
  assert.equal(validateProperty(false, t).isValid, false);
  assert.equal(validateProperty(true, f).isValid, false);
  assert.equal(validateProperty(false, f).isValid, true);
  assert.equal(validateProperty(null, t).isValid, true, 'null must be ignored like other rules');
});

test('validateWrite: per-property authority inherits the model authority', () => {
  const model = {
    name: 'User',
    authority: 'internal',
    properties: [
      { name: 'username', type: 'String', required: true },
      { name: 'flags', type: 'String', authority: 'client' }
    ]
  };

  const byClient = validateWrite({ username: 'acme', flags: 'beta' }, model, 'client');
  assert.equal(byClient.isValid, false);
  assert.ok(byClient.errors.some(e => e.rule === 'authority' && e.field === 'username'));
  assert.ok(!byClient.errors.some(e => e.rule === 'authority' && e.field === 'flags'));

  const byInternal = validateWrite({ username: 'acme', flags: 'beta' }, model, 'internal');
  assert.equal(byInternal.isValid, false);
  assert.ok(byInternal.errors.some(e => e.rule === 'authority' && e.field === 'flags'));
  assert.ok(!byInternal.errors.some(e => e.rule === 'authority' && e.field === 'username'));

  const untouched = validateWrite({ username: 'acme' }, model, 'internal');
  assert.equal(untouched.isValid, true, 'a restricted field the payload does not set is unrestricted');

  const agnostic = validateInstance({ username: 'acme', flags: 'beta' }, model);
  assert.equal(agnostic.isValid, true, 'validateInstance remains authority-agnostic');

  assert.throws(
    () => validateWriteOrThrow({ username: 'acme', flags: 'beta' }, model, 'client'),
    error => error instanceof DrefValidationError
  );

  const noAuth = { name: 'Doc', properties: [{ name: 'id', type: 'String', required: true }] };
  assert.equal(validateWrite({ id: 'a' }, noAuth, 'client').isValid, false, 'a missing model authority defaults to internal');
  assert.equal(validateWrite({ id: 'a' }, noAuth, 'internal').isValid, true);
});

test('mutability is derived from per-property immutable rule', () => {
  const mutableModel = {
    name: 'MutableDoc',
    properties: [
      { name: 'name', type: 'String', rules: [{ type: 'immutable' }] },
      { name: 'count', type: 'Number' }
    ]
  };
  assert.equal(propertyIsImmutable(mutableModel.properties[0]), true);
  assert.equal(modelIsImmutable(mutableModel), false);
  assert.equal(modelIsMutable(mutableModel), true);

  const immutableModel = {
    name: 'ImmutableDoc',
    properties: [
      { name: 'name', type: 'String', rules: [{ type: 'immutable' }] },
      { name: 'count', type: 'Number', rules: [{ type: 'immutable' }] }
    ]
  };
  assert.equal(modelIsImmutable(immutableModel), true);
  assert.equal(modelIsMutable(immutableModel), false);
});

test('model count range is a single optional range', () => {
  const bounded = {
    name: 'Service',
    count: { min: 1, max: 10 },
    properties: [{ name: 'name', type: 'String' }]
  };
  assert.equal(modelHasCountRange(bounded), true);
  assert.equal(validateModel(bounded).isValid, true);

  const unbounded = {
    name: 'Anything',
    properties: [{ name: 'name', type: 'String' }]
  };
  assert.equal(modelHasCountRange(unbounded), false);

  const invalid = {
    name: 'Service',
    count: { min: 10, max: 1 },
    properties: [{ name: 'name', type: 'String' }]
  };
  const res = validateModel(invalid);
  assert.equal(res.isValid, false);
  assert.ok(res.errors.some(e => e.rule === 'range'));
});

test("severity 'warn' reports warnings and never fails validation", () => {
  const prop = {
    name: 'email',
    type: 'String',
    required: true,
    rules: [{ type: 'email', severity: 'warn' }]
  };

  const res = validateProperty('not-an-email', prop);
  assert.equal(res.isValid, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.warnings.length, 1);
  assert.equal(res.warnings[0].rule, 'email');
  assert.equal(res.warnings[0].field, 'email');

  const ok = validateProperty('good@example.com', prop);
  assert.equal(ok.isValid, true);
  assert.equal(ok.warnings.length, 0);
});

test("mixed blocking and 'warn' rules", () => {
  const prop = {
    name: 'username',
    type: 'String',
    rules: [
      { type: 'minLength', param: 3 },
      { type: 'startsWith', param: 'usr_', severity: 'warn' }
    ]
  };

  const both = validateProperty('ab', prop);
  assert.equal(both.isValid, false);
  assert.equal(both.errors.length, 1);
  assert.equal(both.errors[0].rule, 'minLength');
  assert.equal(both.warnings.length, 1);
  assert.equal(both.warnings[0].rule, 'startsWith');

  const warned = validateProperty('abcdef', prop);
  assert.equal(warned.isValid, true);
  assert.equal(warned.errors.length, 0);
  assert.equal(warned.warnings.length, 1);
});

test("'warn' severity on a list-level rule", () => {
  const prop = {
    name: 'tags',
    type: 'String',
    list: true,
    rules: [{ type: 'unique', severity: 'warn' }]
  };

  const res = validateProperty(['a', 'a'], prop);
  assert.equal(res.isValid, true);
  assert.equal(res.warnings.length, 1);
  assert.equal(res.warnings[0].rule, 'unique');
});

test('validateInstanceOrThrow throws DrefValidationError with result', () => {
  const model = {
    name: 'Customer',
    properties: [
      { name: 'email', type: 'String', rules: [{ type: 'email' }] }
    ]
  };

  assert.throws(
    () => validateInstanceOrThrow({ email: 'nope' }, model),
    error => {
      assert.ok(error instanceof DrefValidationError);
      assert.equal(error.result.isValid, false);
      assert.equal(error.result.errors[0].field, 'email');
      return true;
    }
  );

  validateInstanceOrThrow({ email: 'ok@example.com' }, model);
});

test("'warn' failures do not throw and fall through to onInvalid only on errors", () => {
  const model = {
    name: 'Customer',
    properties: [
      {
        name: 'email',
        type: 'String',
        required: true,
        rules: [{ type: 'email', severity: 'warn' }]
      }
    ]
  };

  validateInstanceOrThrow({ email: 'nope' }, model);

  let calls = 0;
  const res = validateInstance({ email: 'nope' }, model, () => { calls++; });
  assert.equal(res.isValid, true);
  assert.equal(res.warnings.length, 1);
  assert.equal(calls, 0, 'onInvalid must not fire for warning-only results');

  const hard = { ...model, properties: [{ name: 'email', type: 'String', required: true, rules: [{ type: 'email' }] }] };
  validateInstance({ email: 'nope' }, hard, () => { calls++; });
  assert.equal(calls, 1, 'onInvalid fires once for a failing instance');
});

test('validateDomain: undeclared field type references are reported', () => {
  const domain = {
    name: 'Shop',
    models: [
      {
        name: 'Order',
        properties: [
          { name: 'id', type: 'String', key: true },
          { name: 'status', type: 'orderStatus' }
        ]
      }
    ]
  };

  const result = validateDomain(domain);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.rule === 'unknownFieldType' && e.field === 'Order.status'), JSON.stringify(result.errors));
});

test('validateDomain: field type declaration problems are reported', () => {
  const cyclic = {
    name: 'Shop',
    defaults: {
      fields: {
        a: { type: 'b' },
        b: { type: 'a' }
      }
    },
    models: []
  };
  const cycleResult = validateDomain(cyclic);
  assert.equal(cycleResult.isValid, false);
  assert.ok(cycleResult.errors.some(e => e.rule === 'fieldTypeCycle'), JSON.stringify(cycleResult.errors));

  const shadow = {
    name: 'Shop',
    defaults: { fields: { String: { type: 'Number' } } },
    models: []
  };
  const shadowResult = validateDomain(shadow);
  assert.equal(shadowResult.isValid, false);
  assert.ok(shadowResult.errors.some(e => e.rule === 'shadowBuiltin'), JSON.stringify(shadowResult.errors));

  const dangling = {
    name: 'Shop',
    defaults: { fields: { a: { type: 'notDeclared' } } },
    models: []
  };
  const danglingResult = validateDomain(dangling);
  assert.equal(danglingResult.isValid, false);
  assert.ok(danglingResult.errors.some(e => e.rule === 'unknownFieldType'), JSON.stringify(danglingResult.errors));
});

test('resolveModels: expands field types into builtin-backed properties', () => {
  const domain = {
    name: 'Shop',
    defaults: {
      fields: {
        emailAddress: {
          type: 'String',
          rules: [{ type: 'email' }, { type: 'trimmed' }]
        },
        userHandle: { type: 'emailAddress' },
        roles: {
          type: 'String',
          list: true,
          rules: [{ type: 'maxLength', param: 24 }]
        }
      }
    },
    models: [
      {
        name: 'Customer',
        properties: [
          { name: 'email', type: 'emailAddress', required: true, rules: [{ type: 'lowercase' }] },
          { name: 'handle', type: 'userHandle' },
          { name: 'roleTags', type: 'roles' },
          { name: 'id', type: 'String', key: true }
        ]
      }
    ]
  };

  assert.equal(validateDomain(domain).isValid, true);

  const [resolved] = resolveModels(domain);
  const email = resolved.properties[0];
  assert.equal(email.type, 'String');
  assert.deepEqual(
    email.rules.map(c => c.type),
    ['email', 'trimmed', 'lowercase']
  );
  assert.equal(resolved.properties[1].type, 'String');
  assert.deepEqual(
    resolved.properties[1].rules.map(c => c.type),
    ['email', 'trimmed']
  );
  assert.equal(resolved.properties[2].list, true);

  const validated = validateInstance(
    { id: 'c1', email: 'a@b.com', handle: 'a@b.com', roleTags: ['admin'] },
    resolved
  );
  assert.equal(validated.isValid, true, JSON.stringify(validated.errors));
});

test('resolveModels: undeclared field type reference throws', () => {
  const domain = {
    name: 'Shop',
    models: [
      {
        name: 'Order',
        properties: [
          { name: 'id', type: 'String', key: true },
          { name: 'status', type: 'orderStatus' }
        ]
      }
    ]
  };
  assert.throws(() => resolveModels(domain), /Unknown field type: 'orderStatus'/);
});

test('validateDomain: model references (#Model) are recognised and validated', () => {
  const domain = {
    name: 'Shop',
    models: [
      {
        name: 'Category',
        properties: [
          { name: 'id', type: 'String', key: true },
          { name: 'name', type: 'String' }
        ]
      },
      {
        name: 'Product',
        properties: [
          { name: 'id', type: 'String', key: true },
          { name: 'categoryId', type: '#Category' }
        ]
      }
    ]
  };

  // A forward/backward reference to a declared model is valid and is NOT
  // mistaken for an unknown field type.
  const ok = validateDomain(domain);
  assert.equal(ok.isValid, true, JSON.stringify(ok.errors));

  // A reference to a model that is not declared in the domain is rejected.
  const dangling = {
    name: 'Shop',
    models: [
      {
        name: 'Product',
        properties: [
          { name: 'id', type: 'String', key: true },
          { name: 'supplierId', type: '#Supplier' }
        ]
      }
    ]
  };
  const bad = validateDomain(dangling);
  assert.equal(bad.isValid, false);
  assert.ok(bad.errors.some(e => e.rule === 'unknownModelReference' && e.field === 'Product.supplierId'), JSON.stringify(bad.errors));
  assert.ok(!bad.errors.some(e => e.rule === 'unknownFieldType'), 'a #reference must not be reported as an unknown field type');
});

test('resolveModels: a model reference resolves to the target key field type', () => {
  const domain = {
    name: 'Shop',
    models: [
      {
        name: 'Category',
        properties: [
          { name: 'id', type: 'Number', key: true },
          { name: 'name', type: 'String' }
        ]
      },
      {
        name: 'Product',
        properties: [
          { name: 'id', type: 'String', key: true },
          { name: 'categoryId', type: '#Category', required: true }
        ]
      }
    ]
  };

  assert.equal(validateDomain(domain).isValid, true);

  const [category, product] = resolveModels(domain);
  assert.equal(category.properties[0].type, 'Number');
  // The reference is validated as the referenced key's scalar type.
  assert.equal(product.properties[1].type, 'Number');
  assert.equal(product.properties[1].required, true);

  const ok = validateInstance({ id: 'p1', categoryId: 7 }, product);
  assert.equal(ok.isValid, true, JSON.stringify(ok.errors));

  const wrong = validateInstance({ id: 'p1', categoryId: 'not-a-number' }, product);
  assert.equal(wrong.isValid, false);
});

test('Integer is a whole number, and Number rules still apply to it', () => {
  const count = { name: 'stock', type: 'Integer' };

  // Whole, however it is written and however wide.
  assert.equal(validateProperty(0, count).isValid, true);
  assert.equal(validateProperty(-3, count).isValid, true);
  assert.equal(validateProperty(1.0, count).isValid, true);
  assert.equal(validateProperty(1e3, count).isValid, true);
  assert.equal(validateProperty(2147483648, count).isValid, true);
  assert.equal(validateProperty(9007199254740992, count).isValid, true);

  // Not whole, or not a number at all. Nothing is coerced.
  assert.equal(validateProperty(5.5, count).isValid, false);
  assert.equal(validateProperty(5.5, count).errors[0].rule, 'type');
  assert.equal(validateProperty('5', count).isValid, false);
  assert.equal(validateProperty('5', count).errors[0].rule, 'type');
  assert.equal(validateProperty(true, count).isValid, false);

  // The widening: an Integer field still answers to the Number magnitude rules.
  const bounded = { name: 'port', type: 'Integer', rules: [{ type: 'lessThan', param: 65536 }] };
  assert.equal(validateProperty(8080, bounded).isValid, true);
  const tooBig = validateProperty(70000, bounded);
  assert.equal(tooBig.isValid, false);
  assert.equal(tooBig.errors[0].rule, 'lessThan');

  const positive = { name: 'n', type: 'Integer', rules: [{ type: 'positive' }] };
  assert.equal(validateProperty(1, positive).isValid, true);
  assert.equal(validateProperty(-1, positive).isValid, false);
});

test('the integer rule is gone: a whole number is a type, not a rule', () => {
  // DRef does not reject an unrecognised rule name -- an unknown rule is simply
  // inert -- so the honest statement is that `integer` can no longer *do*
  // anything: it cannot make a fractional Number whole. Asserting an
  // unknownRule finding would be asserting a check DRef does not have.
  const fractional = { name: 'ratio', type: 'Number', rules: [{ type: 'integer' }] };
  assert.equal(validateProperty(5.5, fractional).isValid, true);

  // The type is what rejects it, and it rejects on the fractional part.
  const whole = { name: 'stock', type: 'Integer', rules: [{ type: 'integer' }] };
  assert.equal(validateProperty(5, whole).isValid, true);
  assert.equal(validateProperty(5.5, whole).isValid, false);
});

test('validateProperty: scalar type membership is enforced', () => {
  const numeric = { name: 'amount', type: 'Number' };
  assert.equal(validateProperty('12.5', numeric).isValid, false);
  assert.equal(validateProperty('12.5', numeric).errors[0].rule, 'type');
  assert.equal(validateProperty(12.5, numeric).isValid, true);

  const text = { name: 'label', type: 'String' };
  assert.equal(validateProperty(42, text).isValid, false);
  assert.equal(validateProperty(42, text).errors[0].rule, 'type');
  assert.equal(validateProperty('x', text).isValid, true);

  const flag = { name: 'active', type: 'Boolean' };
  assert.equal(validateProperty('yes', flag).isValid, false);
  assert.equal(validateProperty(true, flag).isValid, true);

  const created = { name: 'created', type: 'DateTime' };
  assert.equal(validateProperty(1699899982, created).isValid, false);
  assert.equal(validateProperty('2026-09-08T10:00:00Z', created).isValid, true);
  assert.equal(validateProperty(new Date('2026-09-08T10:00:00Z'), created).isValid, true);
});

test('validateProperty: epoch domain formats accept whole numbers', () => {
  const created = { name: 'created', type: 'DateTime' };
  const epoch = { date: 'iso8601', time: 'iso8601', dateTime: 'epoch' };
  assert.equal(validateProperty(1699899982, created, epoch).isValid, true, 'whole-number epoch value passes');
  assert.equal(validateProperty('2026-09-08T10:00:00Z', created, epoch).isValid, false, 'string is rejected under epoch');
  const frac = validateProperty(1699899982.5, created, epoch);
  assert.equal(frac.isValid, false);
  assert.equal(frac.errors[0].rule, 'format', 'fractional epoch is a format error');

  const iso = { date: 'iso8601', time: 'iso8601', dateTime: 'iso8601' };
  assert.equal(validateProperty('2026-09-08T10:00:00Z', created, iso).isValid, true, 'ISO string passes under iso8601');
  assert.equal(validateProperty(1699899982, created, iso).isValid, false, 'number is rejected under a string format');
  assert.equal(validateProperty(1699899982, created).isValid, false, 'without formats the scalar rule applies');
});

test('validateInstance/Write: epoch domain formats accept whole numbers', () => {
  const model = {
    name: 'M',
    properties: [
      { name: 'readingAt', type: 'DateTime', required: true },
      { name: 'sampleAt', type: 'Date', list: true }
    ]
  };
  const formats = { date: 'epochMillis', time: 'iso8601', dateTime: 'epochMillis' };
  assert.equal(
    validateInstance({ readingAt: 1699899982000, sampleAt: [1699800000000, 1699899982000] }, model, undefined, formats).isValid,
    true
  );
  assert.equal(validateWrite({ readingAt: 1699899982000 }, model, 'internal', undefined, formats).isValid, true);

  const frac = validateInstance({ readingAt: 1699899982.5 }, model, undefined, formats);
  assert.ok(frac.errors.some(e => e.field === 'readingAt' && e.rule === 'format'), JSON.stringify(frac.errors));
  const stringy = validateInstance({ readingAt: '2026-09-08T10:00:00Z' }, model, undefined, formats);
  assert.ok(stringy.errors.some(e => e.field === 'readingAt' && e.rule === 'format'), JSON.stringify(stringy.errors));

  assert.equal(validateInstance({ readingAt: 1699899982000 }, model, undefined, formats).isValid, true, 'missing non-required list is fine');
});

test('validateProperty: list elements are type checked per element', () => {
  const prop = { name: 'nums', type: 'Number', list: true };
  assert.equal(validateProperty([1, 2, 3], prop).isValid, true);
  const bad = validateProperty([1, 'two', 3], prop);
  assert.equal(bad.isValid, false);
  assert.ok(bad.errors.some(e => e.field === 'nums[1]' && e.rule === 'type'), JSON.stringify(bad.errors));
});

test('validateInstance: wrong scalar types are rejected', () => {
  const model = {
    name: 'M',
    properties: [
      { name: 'amount', type: 'Number', required: true },
      { name: 'label', type: 'String', required: true },
      { name: 'active', type: 'Boolean', required: true },
      { name: 'created', type: 'Date', required: true }
    ]
  };
  const res = validateInstance({ amount: '12.5', label: 42, active: 'yes', created: 1699899982 }, model);
  assert.equal(res.isValid, false);
  assert.equal(res.errors.filter(e => e.rule === 'type').length, 4);

  const ok = validateInstance(
    { amount: 12.5, label: 'x', active: true, created: '2026-09-08' },
    model
  );
  assert.equal(ok.isValid, true, JSON.stringify(ok.errors));
});

test('validateProperty: date rules (dateFormat, isoDate, epoch, after, before)', () => {
  const pDate = { name: 'dob', type: 'String', rules: [{ type: 'isoDate' }] };
  assert.equal(validateProperty('2024-05-15', pDate).isValid, true);
  assert.equal(validateProperty('15/05/2024', pDate).isValid, false);

  const pFormat = { name: 'ts', type: 'String', rules: [{ type: 'dateFormat', param: 'YYYY-MM-DD' }] };
  assert.equal(validateProperty('2024-05-15', pFormat).isValid, true);
  assert.equal(validateProperty('2024/05/15', pFormat).isValid, false);

  const pEpoch = { name: 'sec', type: 'Number', rules: [{ type: 'epoch' }] };
  assert.equal(validateProperty(1700000000, pEpoch).isValid, true);
  assert.equal(validateProperty(-5, pEpoch).isValid, false);

  const pAfter = { name: 'future', type: 'String', rules: [{ type: 'after', param: '2024-01-01' }] };
  assert.equal(validateProperty('2024-05-01', pAfter).isValid, true);
  assert.equal(validateProperty('2023-12-31', pAfter).isValid, false);
});

test('composer and validator: models with rules: property validate correctly', () => {
  const model = {
    name: 'User',
    properties: [
      { name: 'email', type: 'String', rules: [{ type: 'email' }] }
    ]
  };
  const valid = validateInstance({ email: 'alice@example.com' }, model);
  assert.equal(valid.isValid, true);

  const invalid = validateInstance({ email: 'not-an-email' }, model);
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.errors[0].rule, 'email');});
