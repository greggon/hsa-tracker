<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Cropper from 'svelte-easy-crop';
	import Icon from '$lib/components/Icon.svelte';
	import { projectToViewBox, readChartAt } from '$lib/chart';
	import ReceiptList from '$lib/components/ReceiptList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	type IncompleteReason = PageProps['data']['stats']['incomplete'][number]['reasons'][number];

	//Add sheet
	let addDialogEl = $state<HTMLDialogElement | null>(null);
	let addError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	let pickedFile = $state<File | null>(null);
	let canCrop = $state(false);
	let crop = $state({ x: 0, y: 0 });
	let zoom = $state(1);
	let aspect = $state(3 / 4);
	let pixels = $state<{ x: number; y: number; width: number; height: number } | null>(null);
	let amountText = $state('');
	let cameraInputEl = $state<HTMLInputElement | null>(null);

	/** The sheet is the capture flow: confirm the three fields, then the payoff. */
	type Filed = {
		amountCents: number | null;
		provider: string | null;
		serviceDate: string;
		totalBeforeCents: number;
		totalAfterCents: number;
	};
	let filed = $state<Filed | null>(null);

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

	const today = new Date().toLocaleDateString('en-CA');

	function resetAdd() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		pickedFile = null;
		canCrop = false;
		pixels = null;
		crop = { x: 0, y: 0 };
		zoom = 1;
		addError = null;
		amountText = '';
		filed = null;
	}

	function openAdd() {
		resetAdd();
		addDialogEl?.showModal();
	}

	/**
	 * The shutter. On a phone this hands straight to the native camera, which is
	 * a better capture surface than anything reachable from the browser — real
	 * optics, autofocus and HEIC, with no getUserMedia permission dance.
	 */
	function openCamera() {
		resetAdd();
		addDialogEl?.showModal();
		cameraInputEl?.click();
	}

	function closeAdd() {
		addDialogEl?.close();
		resetAdd();
	}

	function fileAnother() {
		resetAdd();
		cameraInputEl?.click();
	}

	function onPick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		pickedFile = f;
		pixels = null;
		crop = { x: 0, y: 0 };
		zoom = 1;

		if (f.type === 'application/pdf') {
			canCrop = false;
			previewUrl = null;
			return;
		}

		previewUrl = URL.createObjectURL(f);
		canCrop = true;
	}

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

	/** Mirrors the server's parse, for the submit button's label only. */
	const typedAmount = $derived.by(() => {
		const t = amountText.trim();
		if (t === '') return null;
		const n = Math.round(parseFloat(t.replace(/[$,\s]/g, '')) * 100);
		return Number.isFinite(n) && n > 0 ? n : null;
	});

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
	<header class="nav">
		<span class="brand">
			<Icon name="vault" size={17} />
			HSA Saver
		</span>
		<nav class="links">
			<a href={resolve('/')} aria-current="page">Vault</a>
			<a href={resolve('/receipts')}>Receipts</a>
		</nav>
		<div class="nav-right">
			<label class="visually-hidden" for="vault-search">Search provider or amount</label>
			<input
				id="vault-search"
				class="input search"
				type="search"
				placeholder="Search provider or amount"
				bind:value={query}
			/>
			<button class="btn btn-primary add-desktop" onclick={openAdd}>
				<Icon name="plus" size={14} width={2} />
				Add receipt
			</button>
		</div>
	</header>

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
				<button type="button" class="btn btn-ghost" onclick={openAdd}>File your first one.</button>
			</p>
		{:else}
			<ReceiptList rows={visible} empty="Nothing matches “{query}”." />
		{/if}
	</section>
</div>

<!-- Bottom tab bar: phones only. -->
<nav class="tabs" aria-label="Sections">
	<span class="tab current"><Icon name="vault" size={21} width={1.7} />Vault</span>
	<a class="tab" href={resolve('/receipts')}
		><Icon name="receipt" size={21} width={1.7} />Receipts</a
	>
	<button class="shutter" onclick={openCamera} aria-label="File a receipt">
		<Icon name="camera" size={24} />
	</button>
	<span class="tab soon" aria-disabled="true"
		><Icon name="chart" size={21} width={1.7} />Growth</span
	>
	<span class="tab soon" aria-disabled="true"><Icon name="user" size={21} width={1.7} />You</span>
</nav>

