<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
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
	<header class="nav">
		<a class="brand" href={resolve('/')}>
			<Icon name="vault" size={17} />
			HSA Saver
		</a>
		<nav class="links">
			<a href={resolve('/')}>Vault</a>
			<a href={resolve('/receipts')} aria-current="page">Receipts</a>
		</nav>
		<div class="nav-right">
			<label class="visually-hidden" for="receipt-search">Search provider or amount</label>
			<input
				id="receipt-search"
				class="input search"
				type="search"
				placeholder="Search provider or amount"
				bind:value={query}
			/>
		</div>
	</header>

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

<nav class="tabs" aria-label="Sections">
	<a class="tab" href={resolve('/')}><Icon name="vault" size={21} width={1.7} />Vault</a>
	<span class="tab current"><Icon name="receipt" size={21} width={1.7} />Receipts</span>
</nav>

<style>
	.app {
		max-width: 1180px;
		margin: 0 auto;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		padding: 14px 26px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-text) 7%, transparent);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 17px;
		letter-spacing: -0.02em;
		color: var(--color-text);
		text-decoration: none;
	}
	.brand :global(svg) {
		color: var(--color-accent);
	}
	.links {
		display: flex;
		gap: 20px;
		font-size: 13.5px;
	}
	.links a {
		text-decoration: none;
		color: color-mix(in srgb, var(--color-text) 60%, transparent);
	}
	.links a[aria-current='page'] {
		color: var(--color-accent);
	}
	.nav-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.search {
		width: 220px;
		min-height: 32px;
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

	/* — bottom tab bar: phones only — */
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

	@media (max-width: 700px) {
		.app {
			padding-bottom: 92px;
		}
		.links {
			display: none;
		}
		.tabs {
			display: flex;
		}
		.nav {
			padding: 14px 20px;
		}
		.nav-right {
			margin-left: 0;
			width: 100%;
		}
		.search {
			flex: 1;
			width: auto;
		}
		.head {
			padding: 22px 20px 0;
		}
		.list {
			padding: 16px 20px 20px;
		}
	}
</style>
