<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	/** 404 is the ordinary case here — a stale link to a receipt that was deleted. */
	const isMissing = $derived(page.status === 404);
</script>

<svelte:head><title>{page.status} · HSA Saver</title></svelte:head>

<main>
	<p class="code">{page.status}</p>
	<h1>{isMissing ? 'No such receipt' : 'Something went wrong'}</h1>
	<p class="detail">
		{isMissing
			? 'It may have been deleted, or the link may be wrong.'
			: (page.error?.message ?? 'Try again in a moment.')}
	</p>
	<a class="btn btn-secondary" href={resolve('/')}>Back to my vault</a>
</main>

<style>
	main {
		max-width: 26rem;
		margin: 0 auto;
		padding: 18vh var(--gutter) var(--space-6);
		text-align: center;
	}
	.code {
		margin: 0;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 56px;
		line-height: 1;
		letter-spacing: -0.03em;
		color: color-mix(in srgb, var(--color-text) 22%, transparent);
		font-variant-numeric: tabular-nums;
	}
	h1 {
		font-size: 19px;
		margin: var(--space-4) 0 0;
	}
	.detail {
		font-size: 13.5px;
		color: color-mix(in srgb, var(--color-text) 55%, transparent);
		margin: var(--space-3) 0 var(--space-6);
	}
</style>
