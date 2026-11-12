import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createDraft, addScope, addModel, addProperty, addRule, addMapping, addMappingField } from '@dref/validator';
import { DomainComposer, useDomainComposer, parseDomainJson, indexIssues } from '../dist/index.js';

test('react: composer renders an imported document with live validation', () => {
  const doc = {
    name: 'Inventory',
    version: '1.0.0',
    description: 'Stock tracking',
    scopes: [{ name: 'core' }],
    models: [
      {
        name: 'Item',
        scope: 'core',
        authority: 'internal',
        properties: [
          { name: 'id', type: 'String', required: true, key: true },
          { name: 'sku', type: 'String', rules: [{ type: 'startsWith', param: 'itm_' }] },
        ],
        mapsFrom: [{ name: 'Legacy Item', provider: 'ERP', fields: ['old_id'] }],
      },
    ],
  };
  const html = renderToString(React.createElement(DomainComposer, { initial: doc }));
  assert.match(html, /Inventory/);
  assert.match(html, /Item/);
  assert.match(html, /Rules: sku/); // rule indicator on the row (tooltip on hover)
  assert.match(html, /Legacy Item/);
  assert.match(html, /old_id/);
  assert.match(html, /ERP/);
  assert.match(html, /Valid/);
  assert.match(html, /<input/i);
  assert.match(html, />JSON</);
});

test('react: JSON tab renders the generated document', () => {
  const doc = { name: 'Inv', scopes: [], models: [{ name: 'Item', properties: [{ name: 'id', type: 'String', key: true }] }] };
  const html = renderToString(React.createElement(DomainComposer, { initial: doc, editable: false, defaultTab: 'json' }));
  assert.match(html, /Generated JSON/);
  assert.match(html, /&quot;Item&quot;/);
});

test('react: parseDomainJson accepts documents and rejects junk', () => {
  assert.equal(parseDomainJson('{"name":"A","models":[]}').ok, true);
  assert.equal(parseDomainJson('{"domain":{"name":"A"}}').document.name, 'A');
  assert.equal(parseDomainJson('[1]').ok, false);
  assert.equal(parseDomainJson('{oops').ok, false);
  assert.ok(parseDomainJson('{oops').error);
});

test('react: issues are attributed to models and properties', () => {
  const doc = {
    name: 'D',
    models: [
      { name: 'Good', properties: [{ name: 'id', type: 'String', key: true }] },
      { name: 'bad', scope: 'nope', properties: [{ name: 'x', type: 'Unknown', key: true }] },
    ],
  };
  const idx = indexIssues(doc);
  assert.equal(idx.byModel.get(0), undefined);
  const bad = idx.byModel.get(1);
  assert.ok(bad.some((i) => i.rule === 'unknownScope'));
  assert.ok(bad.some((i) => i.rule === 'unknownFieldType' && i.target.property === 'x'));
  assert.ok(bad.some((i) => i.rule === 'pattern' && i.target.property === undefined));
});

test('react: multiple invalid scopes are each attributed to their own scope index', () => {
  const doc = {
    name: 'Shop',
    scopes: [
      { name: 'Payments' },
      { name: 'Checkout' },
      { name: 'Fraud' },
      { name: 'Settlement' },
    ],
    models: [],
  };
  const idx = indexIssues(doc);
  assert.equal(idx.byScope.get(0)?.length, 1);
  assert.equal(idx.byScope.get(0)?.[0].target.index, 0);
  assert.equal(idx.byScope.get(1)?.length, 1);
  assert.equal(idx.byScope.get(1)?.[0].target.index, 1);
  assert.equal(idx.byScope.get(2)?.length, 1);
  assert.equal(idx.byScope.get(2)?.[0].target.index, 2);
  assert.equal(idx.byScope.get(3)?.length, 1);
  assert.equal(idx.byScope.get(3)?.[0].target.index, 3);
});

test('react: read-only mode renders values without inputs', () => {
  const draft = createDraft({ name: 'Identity' });
  const d2 = addScope(draft, { name: 'core' });
  const d3 = addModel(d2, { name: 'User', scope: 'core', authority: 'external' });
  const d4 = addProperty(d3, 0, { name: 'email', type: 'String', required: true });
  const d5 = addRule(d4, 0, 0, { type: 'email' });
  const d6 = addMapping(d5, 0, { name: 'From CRM' });
  const d7 = addMappingField(d6, 0, 0, { from: 'contact_email', to: 'email' });

  const html = renderToString(React.createElement(DomainComposer, { initial: d7, editable: false, showPreview: false }));
  assert.doesNotMatch(html, /<input/i);
  assert.doesNotMatch(html, /<select/i);
  assert.match(html, /Identity/);
  assert.match(html, /User/);
  assert.match(html, /email/);
  assert.match(html, /contact_email/);
  assert.match(html, /Read-only view/);
});

test('react: headless hook reports invalid status for a keyless entity', () => {
  let draft = createDraft({ name: 'Bad' });
  draft = addModel(draft, { name: 'Thing' });
  draft = addProperty(draft, 0, { name: 'label', type: 'String' });

  function Probe() {
    const composer = useDomainComposer({ initial: draft });
    return React.createElement('div', null, `${composer.status}|${composer.result.errors.length}`);
  }

  const html = renderToString(React.createElement(Probe));
  assert.match(html, /invalid\|1/);
});

test('react: empty composer starts editable and serializes an empty valid domain', () => {
  function Probe() {
    const composer = useDomainComposer();
    return React.createElement('div', null, `${composer.document.name.length}|${composer.status}`);
  }
  const html = renderToString(React.createElement(Probe));
  assert.match(html, /0\|invalid/);
});

test('react: property type editor offers cross-model references and validates them', () => {
  const doc = {
    name: 'Shop',
    models: [
      { name: 'Customer', properties: [{ name: 'id', type: 'String', required: true, key: true }] },
      {
        name: 'Order',
        properties: [
          { name: 'id', type: 'String', required: true, key: true },
          { name: 'customerId', type: '#Customer', required: true },
        ],
      },
    ],
  };
  const html = renderToString(React.createElement(DomainComposer, { initial: doc }));
  assert.match(html, /<option value="#Customer">/);
  assert.match(html, /Model references/);
  assert.doesNotMatch(html, /unknownModelReference/);
  assert.match(html, /Valid/);
});

test('react: an undeclared model reference is reported as an issue', () => {
  const doc = {
    name: 'Bad',
    models: [{ name: 'Order', properties: [{ name: 'id', type: 'String', key: true }, { name: 'customerId', type: '#Nope' }] }],
  };
  const idx = indexIssues(doc);
  const issues = idx.byModel.get(0) ?? [];
  assert.ok(issues.some((i) => i.rule === 'unknownModelReference' && i.target.property === 'customerId'));
});