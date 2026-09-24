<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	/** 404 is the ordinary case here — a stale link to a receipt that was deleted. */
	const isMissing = $derived(page.status === 404);
	const heading = $derived(isMissing ? 'No such receipt' : 'Something went wrong');
</script>

<svelte:head><title>{heading} · HSA Saver</title></svelte:head>

<main>
	<p class="code">{page.status}</p>
	<h1 class="md-headline-small">{heading}</h1>
	<p class="detail md-body-medium">
		{isMissing
			? 'It may have been deleted, or the link may be wrong.'
			: (page.error?.message ?? 'Try again in a moment.')}
	</p>
	<a class="btn btn-filled" href={resolve('/')}>Back to my vault</a>
</main>

<style>
	main {
		max-width: 26rem;
		margin: 0 auto;
		padding: 18vh var(--gutter) 24px;
		text-align: center;
	}
	.code {
		font: 400 57px/64px var(--md-font);
		letter-spacing: -0.25px;
		color: var(--md-primary);
		font-variant-numeric: tabular-nums;
	}
	h1 {
		margin-top: 16px;
	}
	.detail {
		margin: 8px 0 24px;
		color: var(--md-on-surface-variant);
	}
</style>
