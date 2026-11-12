import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DomainComposer } from '../dist/index.js';

const doc = {
  name: 'Inventory',
  scopes: [{ name: 'core' }],
  models: [
    {
      name: 'Item',
      scope: 'core',
      authority: 'internal',
      properties: [
        { name: 'id', type: 'String', required: true, key: true },
        { name: 'sku', type: 'String' },
      ],
      mapsFrom: [
        { name: 'LegacyItem', provider: 'ERP', fields: [{ from: 'old_id', to: 'id', transform: [{ type: 'trim' }] }] },
      ],
    },
  ],
};

test('react: model panel splits into Fields and Mappings sub-views', () => {
  const html = renderToString(React.createElement(DomainComposer, { initial: doc }));
  // Sub-navigation with both tabs; Fields selected by default.
  assert.match(html, /aria-selected="true"[^>]*>Fields/);
  assert.match(html, /aria-selected="false"[^>]*>Mappings/);
  // The fields sub-view is visible, the mappings sub-view is mounted but hidden.
  assert.match(html, /class="dc-subview" role="tabpanel"[^>]*hidden=""/);
  assert.match(html, /value="LegacyItem"/);
  assert.match(html, /value="old_id"/);
  // No mappings stacked under the fields table: exactly one subnav per model.
  assert.equal(html.match(/class="dc-subnav"/g)?.length, 1);
});

test('react: mapping fields use a labeled Source/Target table, not arrows', () => {
  const html = renderToString(React.createElement(DomainComposer, { initial: doc }));
  assert.match(html, /dc-table-map/);
  assert.match(html, /<th class="dc-col-source">Source</);
  assert.match(html, /<th class="dc-col-target">Target</);
  assert.doesNotMatch(html, /dc-map-arrow/);
  assert.doesNotMatch(html, /→/);
});

test('react: rows are reordered with drag handles, not up/down buttons', () => {
  const html = renderToString(React.createElement(DomainComposer, { initial: doc }));
  assert.match(html, /class="dc-grip"[^>]*aria-label="Reorder row/);
  assert.match(html, /draggable="true"/);
  assert.doesNotMatch(html, /Move up/);
  assert.doesNotMatch(html, /Move down/);
});

test('react: read-only model renders fields and mappings as one printable document', () => {
  const html = renderToString(React.createElement(DomainComposer, { initial: doc, editable: false }));
  assert.doesNotMatch(html, /class="dc-subnav"/);
  assert.doesNotMatch(html, /<input/i);
  assert.match(html, /sku/); // fields section
  assert.match(html, /old_id/); // mappings section
  assert.match(html, /<th class="dc-col-source">Source</); // mapping table keeps labeled columns
});

test('react: mappings mode hides field editing and exposes only the Mappings view', () => {
  const html = renderToString(React.createElement(DomainComposer, { initial: doc, mode: 'mappings' }));
  // Mapping editing is present…
  assert.match(html, /value="LegacyItem"/);
  assert.match(html, /value="old_id"/);
  // …but no model settings, no properties table, no sub-navigation.
  assert.doesNotMatch(html, /Model name/);
  assert.doesNotMatch(html, />Required</);
  assert.doesNotMatch(html, /class="dc-subnav"/);
  assert.doesNotMatch(html, /Domain settings/);
  assert.doesNotMatch(html, /Delete model/);
  // The model is still selectable in the sidebar, with its mapping count.
  assert.match(html, /class="dc-nav dc-nav-model"/);
  assert.match(html, /class="dc-panel-meta"/);
});

test('react: mappings mode still flags mapping issues', () => {
  const bad = {
    name: 'D',
    models: [{ name: 'Thing', properties: [{ name: 'id', type: 'String', key: true }], mapsFrom: [{ name: '', fields: [] }] }],
  };
  const html = renderToString(React.createElement(DomainComposer, { initial: bad, mode: 'mappings' }));
  assert.match(html, /Not valid/);
  assert.match(html, /Mapping definition requires a name/);
  assert.match(html, /class="dc-count-err"/);
});

test('react: read-only mappings mode prints the mapping table without inputs', () => {
  const html = renderToString(React.createElement(DomainComposer, { initial: doc, mode: 'mappings', editable: false }));
  assert.doesNotMatch(html, /<input/i);
  assert.match(html, /old_id/);
  assert.match(html, /<th class="dc-col-source">Source</);
  assert.match(html, /Read-only view/);
});

test('react: empty mappings state teaches and offers the primary action', () => {
  const empty = { name: 'D', models: [{ name: 'M', properties: [{ name: 'id', type: 'String', key: true }], mapsFrom: [] }] };
  const html = renderToString(React.createElement(DomainComposer, { initial: empty, mode: 'mappings' }));
  assert.match(html, /class="dc-empty dc-empty-rich"/);
  assert.match(html, /No mappings yet/);
  assert.match(html, /Add mapping/);
});
