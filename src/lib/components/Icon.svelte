<script lang="ts" module>
	/**
	 * The icon set used by the HSA Saver artboards, lifted verbatim from
	 * `HSA Saver.dc.html` so the drawn shapes match the design exactly.
	 *
	 * Nocturne's readme nominates Phosphor, but the artboards were drawn with
	 * these custom paths — following the artboards keeps fidelity and avoids a
	 * dependency for nine icons.
	 *
	 * Every glyph is stroked on a 24x24 box with `currentColor`, so colour comes
	 * from the surrounding text colour and the accent is applied by the caller.
	 *
	 * The shield glyphs from the design are deliberately absent: each one marked
	 * a backup claim ("All backed up", "Stored in three places"), and those
	 * panels are omitted until real backup exists.
	 */
	const PATHS = {
		/** Brand mark, and the Vault tab. */
		vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M12 10v10"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		camera:
			'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6l2-3h4l2 3M12 16a3 3 0 100-6 3 3 0 000 6z"/>',
		/** Camera flash toggle. */
		flash: '<path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z"/>',
		check: '<path d="M5 12.5l4 4 9.5-9.5"/>',
		chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
		receipt: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
		chart: '<path d="M4 19h16M5 15l4-5 4 3 5-8"/>',
		user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.6 4.1-5.2 7.5-5.2s6.1 1.6 7.5 5.2"/>'
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		/** Square size in px. The artboards range from 13 to 30. */
		size?: number;
		/** Artboard stroke weights run 1.7-2; 1.8 is the common case. */
		width?: number;
		/** Decorative by default. Pass a label to expose the icon to assistive tech. */
		label?: string;
	}

	let { name, size = 18, width = 1.8, label }: Props = $props();
</script>

<svg
	{...label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }}
	xmlns="http://www.w3.org/2000/svg"
	{...{ width: size, height: size }}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={width}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static module-level constants, no interpolation -->
	{@html PATHS[name]}
</svg>

<style>
	svg {
		display: block;
		flex: none;
	}
</style>
