<script lang="ts">
	/**
	 * The unreimbursed total over time: a cumulative daily line, or per-year
	 * bars. The projection maths lives in `$lib/chart` so the hover readout and
	 * the server-rendered path agree by construction.
	 */
	import { projectToViewBox, readChartAt, type ChartGeometry, type DayPoint } from '$lib/chart';
	import { money, pretty } from '$lib/format';
	import Icon from './Icon.svelte';

	interface Props {
		days: DayPoint[];
		chart: ChartGeometry;
		/** The hero figure, named in the chart's accessible description. */
		totalCents: number;
	}

	let { days, chart, totalCents }: Props = $props();

	let mode = $state<'cumulative' | 'year'>('cumulative');

	/** What the pointer is over, in chart coordinates plus the values there. */
	let hover = $state<{
		xPercent: number;
		yPercent: number;
		date: string;
		cumulativeCents: number;
		dayCents: number | null;
	} | null>(null);

	function onMove(event: PointerEvent) {
		if (mode !== 'cumulative' || days.length === 0) {
			hover = null;
			return;
		}

		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (box.width === 0) return;
		const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));

		const reading = readChartAt(days, chart.startDate, chart.endDate, fraction);
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

	const axisLabel = $derived(
		chart.years.length > 0 ? `${chart.years[0]} to ${chart.years.at(-1)}` : ''
	);
</script>

<div class="chart-head">
	<h2 class="md-title-medium">Unreimbursed over time</h2>
	{#if days.length > 0}
		<span class="seg" role="radiogroup" aria-label="Chart mode">
			<label class="seg-opt">
				<input type="radio" name="chartMode" value="cumulative" bind:group={mode} />
				<span class="seg-check"><Icon name="check" size={18} /></span>
				Cumulative
			</label>
			<label class="seg-opt">
				<input type="radio" name="chartMode" value="year" bind:group={mode} />
				<span class="seg-check"><Icon name="check" size={18} /></span>
				Per year
			</label>
		</span>
	{/if}
</div>

{#if days.length === 0}
	<p class="chart-empty">Nothing filed yet. The line starts with your first receipt.</p>
{:else}
	<div
		class="chart-wrap"
		onpointerdown={onMove}
		onpointermove={onMove}
		onpointerleave={(e) => {
			// A finger lifting also "leaves"; keep its reading up until the next
			// touch, since there is no hover to bring it back.
			if (e.pointerType === 'mouse') hover = null;
		}}
		role="presentation"
	>
		<svg
			class="chart"
			viewBox="0 0 1000 200"
			width="100%"
			height="180"
			preserveAspectRatio="none"
			role="img"
			aria-label={mode === 'cumulative'
				? `Cumulative unreimbursed total by day, ${axisLabel}, reaching ${money(totalCents)}`
				: `Unreimbursed spend per year, ${axisLabel}`}
		>
			<defs>
				<linearGradient id="hsaGrad" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="var(--md-primary)" stop-opacity=".2" />
					<stop offset="1" stop-color="var(--md-primary)" stop-opacity="0" />
				</linearGradient>
			</defs>
			<path
				d="M0 199h1000M0 149h1000M0 99h1000M0 49h1000"
				class="grid"
				vector-effect="non-scaling-stroke"
			/>
			{#if mode === 'cumulative'}
				<path d={chart.areaPath} fill="url(#hsaGrad)" />
				<path d={chart.linePath} class="line" vector-effect="non-scaling-stroke" />
			{:else}
				<path d={chart.barsPath} class="bars" vector-effect="non-scaling-stroke" />
			{/if}
		</svg>
		{#if hover}
			<div class="guide" style="left:{hover.xPercent}%"></div>
			<div class="dot" style="left:{hover.xPercent}%;top:{hover.yPercent}%"></div>
			<div class="readout" style="left:{hover.xPercent}%" class:flip={hover.xPercent > 60}>
				<span class="readout-date">{pretty(hover.date)}</span>
				<span class="readout-total">{money(hover.cumulativeCents)}</span>
				{#if hover.dayCents}
					<span class="readout-day">+{money(hover.dayCents)} filed</span>
				{/if}
			</div>
		{/if}
	</div>
	{#if mode === 'cumulative'}
		<!-- Placed by date: a quiet stretch takes the width it actually took. -->
		<div class="axis axis-timed">
			{#each chart.ticks as t (t.label)}
				<span style="left:{t.xPercent}%">{t.label}</span>
			{/each}
		</div>
	{:else}
		<div class="axis">
			{#each chart.years as year (year)}
				<span>{year}</span>
			{/each}
		</div>
	{/if}
	<!-- Every year will not fit on a phone; the span is what matters there. -->
	<div class="axis axis-compact">
		<span>{chart.ticks[0]?.label}</span>
		{#if mode === 'cumulative'}<span>Touch the line to read a day</span>{/if}
		<span>today</span>
	</div>
{/if}

<style>
	.chart-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.chart-head .seg {
		width: 280px;
	}
	/* The readout overlay is HTML, not SVG: preserveAspectRatio="none" would
	   stretch any text or circle drawn inside the viewBox. Percentages map
	   exactly onto it, so the marker still lands on the line. */
	.chart-wrap {
		position: relative;
		/* Vertical drags still scroll the page; horizontal ones scrub the line
		   instead of being taken by the browser and cancelling the pointer. */
		touch-action: pan-y;
	}
	.guide {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--md-outline);
		pointer-events: none;
	}
	.dot {
		position: absolute;
		width: 9px;
		height: 9px;
		margin: -4.5px 0 0 -4.5px;
		border-radius: 99px;
		background: var(--md-primary);
		box-shadow: 0 0 0 3px var(--md-surface-container-low);
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
		border-radius: var(--md-shape-md);
		background: var(--md-inverse-surface);
		color: var(--md-inverse-on-surface);
		pointer-events: none;
		white-space: nowrap;
	}
	/* Near the right edge, hang the readout off the other side of the guide. */
	.readout.flip {
		margin-left: 0;
		transform: translateX(-100%) translateX(-10px);
	}
	.readout-date {
		font: 400 12px/16px var(--md-font);
		opacity: 0.8;
	}
	.readout-total {
		font: 500 16px/20px var(--md-font);
		font-variant-numeric: tabular-nums;
	}
	.readout-day {
		font: 400 12px/16px var(--md-font);
		color: var(--md-inverse-primary);
		font-variant-numeric: tabular-nums;
	}
	.chart {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--md-outline-variant);
		stroke-dasharray: 4 4;
		stroke-width: 1;
		fill: none;
	}
	.line {
		fill: none;
		stroke: var(--md-primary);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.bars {
		fill: var(--md-primary);
		stroke: none;
		stroke-width: 1;
	}
	.axis {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
		font: 400 12px/16px var(--md-font);
		letter-spacing: 0.4px;
		color: var(--md-on-surface-variant);
	}
	/* Ticks carry their own position, so they are placed rather than distributed. */
	.axis-timed {
		display: block;
		position: relative;
		height: 16px;
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
		color: var(--md-on-surface-variant);
	}

	@media (max-width: 700px) {
		/* The toggle spans the width, one half per mode. */
		.chart-head .seg {
			width: 100%;
		}
		.chart {
			height: 110px;
		}
		.axis {
			display: none;
		}
		.axis-compact {
			display: flex;
		}
	}
</style>