<dialog class="sheet" bind:this={addDialogEl} onclose={resetAdd}>
	{#if filed}
		<!-- The payoff frame: the number moved. -->
		<div class="done">
			<div class="done-mark"><Icon name="check" size={30} width={1.8} /></div>
			<div class="done-title">Filed</div>
			<p class="done-sub">
				{filed.provider ?? 'No provider'} · {pretty(filed.serviceDate)} · {money(filed.amountCents)}
			</p>
			<div class="done-total">
				<div class="kick">Total eligible · unreimbursed</div>
				<div class="done-figure">{money(filed.totalAfterCents)}</div>
				{#if filed.totalAfterCents !== filed.totalBeforeCents}
					<div class="done-was">was {money(filed.totalBeforeCents)}</div>
				{/if}
			</div>
			<div class="done-actions">
				<button class="btn btn-primary btn-block tall" onclick={fileAnother}>Add another</button>
				<button class="btn btn-secondary btn-block tall" onclick={closeAdd}>Back to my vault</button
				>
			</div>
		</div>
	{:else}
		<form
			method="POST"
			action="?/create"
			enctype="multipart/form-data"
			use:enhance={({ formData }) => {
				if (pixels) {
					formData.set('cropX', String(Math.round(pixels.x)));
					formData.set('cropY', String(Math.round(pixels.y)));
					formData.set('cropW', String(Math.round(pixels.width)));
					formData.set('cropH', String(Math.round(pixels.height)));
				}
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						const next = result.data?.filed as Filed | undefined;
						if (previewUrl) URL.revokeObjectURL(previewUrl);
						previewUrl = null;
						pickedFile = null;
						canCrop = false;
						addError = null;
						amountText = '';
						if (next) filed = next;
						else closeAdd();
					} else if (result.type === 'failure') {
						addError = String(result.data?.error ?? 'Save failed.');
					}
				};
			}}
		>
			<header class="sheet-head">
				<button type="button" class="btn btn-ghost" onclick={closeAdd}>Cancel</button>
				<span class="sheet-title">{pickedFile ? 'Confirm three things' : 'New receipt'}</span>
				<span class="sheet-spacer"></span>
			</header>

			<div class="sheet-body">
				<div class="file-row">
					<label class="btn btn-secondary">
						<Icon name="camera" size={15} />
						{pickedFile ? 'Retake' : 'Take photo'}
						<input
							bind:this={cameraInputEl}
							type="file"
							name="fileCamera"
							accept="image/*"
							capture="environment"
							onchange={onPick}
							hidden
						/>
					</label>

					<label class="btn btn-secondary">
						<Icon name="receipt" size={15} />
						Choose file
						<input
							type="file"
							name="filePick"
							accept="image/*,application/pdf"
							onchange={onPick}
							hidden
						/>
					</label>
				</div>

				{#if previewUrl && canCrop}
					<div class="crop-wrap">
						<Cropper
							image={previewUrl}
							bind:crop
							bind:zoom
							{aspect}
							oncropcomplete={(e) => (pixels = e.pixels)}
						/>
					</div>
					<label class="zoom"
						>Zoom
						<input type="range" min="1" max="3" step="0.05" bind:value={zoom} />
					</label>

					<div class="aspect-row">
						<button type="button" class="btn btn-secondary" onclick={() => (aspect = 3 / 4)}
							>Portrait</button
						>
						<button type="button" class="btn btn-secondary" onclick={() => (aspect = 1)}
							>Square</button
						>
						<button type="button" class="btn btn-secondary" onclick={() => (aspect = 4 / 3)}
							>Landscape</button
						>
					</div>
				{:else if pickedFile}
					<p class="hint">{pickedFile.name} - will upload as-is</p>
				{/if}

				<label class="fld hero-field"
					>Amount <span class="opt">leave blank if unreadable</span>
					<input
						class="input amount-input"
						name="amount"
						type="text"
						inputmode="decimal"
						placeholder="$0.00"
						bind:value={amountText}
					/>
				</label>
				<label class="fld"
					>Date of service
					<input class="input" name="serviceDate" type="date" value={today} required />
				</label>
				<label class="fld"
					>Provider
					<input class="input" name="provider" type="text" />
				</label>

				{#if addError}<p class="error">{addError}</p>{/if}
			</div>

			<footer class="sheet-foot">
				<button type="button" class="btn btn-secondary cancel-desktop" onclick={closeAdd}>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary submit">
					{typedAmount == null ? 'Save receipt' : `Add ${money(typedAmount)} to my total`}
				</button>
			</footer>
		</form>
	{/if}
</dialog>

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

	/* — header — */
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
	.soon {
		color: color-mix(in srgb, var(--color-text) 30%, transparent);
		cursor: not-allowed;
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

	/* — bottom tab bar — */
	.tabs {
		display: none;
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
		align-items: center;
		justify-content: space-between;
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
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
	.tab.current {
		color: var(--color-accent);
	}
	.shutter {
		width: 54px;
		height: 54px;
		margin-top: -26px;
		border-radius: 99px;
		border: 1.5px solid var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 18%, transparent);
		color: var(--color-accent);
		cursor: pointer;
		display: grid;
		place-items: center;
		box-shadow: 0 0 26px color-mix(in srgb, var(--color-accent) 28%, transparent);
	}

	@media (max-width: 900px) {
		.main {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail {
			border-left: none;
			border-top: 1px solid color-mix(in srgb, var(--color-text) 7%, transparent);
		}
		.nav {
			flex-wrap: wrap;
			gap: var(--space-4);
		}
		.nav-right {
			width: 100%;
		}
		.search {
			flex: 1;
			width: auto;
		}
	}

	/* Phone: tab bar replaces the nav links, rows replace the table. */
	@media (max-width: 700px) {
		.app {
			padding-bottom: 92px;
		}
		.links,
		.add-desktop {
			display: none;
		}
		.tabs {
			display: flex;
		}
		.nav {
			padding: 14px 20px;
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

	/* — add sheet — */
	dialog {
		color: var(--color-text);
		background: var(--color-surface);
		border: none;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--space-6);
		width: min(28rem, 92vw);
		max-height: 90vh;
		overflow-y: auto;
	}
	dialog::backdrop {
		background: color-mix(in srgb, var(--color-neutral-900) 50%, transparent);
	}
	.sheet-head {
		display: none;
		align-items: center;
		justify-content: space-between;
		padding-bottom: var(--space-4);
	}
	.sheet-title {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 15px;
	}
	.sheet-spacer {
		width: 52px;
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.sheet-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-6);
	}
	.fld {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
		color: color-mix(in srgb, var(--color-text) 70%, transparent);
	}
	/* Amount is the hero field of the capture flow. */
	.hero-field .amount-input {
		min-height: 52px;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 26px;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.opt {
		font-size: 11px;
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}
	.error {
		color: var(--color-danger);
		margin: 0;
	}
	.crop-wrap {
		position: relative;
		height: 260px;
		background: var(--color-neutral-900);
		border-radius: var(--radius-sm);
	}
	.file-row {
		display: flex;
		gap: var(--space-3);
	}
	.zoom {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-3);
		font-size: 12px;
	}
	.aspect-row {
		display: flex;
		gap: var(--space-3);
	}
	.hint {
		font-size: 12px;
		color: color-mix(in srgb, var(--color-text) 55%, transparent);
		margin: 0;
	}

	/* — the payoff frame — */
	.done {
		text-align: center;
		padding: 34px 6px 6px;
	}
	.done-mark {
		width: 66px;
		height: 66px;
		margin: 0 auto;
		border-radius: 99px;
		border: 1.5px solid var(--color-accent);
		color: var(--color-accent);
		display: grid;
		place-items: center;
		box-shadow: 0 0 40px color-mix(in srgb, var(--color-accent) 35%, transparent);
	}
	.done-title {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 20px;
		margin-top: 22px;
		letter-spacing: -0.01em;
	}
	.done-sub {
		font-size: 13px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
		margin-top: 8px;
	}
	.done-total {
		margin-top: 36px;
		padding-top: 26px;
		background: linear-gradient(
				to right,
				transparent,
				var(--color-divider) 20%,
				var(--color-divider) 80%,
				transparent
			)
			no-repeat top / 100% 1px;
	}
	.done-figure {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 42px;
		line-height: 1;
		letter-spacing: -0.03em;
		margin-top: 12px;
		font-variant-numeric: tabular-nums;
	}
	.done-was {
		font-size: 12.5px;
		color: var(--color-accent-300);
		margin-top: 9px;
	}
	.done-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 40px;
	}
	.tall {
		min-height: 48px;
		font-size: 15px;
	}

	@media (max-width: 700px) {
		dialog.sheet {
			width: 100vw;
			max-width: none;
			height: 100dvh;
			max-height: none;
			margin: 0;
			border-radius: 0;
			padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
			display: flex;
			flex-direction: column;
		}
		.sheet-head {
			display: flex;
		}
		.cancel-desktop {
			display: none;
		}
		dialog.sheet form {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}
		.sheet-body {
			flex: 1;
			overflow-y: auto;
		}
		.sheet-foot {
			margin-top: var(--space-4);
		}
		.submit {
			width: 100%;
			min-height: 48px;
			font-size: 15px;
		}
	}
</style>
