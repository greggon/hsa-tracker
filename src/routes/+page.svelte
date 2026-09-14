<script lang="ts">
	import { resolve } from '$app/paths';
	import { projectToViewBox, readChartAt } from '$lib/chart';
	import ReceiptList from '$lib/components/ReceiptList.svelte';
	import AppChrome from '$lib/components/AppChrome.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let chrome = $state<ReturnType<typeof AppChrome> | null>(null);
	type IncompleteReason = PageProps['data']['stats']['incomplete'][number]['reasons'][number];

	//Vault
	let chartMode = $state<'cumulative' | 'year'>('cumulative');
	let query = $state('');

	/** Rows shown before searching — "Recently filed" is a slice, not the ledger. */
	const RECENT = 8;

	const normalised = $derived(query.trim().toLowerCase());

	const matches = $derived(
		normalised === ''
			? data.expenses
			: data.expenses.filter((e) => {
					const amount = e.amountCents == null ? '' : (e.amountCents / 100).toFixed(2);
					return (
						(e.provider ?? '').toLowerCase().includes(normalised) ||
						amount.includes(normalised.replace(/[$,]/g, ''))
					);
				})
	);

	const visible = $derived(normalised === '' ? matches.slice(0, RECENT) : matches);

	/** An em dash stands in for an amount that could not be read off the receipt. */
	const money = (cents: number | null) =>
		cents == null
			? '—'
			: (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

	/** The hero sets the cents smaller than the dollars, so they render apart. */
	function splitMoney(cents: number) {
		const full = money(cents);
		const dot = full.lastIndexOf('.');
		return dot === -1
			? { whole: full, frac: '' }
			: { whole: full.slice(0, dot), frac: full.slice(dot) };
	}

	const pretty = (iso: string) =>
		new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});

	/** Day and month only — the rail is about recent problems, so the year is noise. */
	const prettyShort = (iso: string) =>
		new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

	const REASON_LABEL: Record<IncompleteReason, string> = {
		amount: 'Amount not readable',
		provider: 'No provider recorded',
		document: 'No receipt image'
	};

	/** What the pointer is over, in chart coordinates plus the values there. */
	let hover = $state<{
		xPercent: number;
		yPercent: number;
		date: string;
		cumulativeCents: number;
		dayCents: number | null;
	} | null>(null);

	function onChartMove(event: PointerEvent) {
		const chart = data.stats.chart;
		if (chartMode !== 'cumulative' || data.stats.days.length === 0) {
			hover = null;
			return;
		}

		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (box.width === 0) return;
		const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));

		const reading = readChartAt(data.stats.days, chart.startDate, chart.endDate, fraction);
		if (!reading) {
			hover = null;
			return;
		}

		hover = {
			xPercent: fraction * 100,
			// The viewBox is 200 tall and stretches to fill, so a percentage of it
			// maps exactly onto the rendered box however wide that is.
			yPercent: (projectToViewBox(reading.cumulativeCents, chart.cumulativeMaxCents) / 200) * 100,
			date: reading.date,
			cumulativeCents: reading.cumulativeCents,
			dayCents: reading.dayCents
		};
	}

	const hoverDate = $derived(
		hover
			? new Date(hover.date + 'T00:00:00').toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: ''
	);

	const hero = $derived(splitMoney(data.stats.totalCents));
	const axisLabel = $derived(
		data.stats.chart.years.length > 0
			? `${data.stats.chart.years[0]} to ${data.stats.chart.years.at(-1)}`
			: ''
	);
</script>

