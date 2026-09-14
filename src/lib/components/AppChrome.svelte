<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import ImageCropper from './ImageCropper.svelte';

	interface Props {
		/** Which section is being viewed, for the nav and tab-bar highlight. */
		current: 'vault' | 'receipts';
		/** Two-way bound so each page can filter its own rows. */
		search?: string;
	}

	let { current, search = $bindable('') }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let cameraInputEl = $state<HTMLInputElement | null>(null);
	let addError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	let pickedFile = $state<File | null>(null);
	let canCrop = $state(false);
	/** The chosen crop in natural image pixels, straight from the cropper. */
	let pixels = $state<{ x: number; y: number; width: number; height: number } | null>(null);
	let amountText = $state('');

	/** The payoff frame's figures, set from the action's result. */
	type Filed = {
		amountCents: number | null;
		provider: string | null;
		serviceDate: string;
		totalBeforeCents: number;
		totalAfterCents: number;
	};
	let filed = $state<Filed | null>(null);

	const today = new Date().toLocaleDateString('en-CA');

	function reset() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		pickedFile = null;
		canCrop = false;
		pixels = null;
		addError = null;
		amountText = '';
		filed = null;
	}

	export function open() {
		reset();
		dialogEl?.showModal();
	}

	/**
	 * The shutter. On a phone this hands straight to the native camera, which is
	 * a better capture surface than anything reachable from the browser — real
	 * optics, autofocus and HEIC, with no getUserMedia permission dance.
	 */
	function openCamera() {
		reset();
		dialogEl?.showModal();
		cameraInputEl?.click();
	}

	function close() {
		dialogEl?.close();
		reset();
	}

	function fileAnother() {
		reset();
		cameraInputEl?.click();
	}

	function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		pickedFile = f;
		pixels = null;

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

	const pretty = (iso: string) =>
		new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});

	/** Mirrors the server's parse, for the submit button's label only. */
	const typedAmount = $derived.by(() => {
		const t = amountText.trim();
		if (t === '') return null;
		const n = Math.round(parseFloat(t.replace(/[$,\s]/g, '')) * 100);
		return Number.isFinite(n) && n > 0 ? n : null;
	});
</script>

<header class="nav">
	<a class="brand" href={resolve('/')}>
		<Icon name="vault" size={17} />
		HSA Saver
	</a>
	<nav class="links">
		<a href={resolve('/')} aria-current={current === 'vault' ? 'page' : undefined}>Vault</a>
		<a href={resolve('/receipts')} aria-current={current === 'receipts' ? 'page' : undefined}>
			Receipts
		</a>
	</nav>
	<div class="nav-right">
		<label class="visually-hidden" for="chrome-search">Search provider or amount</label>
		<input
			id="chrome-search"
			class="input search"
			type="search"
			placeholder="Search provider or amount"
			bind:value={search}
		/>
		<button class="btn btn-primary add-desktop" onclick={open}>
			<Icon name="plus" size={14} width={2} />
			Add receipt
		</button>
	</div>
</header>

<!-- Phones only: the two sections either side of the shutter. -->
<nav class="tabs" aria-label="Sections">
	{#if current === 'vault'}
		<span class="tab current"><Icon name="vault" size={21} width={1.7} />Vault</span>
	{:else}
		<a class="tab" href={resolve('/')}><Icon name="vault" size={21} width={1.7} />Vault</a>
	{/if}

	<button class="shutter" onclick={openCamera} aria-label="File a receipt">
		<Icon name="camera" size={24} />
	</button>

	{#if current === 'receipts'}
		<span class="tab current"><Icon name="receipt" size={21} width={1.7} />Receipts</span>
	{:else}
		<a class="tab" href={resolve('/receipts')}>
			<Icon name="receipt" size={21} width={1.7} />Receipts
		</a>
	{/if}
</nav>

<dialog class="sheet" bind:this={dialogEl} onclose={reset}>
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
				<button class="btn btn-secondary btn-block tall" onclick={close}>
					Back to my {current === 'receipts' ? 'receipts' : 'vault'}
				</button>
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
						else close();
					} else if (result.type === 'failure') {
						addError = String(result.data?.error ?? 'Save failed.');
					}
				};
			}}
		>
			<header class="sheet-head">
				<button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
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
					<ImageCropper src={previewUrl} bind:crop={pixels} />
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
				<button type="button" class="btn btn-secondary cancel-desktop" onclick={close}>
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
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
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

	/* — bottom tab bar — */
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

	@media (max-width: 700px) {
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
		.nav-right {
			margin-left: 0;
		}
	}

	/* — capture sheet — */
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
	.file-row {
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
	.kick {
		font-size: 10px;
		line-height: 1;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
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
		/* [open] matters: without it `display: flex` overrides the UA's
		   `dialog:not([open]) { display: none }` and the closed sheet renders
		   inline in the page, below the content. */
		dialog.sheet[open] {
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
