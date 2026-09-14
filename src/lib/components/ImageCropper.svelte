<script lang="ts">
	/**
	 * A direct-manipulation cropper: the image stays put and you drag the crop
	 * box's edges and corners over it, the way a phone's screenshot editor works.
	 *
	 * The rectangle is held normalised (0-1 of the image) so it survives the
	 * element being resized or the sheet being reopened, and is published in
	 * natural image pixels, which is what the server's crop wants.
	 */
	import {
		FULL,
		fitAspect,
		resizeRect,
		toNormalisedAspect,
		toPixels,
		type Handle,
		type Rect
	} from '$lib/crop';

	interface Props {
		src: string;
		/** Crop in natural image pixels; null until the image has loaded. */
		crop?: { x: number; y: number; width: number; height: number } | null;
	}

	let { src, crop = $bindable(null) }: Props = $props();

	let stageEl = $state<HTMLElement | null>(null);
	let natural = $state({ w: 0, h: 0 });
	let rect = $state<Rect>(FULL);
	let dragging = $state<Handle | null>(null);
	/** Width ÷ height in real pixels, or null when the crop is free-form. */
	let aspect = $state<number | null>(null);

	let origin: { px: number; py: number; rect: Rect } | null = null;

	function onLoad(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		natural = { w: img.naturalWidth, h: img.naturalHeight };
		reset();
	}

	function reset() {
		aspect = null;
		rect = FULL;
	}

	const aspectNormalised = $derived(toNormalisedAspect(aspect, natural));

	function fractionAt(event: PointerEvent) {
		const box = stageEl!.getBoundingClientRect();
		return {
			x: (event.clientX - box.left) / box.width,
			y: (event.clientY - box.top) / box.height
		};
	}

	function onPointerDown(handle: Handle, event: PointerEvent) {
		event.preventDefault();
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		dragging = handle;
		const p = fractionAt(event);
		origin = { px: p.x, py: p.y, rect: { ...rect } };
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging || !origin) return;
		const p = fractionAt(event);
		rect = resizeRect(dragging, origin.rect, p.x - origin.px, p.y - origin.py, aspectNormalised);
	}

	function onPointerUp() {
		dragging = null;
		origin = null;
	}

	/** Arrow keys nudge the selection so the control is not pointer-only. */
	function onKeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 0.05 : 0.01;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		rect = resizeRect('move', rect, move[0], move[1]);
	}

	function setAspect(next: number | null) {
		aspect = next;
		const target = toNormalisedAspect(next, natural);
		if (target) rect = fitAspect(rect, target);
	}

	// Publish in natural pixels, which is the unit the server crops in.
	$effect(() => {
		if (natural.w && natural.h) crop = toPixels(rect, natural);
	});

	/**
	 * The dimmed surround, as the four bands of image left uncovered by the
	 * selection. A single large `box-shadow` ring was simpler but painted well
	 * past the picture and greyed out the rest of the form with it.
	 */
	const shades = $derived([
		`left:0;top:0;right:0;height:${rect.y * 100}%`,
		`left:0;top:${(rect.y + rect.h) * 100}%;right:0;bottom:0`,
		`top:${rect.y * 100}%;height:${rect.h * 100}%;left:0;width:${rect.x * 100}%`,
		`top:${rect.y * 100}%;height:${rect.h * 100}%;left:${(rect.x + rect.w) * 100}%;right:0`
	]);

	const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
	const PRESETS: { label: string; value: number | null }[] = [
		{ label: 'Free', value: null },
		{ label: 'Square', value: 1 },
		{ label: 'Portrait', value: 3 / 4 },
		{ label: 'Landscape', value: 4 / 3 }
	];
</script>

