import { describe, expect, it } from 'vitest';
import { toCents } from './money';

describe('toCents', () => {
	it('reads a plain amount', () => {
		expect(toCents('12.34')).toBe(1234);
		expect(toCents('7')).toBe(700);
	});

	it('accepts what people actually type', () => {
		expect(toCents('$12.34')).toBe(1234);
		expect(toCents(' $1,234.56 ')).toBe(123456);
		expect(toCents('$1 234.56')).toBe(123456);
	});

	it('rounds to the nearest cent rather than truncating', () => {
		expect(toCents('0.005')).toBe(1);
		expect(toCents('10.994')).toBe(1099);
		expect(toCents('10.995')).toBe(1100);
	});

	it('treats blank as "not readable", which is a valid receipt', () => {
		expect(toCents('')).toBeNull();
		expect(toCents('   ')).toBeNull();
	});

	it('rejects a non-blank value that will not parse — that is a typo', () => {
		expect(() => toCents('abc')).toThrow();
		expect(() => toCents('$')).toThrow();
	});

	it('rejects zero and negatives: a receipt is money you spent', () => {
		expect(() => toCents('0')).toThrow();
		expect(() => toCents('0.00')).toThrow();
		expect(() => toCents('-5')).toThrow();
	});

	it('never returns a non-finite number', () => {
		expect(() => toCents('Infinity')).toThrow();
		expect(() => toCents('1e999')).toThrow();
	});
});
