import { describe, expect, it } from 'vitest';
import { filterProviders, highlight, rankProviders } from './providers';

const row = (provider: string | null, serviceDate = '2026-01-01') => ({ provider, serviceDate });

describe('rankProviders', () => {
	it('puts the most-used provider first', () => {
		expect(
			rankProviders([
				row('Walgreens'),
				row('Quest Diagnostics'),
				row('Walgreens'),
				row('Walgreens')
			])
		).toEqual(['Walgreens', 'Quest Diagnostics']);
	});

	it('breaks ties on how recently it was used', () => {
		expect(
			rankProviders([
				row('Older Clinic', '2024-01-01'),
				row('Newer Clinic', '2026-05-01'),
				row('Middle Clinic', '2025-01-01')
			])
		).toEqual(['Newer Clinic', 'Middle Clinic', 'Older Clinic']);
	});

	it('treats spellings that differ only in case as one provider', () => {
		expect(rankProviders([row('walgreens'), row('WALGREENS'), row('Walgreens')])).toHaveLength(1);
	});

	it('shows the spelling used most often', () => {
		expect(rankProviders([row('Walgreens'), row('Walgreens'), row('walgreens')])).toEqual([
			'Walgreens'
		]);
	});

	it('ignores blank and missing providers', () => {
		expect(rankProviders([row(null), row(''), row('   ')])).toEqual([]);
	});

	it('trims surrounding whitespace', () => {
		expect(rankProviders([row('  CVS  ')])).toEqual(['CVS']);
	});

	it('has nothing to offer on an empty ledger', () => {
		expect(rankProviders([])).toEqual([]);
	});
});

describe('filterProviders', () => {
	const providers = ['Walgreens Pharmacy', 'Quest Diagnostics', 'Nguyen Family Dental', 'CVS'];

	it('suggests a provider from its first letter', () => {
		expect(filterProviders(providers, 'w')).toEqual(['Walgreens Pharmacy']);
	});

	it('ignores case', () => {
		expect(filterProviders(providers, 'WALG')).toEqual(['Walgreens Pharmacy']);
		// Partial, because a fully typed name is deliberately not suggested back.
		expect(filterProviders(providers, 'cv')).toEqual(['CVS']);
	});

	it('ranks names that start with the query above ones that merely contain it', () => {
		expect(filterProviders(['Family Practice', 'Nguyen Family Dental'], 'family')).toEqual([
			'Family Practice',
			'Nguyen Family Dental'
		]);
	});

	it('still finds a word in the middle of a name', () => {
		expect(filterProviders(providers, 'dental')).toEqual(['Nguyen Family Dental']);
	});

	it('offers the most-used providers before anything is typed', () => {
		expect(filterProviders(providers, '')).toEqual(providers);
		expect(filterProviders(providers, '   ')).toEqual(providers);
	});

	it('stops suggesting once the name is fully typed', () => {
		expect(filterProviders(providers, 'CVS')).toEqual([]);
		expect(filterProviders(providers, 'cvs ')).toEqual([]);
	});

	it('returns nothing when nothing matches', () => {
		expect(filterProviders(providers, 'zzz')).toEqual([]);
	});

	it('caps how many it offers, keeping the best-ranked', () => {
		const many = ['Aa', 'Ab', 'Ac', 'Ad', 'Ae', 'Af', 'Ag', 'Ah'];
		expect(filterProviders(many, 'a')).toEqual(['Aa', 'Ab', 'Ac', 'Ad', 'Ae', 'Af']);
		expect(filterProviders(many, 'a', 2)).toEqual(['Aa', 'Ab']);
	});

	it('preserves the ranking it was given', () => {
		// Most-used first in, most-used first out.
		expect(filterProviders(['Walgreens', 'Walmart Pharmacy'], 'wal')).toEqual([
			'Walgreens',
			'Walmart Pharmacy'
		]);
	});
});

describe('highlight', () => {
	it('splits a label around the typed text', () => {
		expect(highlight('Walgreens', 'wal')).toEqual(['', 'Wal', 'greens']);
		expect(highlight('Nguyen Family Dental', 'family')).toEqual(['Nguyen ', 'Family', ' Dental']);
	});

	it('leaves the label whole when there is nothing to mark', () => {
		expect(highlight('Walgreens', '')).toEqual(['Walgreens', '', '']);
		expect(highlight('Walgreens', 'zzz')).toEqual(['Walgreens', '', '']);
	});

	it('keeps the label’s own capitalisation, not the query’s', () => {
		expect(highlight('Walgreens', 'WALG')).toEqual(['', 'Walg', 'reens']);
	});
});
