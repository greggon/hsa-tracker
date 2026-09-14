<script lang="ts">
	import { resolve } from '$app/paths';
	import AppChrome from '$lib/components/AppChrome.svelte';
	import ReceiptList from '$lib/components/ReceiptList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let query = $state('');

	const normalised = $derived(query.trim().toLowerCase());

	const matches = $derived(
		normalised === ''
			? data.receipts
			: data.receipts.filter((e) => {
					const amount = e.amountCents == null ? '' : (e.amountCents / 100).toFixed(2);
					return (
						(e.provider ?? '').toLowerCase().includes(normalised) ||
						amount.includes(normalised.replace(/[$,]/g, ''))
					);
				})
	);

	const money = (cents: number) =>
		(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

	/** Only receipts still owed to you count toward the figure the vault shows. */
	const outstandingCents = $derived(
		matches.reduce((sum, e) => sum + (e.reimbursedAt ? 0 : (e.amountCents ?? 0)), 0)
	);

	const needingAField = $derived(
		matches.filter((e) => !e.reimbursedAt && e.reasons.length > 0).length
	);
</script>

<svelte:head><title>Receipts · HSA Saver</title></svelte:head>

<div class="app">
	<AppChrome current="receipts" bind:search={query} />

	<section class="head">
		<h1>{data.year ?? 'All'} receipts</h1>
		<p class="summary">
			{matches.length} receipt{matches.length === 1 ? '' : 's'}
			<span class="sep">·</span>
			<span class="outstanding">{money(outstandingCents)} unreimbursed</span>
			{#if needingAField > 0}
				<span class="sep">·</span>
				<span class="needs">{needingAField} need{needingAField === 1 ? 's' : ''} a field</span>
			{/if}
		</p>

		{#if data.years.length > 1}
			<div class="years">
				<a class="year" class:current={data.year === null} href={resolve('/receipts')}>All</a>
				{#each data.years as year (year)}
					<a
						class="year"
						class:current={data.year === year}
						href="{resolve('/receipts')}?year={year}"
					>
						{year}
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<section class="list">
		<ReceiptList
			rows={matches}
			empty={normalised === ''
				? data.year
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
		padding: 28px 26px 0;
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
	.needs {
		color: var(--color-text);
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
		padding: 18px 26px 26px;
	}

	@media (max-width: 700px) {
		.app {
			padding-bottom: 92px;
		}
		.head {
			padding: 22px 20px 0;
		}
		.list {
			padding: 16px 20px 20px;
		}
	}
</style>
