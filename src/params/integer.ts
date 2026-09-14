import type { ParamMatcher } from '@sveltejs/kit';

/**
 * Route ids are database primary keys. Matching here means a junk id is a
 * routing miss rather than something every load and action has to re-check —
 * and `Number()` is loose enough ('1e3', ' 12 ', '0x1f') that hand-parsing it
 * in each handler was three chances to disagree.
 */
export const match = ((param: string) => /^[1-9]\d*$/.test(param)) satisfies ParamMatcher;
