<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Cropper from 'svelte-easy-crop';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// Derived from the loaded shape rather than imported from $lib/server, which
	// client code may not reach.
	type IncompleteReason = PageProps['data']['stats']['incomplete'][number]['reasons'][number];

	//Add dialog
	let addDialogEl = $state<HTMLDialogElement | null>(null);
	let addError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	let pickedFile = $state<File | null>(null);
	let canCrop = $state(false);
	let crop = $state({ x: 0, y: 0 });
	let zoom = $state(1);
	let aspect = $state(3 / 4);
	let pixels = $state<{ x: number; y: number; width: number; height: number } | null>(null);

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

	/** Reasons keyed by expense, so a row's status tag agrees with the rail. */
	const reasonsById = $derived(
		new Map<number, IncompleteReason[]>(data.stats.incomplete.map((r) => [r.id, r.reasons]))
	);

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
	}

	function openAdd() {
		resetAdd();
		addDialogEl?.showModal();
	}

	function closeAdd() {
		addDialogEl?.close();
		resetAdd();
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

	const REASON_TAG: Record<IncompleteReason, string> = {
		amount: 'Needs amount',
		provider: 'Needs provider',
		document: 'Needs image'
	};

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
			<!-- In the design but not built yet, so rendered inert rather than as
			     links that would 404. -->
			<span class="soon" aria-disabled="true" title="Not built yet">Receipts</span>
			<span class="soon" aria-disabled="true" title="Not built yet">Export</span>
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
			<button class="btn btn-primary" onclick={openAdd}>
				<Icon name="plus" size={14} width={2} />
				Add receipt
			</button>
		</div>
	</header>

	<div class="main">
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
				<span class="kick">The claim, built over time</span>
				{#if data.stats.series.length > 0}
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

			{#if data.stats.series.length === 0}
				<p class="chart-empty">Nothing filed yet. The line starts with your first receipt.</p>
			{:else}
				<svg
					class="chart"
					viewBox="0 0 1000 200"
					width="100%"
					height="180"
					preserveAspectRatio="none"
					role="img"
					aria-label={chartMode === 'cumulative'
						? `Cumulative unreimbursed total, ${axisLabel}, reaching ${money(data.stats.totalCents)}`
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
				<div class="axis">
					{#each data.stats.chart.years as year (year)}
						<span>{year}</span>
					{/each}
				</div>
			{/if}
		</section>

		<aside class="rail" id="needs-a-field">
			<div class="kick">Needs a field · {data.stats.incomplete.length}</div>
			{#if data.stats.incomplete.length === 0}
				<p class="rail-note">Every filed receipt has its amount, provider and image.</p>
			{:else}
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
			{/if}
		</aside>
	</div>

	<section class="filed">
		<div class="filed-head">
			<span class="kick">{normalised === '' ? 'Recently filed' : 'Matching receipts'}</span>
			<span class="filed-count">
				{#if normalised === ''}
					{data.expenses.length} receipt{data.expenses.length === 1 ? '' : 's'} filed
				{:else}
					{matches.length} of {data.expenses.length}
				{/if}
			</span>
		</div>

		{#if data.expenses.length === 0}
			<p class="empty">
				No receipts yet.
				<button type="button" class="btn btn-ghost" onclick={openAdd}>File your first one.</button>
			</p>
		{:else if visible.length === 0}
			<p class="empty">Nothing matches “{query}”.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr>
							<th class="col-thumb"><span class="visually-hidden">Receipt image</span></th>
							<th>Date of service</th>
							<th>Provider</th>
							<th class="right">Amount</th>
							<th class="right col-status">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each visible as e (e.id)}
							<tr>
								<td>
									{#if e.docId && e.hasThumb}
										<img
											class="thumb"
											src={resolve('/documents/[id]', { id: String(e.docId) }) + '?thumb'}
											alt=""
											width="26"
											height="33"
											loading="lazy"
											decoding="async"
										/>
									{:else}
										<div class="thumb placeholder"></div>
									{/if}
								</td>
								<td class="date">{pretty(e.serviceDate)}</td>
								<td>
									<a class="rowlink" href={resolve('/receipts/[id]', { id: String(e.id) })}>
										{e.provider ?? 'No provider'}
									</a>
								</td>
								<td class="right amount" class:unread={e.amountCents == null}>
									{money(e.amountCents)}
								</td>
								<td class="right">
									{#if e.reimbursedAt}
										<span class="tag tag-neutral">Reimbursed</span>
									{:else if reasonsById.get(e.id)}
										<span class="tag tag-outline">{REASON_TAG[reasonsById.get(e.id)![0]]}</span>
									{:else}
										<span class="tag tag-accent">Complete</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<dialog bind:this={addDialogEl} onclose={resetAdd}>
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
				if (result.type === 'success') closeAdd();
				else if (result.type === 'failure') addError = String(result.data?.error ?? 'Save failed.');
			};
		}}
	>
		<h2>Add receipt</h2>

		<div class="file-row">
			<label class="btn btn-secondary">
				<Icon name="camera" size={15} />
				Take photo
				<input
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
				<button type="button" class="btn btn-secondary" onclick={() => (aspect = 1)}>Square</button>
				<button type="button" class="btn btn-secondary" onclick={() => (aspect = 4 / 3)}
					>Landscape</button
				>
			</div>
		{:else if pickedFile}
			<p class="hint">{pickedFile.name} - will upload as-is</p>
		{/if}

		<label
			>Amount <span class="opt">leave blank if unreadable</span>
			<input class="input" name="amount" type="text" inputmode="decimal" />
		</label>
		<label
			>Date of service <input
				class="input"
				name="serviceDate"
				type="date"
				value={today}
				required
			/></label
		>
		<label>Provider <input class="input" name="provider" type="text" /></label>

		{#if addError}<p class="error">{addError}</p>{/if}

		<div class="actions">
			<button type="button" class="btn btn-secondary" onclick={closeAdd}>Cancel</button>
			<button type="submit" class="btn btn-primary">Save receipt</button>
		</div>
	</form>
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
		justify-content: space-between;
		margin: 30px 0 12px;
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
	.filed {
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
	.table-wrap {
		overflow-x: auto;
	}
	.right {
		text-align: right;
	}
	.col-thumb {
		width: 38px;
	}
	.col-status {
		width: 130px;
	}
	.date {
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--color-text) 80%, transparent);
	}
	.amount {
		font-variant-numeric: tabular-nums;
	}
	.amount.unread {
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}
	.thumb {
		width: 26px;
		height: 33px;
		object-fit: cover;
		border-radius: 3px;
		box-shadow: inset 0 0 0 1px var(--color-divider);
	}
	.placeholder {
		background: linear-gradient(160deg, var(--color-neutral-800), var(--color-surface));
	}
	.rowlink {
		color: inherit;
		text-decoration: none;
	}
	.rowlink:hover {
		color: var(--color-accent);
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
		.figure {
			font-size: 46px;
		}
		.frac {
			font-size: 26px;
		}
	}

	/* — dialogs — */
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
	dialog h2 {
		font-size: 20px;
	}
	dialog form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	dialog label {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
		color: color-mix(in srgb, var(--color-text) 70%, transparent);
	}
	.opt {
		font-size: 11px;
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-2);
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
		margin-bottom: var(--space-4);
	}
	.file-row {
		display: flex;
		gap: var(--space-3);
	}
	.zoom {
		flex-direction: row;
		align-items: center;
		gap: var(--space-3);
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
</style>
