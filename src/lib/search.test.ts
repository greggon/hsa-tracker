import { describe, expect, it } from 'vitest';
import { searchReceipts } from './search';

const rows = [
	{ provider: 'Riverside Dental', amountCents: 24000 },
	{ provider: null, amountCents: 1847 },
	{ provider: 'Northgate Pharmacy', amountCents: null }
];

describe('searchReceipts', () => {
	it('returns every row for a blank query', () => {
		expect(searchReceipts(rows, '  ')).toBe(rows);
	});

	it('matches the provider case-insensitively', () => {
		expect(searchReceipts(rows, 'DENTAL')).toEqual([rows[0]]);
	});

	it('matches the amount, ignoring dollar signs and commas', () => {
		expect(searchReceipts(rows, '$18.4')).toEqual([rows[1]]);
		expect(searchReceipts(rows, '240')).toEqual([rows[0]]);
	});

	it('does not match an unreadable amount', () => {
		expect(searchReceipts([rows[2]], '1')).toEqual([]);
	});
});
