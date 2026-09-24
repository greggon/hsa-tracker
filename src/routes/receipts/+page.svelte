<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppChrome from '$lib/components/AppChrome.svelte';
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
		<h1>{data.year ?? 'All'} receipts</h1>
		<p class="summary">
			{matches.length} receipt{matches.length === 1 ? '' : 's'}
			<span class="sep">·</span>
			<span class="outstanding">{money(outstandingCents)} unreimbursed</span>
			{#if onlyNeeding}
				<span class="sep">·</span>
				<a href="{resolve('/receipts')}{listQuery({ year: data.year })}">Show all</a>
			{:else if needingAField > 0}
				<span class="sep">·</span>
				<a href="{resolve('/receipts')}{listQuery({ year: data.year, needs: true })}">
					{needingAField} need{needingAField === 1 ? 's' : ''} a field
				</a>
			{/if}
		</p>

		{#if data.years.length > 1}
			<nav class="years" aria-label="Filter by year">
				<a
					class="year"
					class:current={data.year === null}
					aria-current={data.year === null ? 'page' : undefined}
					href="{resolve('/receipts')}{listQuery({ needs: onlyNeeding })}">All</a
				>
				{#each data.years as year (year)}
					<a
						class="year"
						class:current={data.year === year}
						aria-current={data.year === year ? 'page' : undefined}
						href="{resolve('/receipts')}{listQuery({ year, needs: onlyNeeding })}"
					>
						{year}
					</a>
				{/each}
			</nav>
		{/if}
	</section>

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
		padding: 28px var(--gutter) 0;
	}
	h1 {
		font-size: 25px;
		margin: 0;
	}
	.summary {
		margin: 10px 0 0;
		font-size: 12.5px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
	}
	.summary .sep {
		opacity: 0.4;
	}
	/* Paragraph-size accent text takes a deep ramp step, per the system's
	   contrast note — the accent itself is tuned for chrome, not body copy. */
	.outstanding {
		color: var(--color-accent-300);
		font-variant-numeric: tabular-nums;
	}

	.years {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: 18px;
	}
	.year {
		padding: 5px 12px;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-divider);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--color-text) 70%, transparent);
		text-decoration: none;
	}
	.year:hover {
		background: color-mix(in srgb, var(--color-text) 7%, transparent);
	}
	.year.current {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.list {
		padding: 18px var(--gutter) 26px;
	}

	@media (max-width: 700px) {
		.head {
			padding: 22px var(--gutter) 0;
		}
		/* One row that scrolls sideways, rather than a block that gains a line
		   every January. It bleeds to the screen edges so it reads as a strip. */
		.years {
			flex-wrap: nowrap;
			overflow-x: auto;
			margin-inline: calc(-1 * var(--gutter));
			padding-inline: var(--gutter);
			scrollbar-width: none;
		}
		.year {
			flex: none;
			display: flex;
			align-items: center;
			min-height: 44px;
			padding: 0 16px;
			font-size: 14px;
		}
		.list {
			padding: 12px var(--gutter) 20px;
		}
	}
</style>
