<script lang="ts">
	/**
	 * Phones only: the Material navigation bar, with filing a receipt as the
	 * middle item. It is an action rather than a destination, so it wears a
	 * filled primary pill instead of the selection indicator, and never shows
	 * as current.
	 */
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';

	interface Props {
		current: 'vault' | 'receipts';
		/** Fired by the middle item — the host decides what capturing means. */
		oncapture: () => void;
	}

	let { current, oncapture }: Props = $props();

	const SECTIONS = [
		{ key: 'vault', href: '/', icon: 'vault', label: 'Vault' },
		{ key: 'receipts', href: '/receipts', icon: 'receipt', label: 'Receipts' }
	] as const;
</script>

<nav class="navbar" aria-label="Sections">
	{#each SECTIONS as section (section.key)}
		<a
			class="dest"
			href={resolve(section.href)}
			aria-current={current === section.key ? 'page' : undefined}
		>
			<span class="indicator"><Icon name={section.icon} /></span>
			<span class="label">{section.label}</span>
		</a>

		{#if section.key === 'vault'}
			<button type="button" class="dest capture" onclick={oncapture}>
				<span class="indicator"><Icon name="camera" /></span>
				<span class="label">File receipt</span>
			</button>
		{/if}
	{/each}
</nav>

<style>
	.navbar {
		display: none;
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
		height: calc(80px + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		background: var(--md-surface-container);
	}
	.dest {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--md-on-surface-variant);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}
	.indicator {
		display: grid;
		place-items: center;
		width: 64px;
		height: 32px;
		border-radius: var(--md-shape-full);
	}
	.dest:hover .indicator {
		box-shadow: var(--md-state-hover);
	}
	.label {
		font: 500 12px/16px var(--md-font);
		letter-spacing: 0.5px;
	}
	.dest[aria-current='page'] {
		color: var(--md-on-surface);
	}
	.dest[aria-current='page'] .indicator {
		background: var(--md-secondary-container);
		color: var(--md-on-secondary-container);
	}
	.dest[aria-current='page'] .label {
		font-weight: 700;
	}

	.capture {
		color: var(--md-on-surface);
	}
	.capture .indicator {
		background: var(--md-primary);
		color: var(--md-on-primary);
	}
	.capture:hover .indicator {
		box-shadow: var(--md-state-hover), var(--md-elev-1);
	}
	.capture:active .indicator {
		box-shadow: var(--md-state-press);
	}

	@media (max-width: 700px) {
		.navbar {
			display: flex;
		}
	}
</style>
