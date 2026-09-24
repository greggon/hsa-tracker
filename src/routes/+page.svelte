<script lang="ts">
	import { resolve } from '$app/paths';
	import type { CaptureRequest } from '$lib/components/CaptureSheet.svelte';
	import AppChrome from '$lib/components/AppChrome.svelte';
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

<div class="app">
	<AppChrome current="vault" bind:search={query} bind:capture providers={data.providers} />

	<div class="main" class:has-rail={data.stats.incomplete.length > 0}>
		<section class="hero">
			<h1 class="kick accent">Total eligible · unreimbursed</h1>
			<div class="total">
				<span class="figure">{hero.whole}<span class="frac">{hero.frac}</span></span>
				{#if data.stats.currentYearCents > 0}
					<span class="tag tag-accent delta">+{money(data.stats.currentYearCents)} this year</span>
				{/if}
			</div>

			<div class="meta">
				<span>{data.stats.receiptCount} receipt{data.stats.receiptCount === 1 ? '' : 's'}</span>
				{#if data.stats.oldestServiceDate}
					<span class="sep">·</span>
					<span>oldest {pretty(data.stats.oldestServiceDate)}</span>
				{/if}
				{#if data.stats.documentedCents > 0}
					<span class="sep">·</span>
					<span class="documented">{money(data.stats.documentedCents)} fully documented</span>
				{/if}
				{#if data.stats.incomplete.length > 0}
					<span class="sep">·</span>
					<a href="#needs-a-field">
						{data.stats.incomplete.length}
						need{data.stats.incomplete.length === 1 ? 's' : ''} a field
					</a>
				{/if}
			</div>

			<VaultChart
				days={data.stats.days}
				chart={data.stats.chart}
				totalCents={data.stats.totalCents}
			/>
		</section>

		{#if data.stats.incomplete.length > 0}
			<aside class="rail" id="needs-a-field">
				<h2 class="kick">Needs a field · {data.stats.incomplete.length}</h2>
				<ul class="needs">
					{#each data.stats.incomplete as r (r.id)}
						<li>
							<a
								class="card elev-sm need"
								href={resolve('/receipts/[id=integer]', { id: String(r.id) })}
							>
								<span class="need-what">{REASON_LABEL[r.reasons[0]]}</span>
								<span class="need-who">
									{r.provider ?? 'No provider'} · {prettyShort(r.serviceDate)}
								</span>
							</a>
						</li>
					{/each}
				</ul>
				{#if data.stats.undocumentedCents > 0}
					<p class="rail-note">
						{money(data.stats.undocumentedCents)} of your total isn't fully documented yet.
					</p>
				{/if}
			</aside>
		{/if}
	</div>

	<section class="filed-section">
		<div class="filed-head">
			<h2 class="kick">{normalised === '' ? 'Recently filed' : 'Matching receipts'}</h2>
			{#if normalised === ''}
				<a class="filed-count" href={resolve('/receipts')}>
					All {data.expenses.length} receipt{data.expenses.length === 1 ? '' : 's'} →
				</a>
			{:else}
				<span class="filed-count">{matches.length} of {data.expenses.length}</span>
			{/if}
		</div>

		{#if data.expenses.length === 0}
			<p class="empty">
				No receipts yet.
				<button type="button" class="btn btn-ghost" onclick={() => (capture = 'form')}>
					File your first one.
				</button>
			</p>
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

	/* `.kick` lives in app.css; used on headings here, so undo their defaults. */
	h1.kick,
	h2.kick {
		margin: 0;
		font-weight: 400;
	}
	.kick.accent {
		color: var(--color-accent);
	}

	/* — main split — */
	.main {
		display: grid;
		/* The rail is only rendered when something needs a field; without it the
		   hero takes the full width rather than leaving a reserved gutter. */
		grid-template-columns: minmax(0, 1fr);
	}
	.main.has-rail {
		grid-template-columns: minmax(0, 1fr) 296px;
	}
	.hero {
		min-width: 0;
		padding: 32px var(--gutter) 24px;
		/* --color-accent-800 is the artboard's rgba(66,58,106) bloom. */
		background: radial-gradient(
			115% 150% at 3% 0%,
			color-mix(in srgb, var(--color-accent-800) 50%, transparent),
			transparent 60%
		);
	}
	.total {
		display: flex;
		align-items: flex-end;
		gap: 14px;
		margin-top: 12px;
		flex-wrap: wrap;
	}
	.figure {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 64px;
		line-height: 1;
		letter-spacing: -0.035em;
		font-variant-numeric: tabular-nums;
	}
	.frac {
		font-size: 34px;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
	.delta {
		margin-bottom: 11px;
	}
	.meta {
		margin-top: 15px;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: center;
		font-size: 12.5px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
	}
	.meta .sep {
		opacity: 0.4;
	}
	/* Paragraph-size accent text uses a deep ramp step, per the system's
	   contrast note — the accent itself is tuned for chrome, not body copy. */
	.documented {
		color: var(--color-accent-300);
	}

	/* — rail — */
	.rail {
		border-left: 1px solid var(--color-rule);
		padding: 32px 24px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.needs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.need {
		width: 100%;
		padding: 10px 12px;
		gap: 4px;
		text-align: left;
		color: inherit;
		text-decoration: none;
	}
	.need:hover {
		background: color-mix(in srgb, var(--color-text) 7%, transparent);
	}
	.need-what {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 13px;
	}
	.need-who {
		font-size: 12.5px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
	}
	.rail-note {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}

	/* — recently filed — */
	.filed-section {
		padding: 6px var(--gutter) 26px;
	}
	.filed-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 12px 0 4px;
	}
	.filed-count {
		font-size: 12.5px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
	}
	.empty {
		color: color-mix(in srgb, var(--color-text) 55%, transparent);
	}

	@media (max-width: 900px) {
		.main {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail {
			border-left: none;
			border-top: 1px solid var(--color-rule);
		}
	}

	/* Phone: tab bar replaces the nav links, rows replace the table. */
	@media (max-width: 700px) {
		.hero {
			padding: 26px var(--gutter) 20px;
		}
		/* The rail becomes a sideways strip, so a long list of incomplete
		   receipts does not push "Recently filed" off the screen. */
		.rail {
			padding: 22px 0 22px var(--gutter);
		}
		.needs {
			flex-direction: row;
			overflow-x: auto;
			padding-right: var(--gutter);
			scroll-snap-type: x proximity;
		}
		.needs li {
			flex: none;
			width: 210px;
			scroll-snap-align: start;
		}
		.need {
			min-height: 56px;
			justify-content: center;
		}
		.need-what {
			font-size: 14px;
		}
		.rail-note {
			padding-right: var(--gutter);
		}
		.filed-section {
			padding: 6px var(--gutter) 20px;
		}
		.filed-count {
			display: flex;
			align-items: center;
			min-height: 44px;
		}
		.figure {
			font-size: 48px;
		}
		.frac {
			font-size: 27px;
		}
	}
</style>
