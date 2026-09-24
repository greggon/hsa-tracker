<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppChrome from '$lib/components/AppChrome.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ReceiptList from '$lib/components/ReceiptList.svelte';
	import { money } from '$lib/format';
	import { searchReceipts } from '$lib/search';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let query = $state('');

	const normalised = $derived(query.trim().toLowerCase());

	/** A receipt the vault's "needs a field" count includes. */
	const needsAField = (e: (typeof data.receipts)[number]) =>
		!e.reimbursedAt && e.reasons.length > 0;

	/** `?needs` narrows the list to those, the same set the vault links to. */
	const onlyNeeding = $derived(page.url.searchParams.has('needs'));

	const searched = $derived(searchReceipts(data.receipts, query));
	const matches = $derived(onlyNeeding ? searched.filter(needsAField) : searched);

	/** Only receipts still owed to you count toward the figure the vault shows. */
	const outstandingCents = $derived(
		matches.reduce((sum, e) => sum + (e.reimbursedAt ? 0 : (e.amountCents ?? 0)), 0)
	);

	const needingAField = $derived(searched.filter(needsAField).length);

	/** The query string for this list with a year and/or `needs` applied. */
	function listQuery(params: { needs?: boolean; year?: number | null }) {
		const parts = [params.year ? `year=${params.year}` : '', params.needs ? 'needs=1' : ''];
		const q = parts.filter(Boolean).join('&');
		return q ? `?${q}` : '';
	}
</script>

<svelte:head><title>Receipts · HSA Saver</title></svelte:head>

<div class="app">
	<AppChrome current="receipts" bind:search={query} providers={data.providers} />

	<section class="head">
		<h1 class="md-headline-small">{data.year ?? 'All'} receipts</h1>
		<p class="summary md-body-medium">
			{matches.length} receipt{matches.length === 1 ? '' : 's'} ·
			<span class="outstanding">{money(outstandingCents)} unreimbursed</span>
		</p>
	</section>

	{#if needingAField > 0 || onlyNeeding || data.years.length > 1}
		<nav class="filters" aria-label="Filters">
			{#if needingAField > 0 || onlyNeeding}
				<!-- A toggle: selected, it narrows the list; tapped again, it clears. -->
				<a
					class="chip"
					class:selected={onlyNeeding}
					aria-current={onlyNeeding ? 'page' : undefined}
					href="{resolve('/receipts')}{listQuery({ year: data.year, needs: !onlyNeeding })}"
				>
					<Icon name={onlyNeeding ? 'check' : 'warning'} size={18} />
					Needs a field · {needingAField}
				</a>
			{/if}
			{#if data.years.length > 1}
				<span class="filter-sep" aria-hidden="true"></span>
				<a
					class="chip"
					class:selected={data.year === null}
					aria-current={data.year === null ? 'page' : undefined}
					href="{resolve('/receipts')}{listQuery({ needs: onlyNeeding })}"
				>
					{#if data.year === null}<Icon name="check" size={18} />{/if}
					All
				</a>
				{#each data.years as year (year)}
					<a
						class="chip"
						class:selected={data.year === year}
						aria-current={data.year === year ? 'page' : undefined}
						href="{resolve('/receipts')}{listQuery({ year, needs: onlyNeeding })}"
					>
						{#if data.year === year}<Icon name="check" size={18} />{/if}
						{year}
					</a>
				{/each}
			{/if}
		</nav>
	{/if}

	<section class="list">
		<ReceiptList
			rows={matches}
			empty={normalised === ''
				? onlyNeeding
					? 'Nothing here needs a field.'
					: data.year
						? `Nothing filed against ${data.year}.`
						: 'No receipts filed yet.'
				: `Nothing matches “${query}”.`}
		/>
	</section>
</div>

<style>
	.app {
		max-width: 1180px;
		margin: 0 auto;
	}
	.head {
		padding: 16px var(--gutter) 0;
	}
	.summary {
		margin-top: 4px;
		color: var(--md-on-surface-variant);
	}
	.outstanding {
		color: var(--md-on-surface);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	/* One row of chips that scrolls sideways rather than wrapping, so it does
	   not gain a line every January. It bleeds to the screen edges. */
	.filters {
		display: flex;
		align-items: center;
		gap: 8px;
		overflow-x: auto;
		/* Room for the chips' 48px touch targets above and below. */
		padding: 16px var(--gutter) 8px;
		scrollbar-width: none;
	}
	.filter-sep {
		flex: none;
		width: 1px;
		height: 32px;
		background: var(--md-outline-variant);
	}
	.filter-sep:first-child {
		display: none;
	}
	.chip {
		font-variant-numeric: tabular-nums;
	}

	.list {
		padding: 8px var(--gutter) 24px;
	}
</style>
