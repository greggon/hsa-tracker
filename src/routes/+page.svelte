<script lang="ts">
	import { resolve } from '$app/paths';
	import type { CaptureRequest } from '$lib/components/CaptureSheet.svelte';
	import AppChrome from '$lib/components/AppChrome.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ReceiptList from '$lib/components/ReceiptList.svelte';
	import VaultChart from '$lib/components/VaultChart.svelte';
	import { money, pretty, prettyShort, splitMoney } from '$lib/format';
	import { searchReceipts } from '$lib/search';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type IncompleteReason = PageProps['data']['stats']['incomplete'][number]['reasons'][number];

	let capture = $state<CaptureRequest>(null);
	let query = $state('');

	/** Rows shown before searching — "Recently filed" is a slice, not the ledger. */
	const RECENT = 8;

	const normalised = $derived(query.trim().toLowerCase());

	const matches = $derived(searchReceipts(data.expenses, query));

	const visible = $derived(normalised === '' ? matches.slice(0, RECENT) : matches);

	const REASON_LABEL: Record<IncompleteReason, string> = {
		amount: 'Amount not readable',
		provider: 'No provider recorded',
		document: 'No receipt image'
	};

	const hero = $derived(splitMoney(data.stats.totalCents));
</script>

<svelte:head><title>Vault · HSA Saver</title></svelte:head>

<div class="app">
	<AppChrome current="vault" bind:search={query} bind:capture providers={data.providers} />

	<div class="main" class:has-rail={data.stats.incomplete.length > 0}>
		<div class="primary">
			<section class="hero" aria-labelledby="hero-label">
				<h1 class="md-title-small" id="hero-label">Total eligible · unreimbursed</h1>
				<p class="figure">{hero.whole}<span class="frac">{hero.frac}</span></p>
				{#if data.stats.currentYearCents > 0}
					<div>
						<span class="chip assist">
							<Icon name="trendingUp" size={18} />
							+{money(data.stats.currentYearCents)} this year
						</span>
					</div>
				{/if}
				<p class="meta md-body-medium">
					{data.stats.receiptCount} receipt{data.stats.receiptCount === 1 ? '' : 's'}
					{#if data.stats.oldestServiceDate}
						· oldest {pretty(data.stats.oldestServiceDate)}
					{/if}
					{#if data.stats.documentedCents > 0}
						· {money(data.stats.documentedCents)} fully documented
					{/if}
				</p>
			</section>

			<section class="card chart-card">
				<VaultChart
					days={data.stats.days}
					chart={data.stats.chart}
					totalCents={data.stats.totalCents}
				/>
			</section>
		</div>

		{#if data.stats.incomplete.length > 0}
			<aside class="rail" id="needs-a-field" aria-labelledby="needs-heading">
				<div class="section-head">
					<h2 class="md-title-medium" id="needs-heading">Needs a field</h2>
					<span class="md-label-large on-surface-variant">{data.stats.incomplete.length}</span>
				</div>
				<ul class="needs">
					{#each data.stats.incomplete as r (r.id)}
						<li>
							<a class="need" href={resolve('/receipts/[id=integer]', { id: String(r.id) })}>
								<Icon name="warning" size={20} />
								<span class="need-text">
									<span class="md-title-small">{REASON_LABEL[r.reasons[0]]}</span>
									<span class="md-body-medium need-who">
										{r.provider ?? 'No provider'} · {prettyShort(r.serviceDate)}
									</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
				{#if data.stats.undocumentedCents > 0}
					<p class="rail-note md-body-small">
						{money(data.stats.undocumentedCents)} of your total isn't fully documented yet.
					</p>
				{/if}
			</aside>
		{/if}
	</div>

	<section class="filed-section" aria-labelledby="filed-heading">
		<div class="section-head">
			<h2 class="md-title-medium" id="filed-heading">
				{normalised === '' ? 'Recently filed' : 'Matching receipts'}
			</h2>
			{#if normalised === ''}
				<a class="btn btn-text" href={resolve('/receipts')}>All {data.expenses.length}</a>
			{:else}
				<span class="md-label-large on-surface-variant">
					{matches.length} of {data.expenses.length}
				</span>
			{/if}
		</div>

		{#if data.expenses.length === 0}
			<div class="empty">
				<p class="md-body-medium on-surface-variant">No receipts yet.</p>
				<button type="button" class="btn btn-tonal" onclick={() => (capture = 'form')}>
					<Icon name="add" size={18} />
					File your first one
				</button>
			</div>
		{:else}
			<ReceiptList rows={visible} empty="Nothing matches “{query}”." />
		{/if}
	</section>
</div>

<style>
	.app {
		max-width: 1180px;
		margin: 0 auto;
	}

	/* — main split — */
	.main {
		display: grid;
		/* The rail is only rendered when something needs a field; without it the
		   cards take the full width rather than leaving a reserved gutter. */
		grid-template-columns: minmax(0, 1fr);
		gap: 24px;
		padding: 8px var(--gutter) 0;
	}
	.main.has-rail {
		grid-template-columns: minmax(0, 1fr) 320px;
	}
	.primary {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 24px;
		border-radius: var(--md-shape-xl);
		background: var(--md-surface-container-high);
		color: var(--md-on-surface);
	}
	.figure {
		font: 400 57px/64px var(--md-font);
		letter-spacing: -0.25px;
		font-variant-numeric: tabular-nums;
	}
	.frac {
		font-size: 32px;
		opacity: 0.7;
	}
	.meta {
		color: var(--md-on-surface-variant);
	}
	.hero .chip :global(svg) {
		color: var(--md-primary);
	}
	/* A flat tonal container: no outline, no shadow. The surface step matches
	   the ring the chart draws around its hover dot. */
	.chart-card {
		background: var(--md-surface-container-low);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 48px;
	}

	/* — rail — */
	.rail {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.needs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.need {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 16px;
		border-radius: var(--md-shape-md);
		background: var(--md-primary-container);
		color: var(--md-on-primary-container);
		text-decoration: none;
	}
	.need:hover {
		box-shadow: var(--md-state-hover);
	}
	.need :global(svg) {
		margin-top: 2px;
	}
	.need-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.need-who {
		opacity: 0.8;
	}
	.rail-note {
		color: var(--md-on-surface-variant);
	}

	/* — recently filed — */
	.filed-section {
		margin-top: 24px;
		padding: 0 var(--gutter);
	}
	.filed-section .section-head {
		margin-right: -12px;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		padding: 16px 0;
	}

	@media (max-width: 900px) {
		.main.has-rail {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 700px) {
		.hero {
			padding: 20px;
		}
		.figure {
			font-size: 45px;
			line-height: 52px;
			letter-spacing: 0;
		}
		.frac {
			font-size: 28px;
		}
		/* The rail becomes a sideways strip, so a long list of incomplete
		   receipts does not push "Recently filed" off the screen. */
		.rail {
			margin-inline: calc(-1 * var(--gutter));
		}
		.rail .section-head,
		.rail-note {
			padding-inline: var(--gutter);
		}
		.needs {
			flex-direction: row;
			overflow-x: auto;
			padding-inline: var(--gutter);
			scroll-snap-type: x proximity;
			scroll-padding-inline: var(--gutter);
			scrollbar-width: none;
		}
		.needs li {
			flex: none;
			width: 240px;
			scroll-snap-align: start;
		}
		.need {
			height: 100%;
		}
	}
</style>