<div class="app">
	<AppChrome current="vault" bind:search={query} bind:this={chrome} />

	<div class="main" class:has-rail={data.stats.incomplete.length > 0}>
		<section class="hero">
			<div class="kick accent">Total eligible · unreimbursed</div>
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

			<div class="chart-head">
				{#if data.stats.days.length > 0}
					<span class="seg">
						<label class="seg-opt">
							<input type="radio" name="chartMode" value="cumulative" bind:group={chartMode} />
							Cumulative
						</label>
						<label class="seg-opt">
							<input type="radio" name="chartMode" value="year" bind:group={chartMode} />
							Per year
						</label>
					</span>
				{/if}
			</div>

			{#if data.stats.days.length === 0}
				<p class="chart-empty">Nothing filed yet. The line starts with your first receipt.</p>
			{:else}
				<div
					class="chart-wrap"
					onpointermove={onChartMove}
					onpointerleave={() => (hover = null)}
					role="presentation"
				>
					<svg
						class="chart"
						viewBox="0 0 1000 200"
						width="100%"
						height="180"
						preserveAspectRatio="none"
						role="img"
						aria-label={chartMode === 'cumulative'
							? `Cumulative unreimbursed total by day, ${axisLabel}, reaching ${money(data.stats.totalCents)}`
							: `Unreimbursed spend per year, ${axisLabel}`}
					>
						<defs>
							<linearGradient id="hsaGrad" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0" stop-color="var(--color-accent)" stop-opacity=".32" />
								<stop offset="1" stop-color="var(--color-accent)" stop-opacity="0" />
							</linearGradient>
						</defs>
						<path
							d="M0 199h1000M0 149h1000M0 99h1000M0 49h1000"
							class="grid"
							vector-effect="non-scaling-stroke"
						/>
						{#if chartMode === 'cumulative'}
							<path d={data.stats.chart.areaPath} fill="url(#hsaGrad)" />
							<path d={data.stats.chart.linePath} class="line" vector-effect="non-scaling-stroke" />
						{:else}
							<path d={data.stats.chart.barsPath} class="bars" vector-effect="non-scaling-stroke" />
						{/if}
					</svg>
					{#if hover}
						<div class="guide" style="left:{hover.xPercent}%"></div>
						<div class="dot" style="left:{hover.xPercent}%;top:{hover.yPercent}%"></div>
						<div class="readout" style="left:{hover.xPercent}%" class:flip={hover.xPercent > 60}>
							<span class="readout-date">{hoverDate}</span>
							<span class="readout-total">{money(hover.cumulativeCents)}</span>
							{#if hover.dayCents}
								<span class="readout-day">+{money(hover.dayCents)} filed</span>
							{/if}
						</div>
					{/if}
				</div>
				{#if chartMode === 'cumulative'}
					<!-- Placed by date: a quiet stretch takes the width it actually took. -->
					<div class="axis axis-timed">
						{#each data.stats.chart.ticks as t (t.label)}
							<span style="left:{t.xPercent}%">{t.label}</span>
						{/each}
					</div>
				{:else}
					<div class="axis">
						{#each data.stats.chart.years as year (year)}
							<span>{year}</span>
						{/each}
					</div>
				{/if}
				<!-- Every year will not fit on a phone; the span is what matters there. -->
				<div class="axis axis-compact">
					<span>{data.stats.chart.ticks[0]?.label}</span>
					<span>today</span>
				</div>
			{/if}
		</section>

		{#if data.stats.incomplete.length > 0}
			<aside class="rail" id="needs-a-field">
				<div class="kick">Needs a field · {data.stats.incomplete.length}</div>
				<ul class="needs">
					{#each data.stats.incomplete as r (r.id)}
						<li>
							<a class="card elev-sm need" href={resolve('/receipts/[id]', { id: String(r.id) })}>
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
			<span class="kick">{normalised === '' ? 'Recently filed' : 'Matching receipts'}</span>
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
				<button type="button" class="btn btn-ghost" onclick={() => chrome?.open()}
					>File your first one.</button
				>
			</p>
		{:else}
			<ReceiptList rows={visible} empty="Nothing matches “{query}”." />
		{/if}
	</section>
</div>

<!-- Bottom tab bar: phones only. -->

<style>
	.app {
		max-width: 1180px;
		margin: 0 auto;
	}

	/* The artboard's `.kick` — an uppercase micro-label above each block. */
	.kick {
		font-size: 10px;
		line-height: 1;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
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
		padding: 32px 28px 24px;
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

	.chart-head {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-4);
		flex-wrap: wrap;
		min-height: 30px;
		margin: 24px 0 12px;
	}
	/* The readout overlay is HTML, not SVG: preserveAspectRatio="none" would
	   stretch any text or circle drawn inside the viewBox. Percentages map
	   exactly onto it, so the marker still lands on the line. */
	.chart-wrap {
		position: relative;
	}
	.guide {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: color-mix(in srgb, var(--color-accent) 55%, transparent);
		pointer-events: none;
	}
	.dot {
		position: absolute;
		width: 9px;
		height: 9px;
		margin: -4.5px 0 0 -4.5px;
		border-radius: 99px;
		background: var(--color-accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 25%, transparent);
		pointer-events: none;
	}
	.readout {
		position: absolute;
		top: 0;
		margin-left: 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 7px 10px;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		box-shadow: var(--shadow-md);
		pointer-events: none;
		white-space: nowrap;
	}
	/* Near the right edge, hang the readout off the other side of the guide. */
	.readout.flip {
		margin-left: 0;
		transform: translateX(-100%) translateX(-10px);
	}
	.readout-date {
		font-size: 11px;
		color: color-mix(in srgb, var(--color-text) 55%, transparent);
	}
	.readout-total {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
	.readout-day {
		font-size: 11px;
		color: var(--color-accent-300);
		font-variant-numeric: tabular-nums;
	}
	.chart {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: color-mix(in srgb, var(--color-text) 7%, transparent);
		stroke-width: 1;
		fill: none;
	}
	.line {
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 2.5;
		stroke-linejoin: round;
	}
	.bars {
		fill: color-mix(in srgb, var(--color-accent) 50%, transparent);
		stroke: var(--color-accent);
		stroke-width: 1;
	}
	.axis {
		display: flex;
		justify-content: space-between;
		margin-top: 9px;
		font-size: 10.5px;
		color: color-mix(in srgb, var(--color-text) 38%, transparent);
	}
	/* Ticks carry their own position, so they are placed rather than distributed. */
	.axis-timed {
		display: block;
		position: relative;
		height: 13px;
	}
	.axis-timed span {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}
	.axis-timed span:first-child {
		transform: none;
	}
	.axis-compact {
		display: none;
	}
	.chart-empty {
		margin: 0;
		padding: 52px 0;
		font-size: 13px;
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}

	/* — rail — */
	.rail {
		border-left: 1px solid color-mix(in srgb, var(--color-text) 7%, transparent);
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
		font-size: 11.5px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
	}
	.rail-note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}

	/* — recently filed — */
	.filed-section {
		padding: 6px 26px 26px;
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
			border-top: 1px solid color-mix(in srgb, var(--color-text) 7%, transparent);
		}
	}

	/* Phone: tab bar replaces the nav links, rows replace the table. */
	@media (max-width: 700px) {
		.app {
			padding-bottom: 92px;
		}
		.hero {
			padding: 26px 20px 20px;
		}
		.rail {
			padding: 26px 20px;
		}
		.filed-section {
			padding: 6px 20px 20px;
		}
		.figure {
			font-size: 48px;
		}
		.frac {
			font-size: 27px;
		}
		.chart {
			height: 94px;
		}
		.axis {
			display: none;
		}
		.axis-compact {
			display: flex;
		}
	}

	@media (max-width: 700px) {
	}
</style>
