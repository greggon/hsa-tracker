<script lang="ts">
	import '$lib/styles/material.css';
	import '$lib/styles/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Toaster from '$lib/components/Toaster.svelte';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- Mounted here, not per page: a toast raised just before navigating away has
     to outlive the page that raised it, and the layout survives navigation. -->
<Toaster />

<footer>
	<small>
		{data.build.sha} ·
		{#if data.build.timeISO}
			<time datetime={data.build.timeISO}>{data.build.time}</time>
		{:else}
			{data.build.time}
		{/if}
	</small>
</footer>

<style>
	footer {
		margin-top: 32px;
		/* Clears whatever bar is fixed to the bottom of a phone screen; the
		   pages themselves do not pad for it, so the footer cannot end up
		   underneath it. */
		padding: 12px var(--gutter) calc(12px + var(--bottom-bar) + env(safe-area-inset-bottom));
		border-top: 1px solid var(--md-outline-variant);
	}
	small {
		font: 400 12px/16px var(--md-font);
		letter-spacing: 0.4px;
		font-variant-numeric: tabular-nums;
		color: var(--md-on-surface-variant);
	}
</style>
