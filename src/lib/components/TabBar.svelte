<script lang="ts">
	/** Phones only: the two sections, either side of the shutter. */
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';

	interface Props {
		current: 'vault' | 'receipts';
		/** Fired by the shutter — the host decides what capturing means. */
		oncapture: () => void;
	}

	let { current, oncapture }: Props = $props();

	const SECTIONS = [
		{ key: 'vault', href: '/', icon: 'vault', label: 'Vault' },
		{ key: 'receipts', href: '/receipts', icon: 'receipt', label: 'Receipts' }
	] as const;
</script>

<nav class="tabs" aria-label="Sections">
	{#each SECTIONS as section (section.key)}
		{#if current === section.key}
			<span class="tab current">
				<Icon name={section.icon} size={21} width={1.7} />{section.label}
			</span>
		{:else}
			<a class="tab" href={resolve(section.href)}>
				<Icon name={section.icon} size={21} width={1.7} />{section.label}
			</a>
		{/if}

		{#if section.key === 'vault'}
			<button class="shutter" onclick={oncapture} aria-label="File a receipt">
				<Icon name="camera" size={24} />
			</button>
		{/if}
	{/each}
</nav>

<style>
	.tabs {
		display: none;
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
		align-items: center;
		justify-content: space-around;
		padding: 11px 24px calc(16px + env(safe-area-inset-bottom));
		background: color-mix(in srgb, var(--color-bg) 94%, transparent);
		backdrop-filter: blur(12px);
		box-shadow: 0 -1px 0 color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		font-size: 10px;
		text-decoration: none;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
	.tab.current {
		color: var(--color-accent);
	}
	.shutter {
		width: 54px;
		height: 54px;
		margin-top: -26px;
		border-radius: 99px;
		border: 1.5px solid var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 18%, transparent);
		color: var(--color-accent);
		cursor: pointer;
		display: grid;
		place-items: center;
		box-shadow: 0 0 26px color-mix(in srgb, var(--color-accent) 28%, transparent);
	}

	@media (max-width: 700px) {
		.tabs {
			display: flex;
		}
	}
</style>
