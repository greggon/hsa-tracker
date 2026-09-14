import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIFETIME, MAX_VISIBLE, toasts } from './toast.svelte';

describe('toasts', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		toasts.clear();
	});

	afterEach(() => {
		toasts.clear();
		vi.useRealTimers();
	});

	it('shows a message', () => {
		toasts.success('Receipt saved.');
		expect(toasts.items).toHaveLength(1);
		expect(toasts.items[0]).toMatchObject({ tone: 'success', message: 'Receipt saved.' });
	});

	it('gives every toast a distinct id, even with identical text', () => {
		const a = toasts.success('Receipt saved.');
		const b = toasts.success('Receipt saved.');
		expect(a).not.toBe(b);
		expect(new Set(toasts.items.map((t) => t.id)).size).toBe(2);
	});

	it('clears a success on its own', () => {
		toasts.success('Receipt saved.');
		vi.advanceTimersByTime(LIFETIME.success - 1);
		expect(toasts.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toasts.items).toHaveLength(0);
	});

	/** An error is the only place the message appears, so it must not flash past. */
	it('leaves an error up more than twice as long as a success', () => {
		expect(LIFETIME.error).toBeGreaterThan(LIFETIME.success * 2);

		toasts.error('Enter a valid amount.');
		vi.advanceTimersByTime(LIFETIME.success);
		expect(toasts.items).toHaveLength(1);
		vi.advanceTimersByTime(LIFETIME.error - LIFETIME.success);
		expect(toasts.items).toHaveLength(0);
	});

	it('dismisses on request', () => {
		const id = toasts.error('Could not save this receipt.');
		toasts.dismiss(id);
		expect(toasts.items).toHaveLength(0);
	});

	it('does not resurrect a dismissed toast when its timer fires', () => {
		const id = toasts.success('Receipt saved.');
		toasts.dismiss(id);
		vi.advanceTimersByTime(LIFETIME.success * 2);
		expect(toasts.items).toHaveLength(0);
	});

	it('ignores a dismiss for something already gone', () => {
		const id = toasts.success('Receipt saved.');
		toasts.dismiss(id);
		expect(() => toasts.dismiss(id)).not.toThrow();
		expect(toasts.items).toHaveLength(0);
	});

	it('caps the stack, dropping the oldest', () => {
		for (let i = 1; i <= MAX_VISIBLE + 2; i++) toasts.success(`message ${i}`);

		expect(toasts.items).toHaveLength(MAX_VISIBLE);
		// The newest survive: the oldest two were pushed out.
		expect(toasts.items.map((t) => t.message)).toEqual([
			`message ${MAX_VISIBLE}`,
			`message ${MAX_VISIBLE + 1}`,
			`message ${MAX_VISIBLE + 2}`
		]);
	});

	it('keeps the newest in arrival order', () => {
		toasts.success('first');
		toasts.error('second');
		expect(toasts.items.map((t) => t.tone)).toEqual(['success', 'error']);
	});
});
