import { AMOUNT_ERROR, toCents } from '$lib/money';

/**
 * The fields a receipt form carries, parsed once.
 *
 * Filing a new receipt and editing an existing one validate exactly the same
 * three fields; written out at both call sites the two copies were already
 * phrasing the date error differently.
 */
export type ReceiptFields = {
	serviceDate: string;
	amountCents: number | null;
	provider: string | null;
};

export type ParseResult = { ok: true; fields: ReceiptFields } | { ok: false; error: string };

export function parseReceiptForm(form: FormData): ParseResult {
	const serviceDate = String(form.get('serviceDate') ?? '');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
		return { ok: false, error: 'Enter a valid date of service.' };
	}

	// A blank amount is allowed — see toCents. Anything else unparseable is a typo.
	let amountCents: number | null;
	try {
		amountCents = toCents(String(form.get('amount') ?? ''));
	} catch {
		return { ok: false, error: AMOUNT_ERROR };
	}

	return {
		ok: true,
		fields: { serviceDate, amountCents, provider: String(form.get('provider') ?? '') || null }
	};
}
