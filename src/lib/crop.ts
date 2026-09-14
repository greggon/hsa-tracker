/**
 * Crop-rectangle geometry.
 *
 * Pure, and outside the component, because the drag maths is where the edge
 * cases live: clamping at the image edge, refusing to collapse, and anchoring
 * the opposite corner when an aspect ratio is locked.
 *
 * Rectangles are normalised — 0-1 of the image on each axis — so they survive
 * the element resizing. Note that a normalised rectangle is not the same shape
 * as the pixels it covers unless the image is square, which is why aspect
 * ratios are converted with `toNormalisedAspect` before use.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Handle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Never let a fast drag collapse the box to nothing. */
export const MIN = 0.06;

export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Convert a pixel aspect (width ÷ height) into the normalised space. */
export function toNormalisedAspect(
	aspect: number | null,
	natural: { w: number; h: number }
): number | null {
	if (!aspect || !natural.w || !natural.h) return null;
	return aspect * (natural.h / natural.w);
}

/** Re-shape `next` to `target`, holding the corner opposite the dragged one. */
export function applyAspect(next: Rect, handle: Handle, target: number): Rect {
	let { x, y, w, h } = next;

	if (handle === 'n' || handle === 's') {
		// A horizontal edge sets the height, so width follows and stays centred.
		w = clamp(h * target, MIN, 1);
		x = clamp(x + (next.w - w) / 2, 0, 1 - w);
	} else {
		h = clamp(w / target, MIN, 1);
		w = clamp(h * target, MIN, 1);
		x = handle.includes('w') ? next.x + next.w - w : next.x;
		y = handle.includes('n') ? next.y + next.h - h : next.y;
	}

	return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
}

/** Apply a drag of (dx, dy) to `from`, in normalised units. */
export function resizeRect(
	handle: Handle,
	from: Rect,
	dx: number,
	dy: number,
	aspect: number | null = null
): Rect {
	if (handle === 'move') {
		return {
			...from,
			x: clamp(from.x + dx, 0, 1 - from.w),
			y: clamp(from.y + dy, 0, 1 - from.h)
		};
	}

	let left = from.x;
	let top = from.y;
	let right = from.x + from.w;
	let bottom = from.y + from.h;

	if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN);
	if (handle.includes('e')) right = clamp(right + dx, left + MIN, 1);
	if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN);
	if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN, 1);

	const next = { x: left, y: top, w: right - left, h: bottom - top };
	return aspect ? applyAspect(next, handle, aspect) : next;
}

/** Re-shape the current selection to `target`, keeping its centre where it is. */
export function fitAspect(rect: Rect, target: number): Rect {
	let w = rect.w;
	let h = w / target;
	if (h > 1) {
		h = 1;
		w = h * target;
	}
	if (w > 1) {
		w = 1;
		h = w / target;
	}
	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;
	return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/** The rectangle in natural image pixels, which is the unit the server crops in. */
export function toPixels(rect: Rect, natural: { w: number; h: number }) {
	return {
		x: Math.round(rect.x * natural.w),
		y: Math.round(rect.y * natural.h),
		width: Math.max(1, Math.round(rect.w * natural.w)),
		height: Math.max(1, Math.round(rect.h * natural.h))
	};
}
