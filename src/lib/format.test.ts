import { describe, expect, it } from 'vitest';
import { money, pretty, prettyShort, splitMoney } from './format';

describe('money', () => {
	it('formats cents as dollars', () => {
		expect(money(123456)).toBe('$1,234.56');
		expect(money(0)).toBe('$0.00');
	});

	it('shows an em dash when the amount could not be read', () => {
		expect(money(null)).toBe('—');
	});
});

describe('splitMoney', () => {
	it('separates the cents so the hero can set them smaller', () => {
		expect(splitMoney(123456)).toEqual({ whole: '$1,234', frac: '.56' });
	});

	it('recombines into exactly what money() produced', () => {
		for (const cents of [0, 5, 999, 100000, 1833646]) {
			const { whole, frac } = splitMoney(cents);
			expect(whole + frac).toBe(money(cents));
		}
	});
});

describe('date formatting', () => {
	/**
	 * The regression this guards: `new Date('2026-01-01')` is UTC midnight, which
	 * is the previous day everywhere west of Greenwich. A service date is a plain
	 * calendar date and must render as itself.
	 */
	it('renders the stored day, not the day before it', () => {
		expect(pretty('2026-01-01')).toBe('Jan 1, 2026');
		expect(pretty('2026-12-31')).toBe('Dec 31, 2026');
	});

	it('drops the year where it would be noise', () => {
		expect(prettyShort('2026-03-09')).toBe('Mar 9');
	});
});
