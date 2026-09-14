import { describe, expect, it } from 'vitest';
import {
	FULL,
	MIN,
	applyAspect,
	fitAspect,
	resizeRect,
	toNormalisedAspect,
	toPixels,
	type Rect
} from './crop';

const HALF: Rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
const round = (r: Rect) => ({
	x: +r.x.toFixed(4),
	y: +r.y.toFixed(4),
	w: +r.w.toFixed(4),
	h: +r.h.toFixed(4)
});

describe('moving the selection', () => {
	it('follows the drag', () => {
		expect(round(resizeRect('move', HALF, 0.1, -0.1))).toEqual({
			x: 0.35,
			y: 0.15,
			w: 0.5,
			h: 0.5
		});
	});

	it('stops at the edges instead of leaving the image', () => {
		expect(round(resizeRect('move', HALF, -9, -9))).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
		expect(round(resizeRect('move', HALF, 9, 9))).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
	});

	it('never changes size', () => {
		const moved = resizeRect('move', HALF, 0.4, 0.4);
		expect(moved.w).toBe(HALF.w);
		expect(moved.h).toBe(HALF.h);
	});
});

describe('resizing from a handle', () => {
	it('moves only the dragged edge', () => {
		expect(round(resizeRect('e', HALF, 0.1, 0.3))).toEqual({ x: 0.25, y: 0.25, w: 0.6, h: 0.5 });
		expect(round(resizeRect('n', HALF, 0.3, -0.1))).toEqual({ x: 0.25, y: 0.15, w: 0.5, h: 0.6 });
	});

	it('moves both edges of a corner', () => {
		expect(round(resizeRect('se', HALF, 0.1, 0.1))).toEqual({ x: 0.25, y: 0.25, w: 0.6, h: 0.6 });
		expect(round(resizeRect('nw', HALF, -0.1, -0.1))).toEqual({
			x: 0.15,
			y: 0.15,
			w: 0.6,
			h: 0.6
		});
	});

	it('keeps the opposite edge pinned', () => {
		const r = resizeRect('w', HALF, 0.2, 0);
		expect(+(r.x + r.w).toFixed(4)).toBe(0.75);
	});

	it('refuses to collapse past the minimum', () => {
		// Drag the west edge far past the east one.
		const squashed = resizeRect('w', HALF, 9, 0);
		expect(squashed.w).toBeCloseTo(MIN, 5);
		expect(squashed.w).toBeGreaterThan(0);
	});

	it('clamps at the image bounds', () => {
		const big = resizeRect('se', HALF, 9, 9);
		expect(+(big.x + big.w).toFixed(4)).toBe(1);
		expect(+(big.y + big.h).toFixed(4)).toBe(1);

		const small = resizeRect('nw', HALF, -9, -9);
		expect(small.x).toBe(0);
		expect(small.y).toBe(0);
	});

	it('never produces a rectangle outside the image, however wild the drag', () => {
		const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
		for (const handle of handles) {
			for (const d of [-5, -0.3, 0, 0.3, 5]) {
				for (const aspect of [null, 1, 0.75]) {
					const r = resizeRect(handle, HALF, d, -d, aspect);
					expect(r.x).toBeGreaterThanOrEqual(-1e-9);
					expect(r.y).toBeGreaterThanOrEqual(-1e-9);
					expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
					expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
					expect(r.w).toBeGreaterThan(0);
					expect(r.h).toBeGreaterThan(0);
					expect(Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
				}
			}
		}
	});
});

describe('aspect ratios', () => {
	it('converts a pixel ratio into normalised space', () => {
		// A square crop on a 2:1 image covers twice as much height as width.
		expect(toNormalisedAspect(1, { w: 1000, h: 500 })).toBe(0.5);
		// On a square image the two spaces agree.
		expect(toNormalisedAspect(1, { w: 800, h: 800 })).toBe(1);
	});

	it('is null when free-form or before the image loads', () => {
		expect(toNormalisedAspect(null, { w: 100, h: 100 })).toBeNull();
		expect(toNormalisedAspect(1, { w: 0, h: 0 })).toBeNull();
	});

	it('holds the ratio while dragging a corner', () => {
		const r = resizeRect('se', HALF, 0.2, 0, 1);
		expect(r.w / r.h).toBeCloseTo(1, 5);
	});

	it('anchors the corner opposite the one being dragged', () => {
		const r = resizeRect('nw', HALF, -0.1, 0, 1);
		// South-east corner must not have moved.
		expect(+(r.x + r.w).toFixed(4)).toBe(0.75);
		expect(+(r.y + r.h).toFixed(4)).toBe(0.75);
	});

	it('derives width from height when a horizontal edge is dragged', () => {
		const r = resizeRect('s', HALF, 0, 0.2, 1);
		expect(r.w / r.h).toBeCloseTo(1, 5);
	});

	it('re-shapes around the centre when a preset is chosen', () => {
		const before = HALF;
		const after = fitAspect(before, 1);
		expect(after.w / after.h).toBeCloseTo(1, 5);
		expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 5);
		expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 5);
	});

	it('shrinks to fit rather than overflowing on an extreme ratio', () => {
		const wide = fitAspect(FULL, 4);
		expect(wide.w).toBeLessThanOrEqual(1);
		expect(wide.h).toBeLessThanOrEqual(1);
		expect(wide.w / wide.h).toBeCloseTo(4, 5);

		const tall = fitAspect(FULL, 0.25);
		expect(tall.w / tall.h).toBeCloseTo(0.25, 5);
	});

	it('keeps a locked box inside the image', () => {
		const r = applyAspect({ x: 0.9, y: 0.9, w: 0.4, h: 0.4 }, 'se', 1);
		expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
		expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
	});
});

describe('toPixels', () => {
	it('converts to the unit the server crops in', () => {
		expect(toPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, { w: 1200, h: 800 })).toEqual({
			x: 300,
			y: 400,
			width: 600,
			height: 200
		});
	});

	it('reports the whole image when nothing has been cropped', () => {
		expect(toPixels(FULL, { w: 1024, h: 768 })).toEqual({
			x: 0,
			y: 0,
			width: 1024,
			height: 768
		});
	});

	it('never rounds a sliver down to zero', () => {
		const sliver = toPixels({ x: 0, y: 0, w: 0.0001, h: 0.0001 }, { w: 100, h: 100 });
		expect(sliver.width).toBeGreaterThan(0);
		expect(sliver.height).toBeGreaterThan(0);
	});
});
