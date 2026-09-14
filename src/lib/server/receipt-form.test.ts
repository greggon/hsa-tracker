import { describe, expect, it } from 'vitest';
import { parseReceiptForm } from './receipt-form';

function form(fields: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

describe('parseReceiptForm', () => {
	it('accepts a complete receipt', () => {
		const result = parseReceiptForm(
			form({ serviceDate: '2026-03-09', amount: '$42.50', provider: 'Walgreens' })
		);
		expect(result).toEqual({
			ok: true,
			fields: { serviceDate: '2026-03-09', amountCents: 4250, provider: 'Walgreens' }
		});
	});

	it('allows a blank amount, so an unreadable receipt can still be filed', () => {
		const result = parseReceiptForm(form({ serviceDate: '2026-03-09', amount: '' }));
		expect(result.ok && result.fields.amountCents).toBeNull();
	});

	it('stores a blank provider as null rather than an empty string', () => {
		const result = parseReceiptForm(form({ serviceDate: '2026-03-09', amount: '5', provider: '' }));
		expect(result.ok && result.fields.provider).toBeNull();
	});

	it('requires a date in the stored format', () => {
		for (const serviceDate of ['', '09/03/2026', '2026-3-9', 'yesterday']) {
			expect(parseReceiptForm(form({ serviceDate, amount: '5' })).ok).toBe(false);
		}
	});

	it('rejects an amount that will not parse', () => {
		const result = parseReceiptForm(form({ serviceDate: '2026-03-09', amount: 'twelve' }));
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toMatch(/valid amount/i);
	});

	it('tolerates missing fields entirely rather than throwing', () => {
		expect(parseReceiptForm(new FormData()).ok).toBe(false);
	});
});
