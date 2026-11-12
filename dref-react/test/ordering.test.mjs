import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, addScope, addModel, toDocument } from '@dref/validator';
import { moveScope } from '../dist/ordering.js';

test('scope ordering preserves descriptions, models and original draft', () => {
  let draft = createDraft({ name: 'D' });
  draft = addScope(draft, { name: 'first', description: 'First scope' });
  draft = addScope(draft, { name: 'second' });
  draft = addScope(draft, { name: 'third', description: 'Third scope' });
  draft = addModel(draft, { name: 'Product', scope: 'first' });
  const result = moveScope(draft, 0, 2);
  assert.deepEqual(result.scopes.map((s) => s.name), ['second', 'third', 'first']);
  assert.equal(result.scopes[0].description, undefined);
  assert.equal(result.scopes[2].description, 'First scope');
  assert.deepEqual(result.models, draft.models);
  assert.equal(draft.scopes[0].name, 'first');
  assert.deepEqual(toDocument(moveScope(result, 2, 0)), toDocument(draft));
});
