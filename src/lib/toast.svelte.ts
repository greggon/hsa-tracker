/**
 * Transient feedback, held app-wide.
 *
 * App-wide rather than per-page on purpose: saving a receipt navigates you back
 * to wherever you came from, and the confirmation has to outlive the page that
 * raised it. `+layout.svelte` renders the only `Toaster`, and the layout
 * survives client-side navigation, so a toast pushed just before leaving is
 * still on screen when the previous page arrives.
 *
 * The singleton is safe under SSR only because nothing ever pushes during
 * render — toasts come from event handlers, which run in the browser. Keep it
 * that way: pushing from a `load` would leak one user's message into another's
 * response.
 */

export type ToastTone = 'success' | 'error';

export type Toast = {
	id: number;
	tone: ToastTone;
	message: string;
};

/**
 * How long each tone stays up. Errors linger more than twice as long: a
 * validation message that was missed is worse than one that overstayed, and
 * the toast is the only place the message now appears.
 */
export const LIFETIME: Record<ToastTone, number> = {
	success: 3500,
	error: 8000
};

/** Older toasts are dropped past this, so a stuck loop cannot fill the screen. */
export const MAX_VISIBLE = 3;

class ToastStore {
	items = $state<Toast[]>([]);

	#nextId = 1;
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	/** Shows a message, and returns its id so a caller can dismiss it early. */
	push(tone: ToastTone, message: string): number {
		const id = this.#nextId++;
		this.items = [...this.items, { id, tone, message }];

		// Trim from the front — the newest message is the one being read.
		while (this.items.length > MAX_VISIBLE) {
			this.dismiss(this.items[0].id);
		}

		this.#timers.set(
			id,
			setTimeout(() => this.dismiss(id), LIFETIME[tone])
		);
		return id;
	}

	success(message: string): number {
		return this.push('success', message);
	}

	error(message: string): number {
		return this.push('error', message);
	}

	dismiss(id: number): void {
		const timer = this.#timers.get(id);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.#timers.delete(id);
		}
		this.items = this.items.filter((t) => t.id !== id);
	}

	/** Used by tests; nothing in the app clears the stack wholesale. */
	clear(): void {
		for (const id of [...this.#timers.keys()]) this.dismiss(id);
		this.items = [];
	}
}

export const toasts = new ToastStore();
