<script lang="ts">
	import '$lib/styles/nocturne.css';
	import '$lib/styles/app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<footer>
	<small>{data.build.sha} · {data.build.time}</small>
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