<div class="cropper">
	<div class="frame">
		<div class="stage" bind:this={stageEl} class:busy={dragging !== null}>
			<img {src} alt="" onload={onLoad} draggable="false" />

			{#if natural.w > 0}
				{#each shades as shade, i (i)}
					<div class="shade" style={shade} aria-hidden="true"></div>
				{/each}

				<!--
					role="application" is the accurate role for a direct-manipulation
					surface whose keyboard behaviour the author supplies, which is what
					the arrow-key handler below is. Svelte's heuristic treats it as
					non-interactive, so the two rules it triggers are suppressed here
					rather than the role being downgraded to something untrue.
				-->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					class="box"
					style="left:{rect.x * 100}%;top:{rect.y * 100}%;width:{rect.w * 100}%;height:{rect.h *
						100}%"
					role="application"
					aria-label="Crop area. Arrow keys move the selection; drag a corner to resize."
					tabindex="0"
					onkeydown={onKeydown}
					onpointerdown={(e) => onPointerDown('move', e)}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
					onpointercancel={onPointerUp}
				>
					<div class="thirds" aria-hidden="true"></div>
					{#each HANDLES as handle (handle)}
						<span
							class="handle {handle}"
							role="presentation"
							onpointerdown={(e) => {
								e.stopPropagation();
								onPointerDown(handle, e);
							}}
							onpointermove={onPointerMove}
							onpointerup={onPointerUp}
							onpointercancel={onPointerUp}
						></span>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div class="controls">
		<div class="presets">
			{#each PRESETS as preset (preset.label)}
				<button
					type="button"
					class="preset"
					class:current={aspect === preset.value}
					onclick={() => setAspect(preset.value)}
				>
					{preset.label}
				</button>
			{/each}
		</div>
		<div class="readout">
			{#if crop}
				<span class="dims">{crop.width} × {crop.height}</span>
			{/if}
			<button type="button" class="btn btn-ghost reset" onclick={reset}>Reset</button>
		</div>
	</div>
</div>

<style>
	.frame {
		display: flex;
		justify-content: center;
		background: var(--color-neutral-900);
		border-radius: var(--radius-sm);
		padding: var(--space-2);
	}
	/* Shrink-wraps the image, so the overlay's percentages land on the picture
	   itself rather than on a letterboxed container. */
	.stage {
		position: relative;
		display: inline-block;
		line-height: 0;
		touch-action: none;
	}
	.stage img {
		display: block;
		max-width: 100%;
		max-height: 42vh;
		user-select: none;
		-webkit-user-drag: none;
	}

	/* Bounded to the image, so the sheet around it stays at full brightness. */
	.shade {
		position: absolute;
		background: color-mix(in srgb, var(--color-neutral-900) 72%, transparent);
		pointer-events: none;
	}
	.box {
		position: absolute;
		outline: 1px solid color-mix(in srgb, var(--color-text) 70%, transparent);
		cursor: move;
		touch-action: none;
	}
	.box:focus-visible {
		outline: 2px solid var(--color-accent);
	}
	.stage.busy .box {
		outline-color: var(--color-accent);
	}

	/* Rule-of-thirds guides, drawn only while they are useful. */
	.thirds {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 120ms;
		background:
			linear-gradient(
					to right,
					transparent calc(33.333% - 0.5px),
					color-mix(in srgb, var(--color-text) 28%, transparent) calc(33.333% - 0.5px)
						calc(33.333% + 0.5px),
					transparent calc(33.333% + 0.5px)
				)
				no-repeat,
			linear-gradient(
					to right,
					transparent calc(66.666% - 0.5px),
					color-mix(in srgb, var(--color-text) 28%, transparent) calc(66.666% - 0.5px)
						calc(66.666% + 0.5px),
					transparent calc(66.666% + 0.5px)
				)
				no-repeat,
			linear-gradient(
					to bottom,
					transparent calc(33.333% - 0.5px),
					color-mix(in srgb, var(--color-text) 28%, transparent) calc(33.333% - 0.5px)
						calc(33.333% + 0.5px),
					transparent calc(33.333% + 0.5px)
				)
				no-repeat,
			linear-gradient(
					to bottom,
					transparent calc(66.666% - 0.5px),
					color-mix(in srgb, var(--color-text) 28%, transparent) calc(66.666% - 0.5px)
						calc(66.666% + 0.5px),
					transparent calc(66.666% + 0.5px)
				)
				no-repeat;
	}
	.stage.busy .thirds,
	.box:hover .thirds,
	.box:focus-visible .thirds {
		opacity: 1;
	}

	/* Corner marks are drawn as thick L-shapes; edge grips are thin bars.
	   Both carry a generous invisible target for fingers. */
	.handle {
		position: absolute;
		touch-action: none;
	}
	.handle::after {
		content: '';
		position: absolute;
		inset: -12px;
	}
	.nw,
	.ne,
	.se,
	.sw {
		width: 20px;
		height: 20px;
		border: 3px solid var(--color-accent);
	}
	.nw {
		top: -1px;
		left: -1px;
		border-right: none;
		border-bottom: none;
		cursor: nwse-resize;
	}
	.ne {
		top: -1px;
		right: -1px;
		border-left: none;
		border-bottom: none;
		cursor: nesw-resize;
	}
	.se {
		bottom: -1px;
		right: -1px;
		border-left: none;
		border-top: none;
		cursor: nwse-resize;
	}
	.sw {
		bottom: -1px;
		left: -1px;
		border-right: none;
		border-top: none;
		cursor: nesw-resize;
	}
	.n,
	.s {
		left: 50%;
		width: 34px;
		height: 3px;
		margin-left: -17px;
		background: var(--color-accent);
		cursor: ns-resize;
	}
	.n {
		top: -1px;
	}
	.s {
		bottom: -1px;
	}
	.e,
	.w {
		top: 50%;
		width: 3px;
		height: 34px;
		margin-top: -17px;
		background: var(--color-accent);
		cursor: ew-resize;
	}
	.w {
		left: -1px;
	}
	.e {
		right: -1px;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.presets {
		display: inline-flex;
		overflow: hidden;
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-md);
	}
	.preset {
		padding: 6px 11px;
		font: inherit;
		font-size: 12.5px;
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
	}
	.preset + .preset {
		border-left: 1px solid var(--color-divider);
	}
	.preset:hover {
		background: color-mix(in srgb, var(--color-text) 7%, transparent);
	}
	.preset.current {
		color: var(--color-accent);
		box-shadow: inset 0 0 0 1px var(--color-accent);
	}
	.readout {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.dims {
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
	.reset {
		font-size: 12.5px;
	}
</style>
