<script lang="ts">
	import '$lib/styles/nocturne.css';
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
		/* Nocturne rules fade to transparent over 48px at each end rather
		   than stopping cleanly. */
		margin-top: var(--space-8);
		padding: var(--space-4) var(--space-6);
		background: linear-gradient(
				to right,
				transparent,
				var(--color-divider) 48px,
				var(--color-divider) calc(100% - 48px),
				transparent
			)
			no-repeat top / 100% 1px;
	}
	small {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
</style>
