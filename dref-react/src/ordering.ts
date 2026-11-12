import { updateScope } from '@dref/validator';
import type { DomainDraft } from '@dref/validator';

/** Reorder scopes through composer updates; model membership is name-based. */
export function moveScope(draft: DomainDraft, from: number, to: number): DomainDraft {
  if (from === to || from < 0 || to < 0 || from >= draft.scopes.length || to >= draft.scopes.length) return draft;
  const scopes = draft.scopes.slice();
  scopes.splice(to, 0, ...scopes.splice(from, 1));
  let next = draft;
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
    next = updateScope(next, i, { ...scopes[i], description: scopes[i].description });
  }
  return next;
}

/** Keep the selected / expanded item attached to its content after a move. */
export function movedIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (to < from && index >= to && index < from) return index + 1;
  return index;
}
