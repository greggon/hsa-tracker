<script lang="ts">
	/**
	 * Filing a receipt: pick or photograph it, crop it, confirm three fields,
	 * and see the total move.
	 *
	 * Driven by a `request` prop rather than an imperative `open()` method, so
	 * whoever hosts the sheet describes what they want ("open it on the camera")
	 * and the dialog element is this component's own business.
	 */
	import { enhance } from '$app/forms';
	import { money, pretty } from '$lib/format';
	import { toCents } from '$lib/money';
	import Icon from './Icon.svelte';
	import ImageCropper from './ImageCropper.svelte';
	import ProviderInput from './ProviderInput.svelte';

	/** `null` is closed; `camera` opens straight onto the native camera. */
	export type CaptureRequest = null | 'form' | 'camera';

	/** The figures the payoff frame needs, as the create action returns them. */
	export type Filed = {
		amountCents: number | null;
		provider: string | null;
		serviceDate: string;
		totalBeforeCents: number;
		totalAfterCents: number;
	};

	interface Props {
		request?: CaptureRequest;
		/** The user's providers, most-used first, for the autocomplete. */
		providers?: string[];
		/** Names the section in the "Back to my …" button. */
		current: 'vault' | 'receipts';
	}

	let { request = $bindable(null), providers = [], current }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let cameraInputEl = $state<HTMLInputElement | null>(null);
	let addError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	let pickedFile = $state<File | null>(null);
	let canCrop = $state(false);
	/** The chosen crop in natural image pixels, straight from the cropper. */
	let pixels = $state<{ x: number; y: number; width: number; height: number } | null>(null);
	let amountText = $state('');
	let providerText = $state('');
	let filed = $state<Filed | null>(null);

	const today = new Date().toLocaleDateString('en-CA');

	/** Clears everything the sheet holds, including the object URL. */
	function reset() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		pickedFile = null;
		canCrop = false;
		pixels = null;
		addError = null;
		amountText = '';
		providerText = '';
		filed = null;
	}

	/**
	 * Driving the dialog element from the request. An effect is the right tool
	 * here specifically because `<dialog>` is an external system with its own
	 * state — this synchronises with it rather than deriving a value.
	 *
	 * The shutter hands straight to the native camera, which is a better capture
	 * surface than anything reachable from the browser: real optics, autofocus
	 * and HEIC, with no getUserMedia permission dance.
	 */
	$effect(() => {
		const el = dialogEl;
		if (!el) return;

		if (request && !el.open) {
			el.showModal();
			if (request === 'camera') cameraInputEl?.click();
		} else if (!request && el.open) {
			el.close();
		}
	});

	/** Closing is always routed through `request`, so the prop cannot go stale. */
	function close() {
		request = null;
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

	/**
	 * The submit button previews what it is about to add. Parsed with the
	 * server's own function so the label and the saved row cannot disagree about
	 * what counts as a valid amount.
	 */
	const typedAmount = $derived.by(() => {
		try {
			return toCents(amountText);
		} catch {
			return null;
		}
	});
</script>

<dialog
	class="modal sheet"
	bind:this={dialogEl}
	onclose={() => {
		request = null;
		reset();
	}}
>
	{#if filed}
		<!-- The payoff frame: the number moved. -->
		<div class="done">
			<div class="done-mark"><Icon name="check" size={36} /></div>
			<h2 class="done-title md-headline-small">Filed</h2>
			<p class="done-sub md-body-medium">
				{filed.provider ?? 'No provider'} · {pretty(filed.serviceDate)} · {money(filed.amountCents)}
			</p>
			<div class="done-total">
				<div class="md-title-small">Total eligible · unreimbursed</div>
				<div class="done-figure md-display-medium">{money(filed.totalAfterCents)}</div>
				{#if filed.totalAfterCents !== filed.totalBeforeCents}
					<div class="md-body-medium">was {money(filed.totalBeforeCents)}</div>
				{/if}
			</div>
			<div class="done-actions">
				<button class="btn btn-filled btn-lg btn-block" onclick={fileAnother}>Add another</button>
				<button class="btn btn-outlined btn-lg btn-block" onclick={close}>
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
						// One reset, so the success path cannot clear a different set
						// of fields from the one `reset` knows about.
						reset();
						if (next) filed = next;
						else close();
					} else if (result.type === 'failure') {
						addError = String(result.data?.error ?? 'Save failed.');
					}
				};
			}}
		>
			<header class="sheet-head">
				<button type="button" class="icon-btn sheet-close" aria-label="Close" onclick={close}>
					<Icon name="close" />
				</button>
				<h2 class="sheet-title">{pickedFile ? 'Confirm three things' : 'New receipt'}</h2>
			</header>

			<div class="sheet-body">
				<div class="file-row">
					<label class="btn btn-tonal">
						<Icon name="camera" size={18} />
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

					<label class="btn btn-outlined">
						<Icon name="file" size={18} />
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
					<ImageCropper src={previewUrl} oncrop={(rect) => (pixels = rect)} />
				{:else if pickedFile}
					<p class="hint md-body-small">{pickedFile.name} - will upload as-is</p>
				{/if}

				<!-- Same field markup as the edit page, so the two forms cannot drift. -->
				<div class="tf">
					<label for="sheet-amount">Amount</label>
					<span class="tf-prefix" aria-hidden="true">$</span>
					<input
						id="sheet-amount"
						class="tf-input amount"
						name="amount"
						type="text"
						inputmode="decimal"
						placeholder="0.00"
						aria-describedby="sheet-amount-help"
						bind:value={amountText}
					/>
					<span class="tf-support" id="sheet-amount-help">Leave blank if unreadable</span>
				</div>
				<div class="tf">
					<label for="sheet-date">Date of service</label>
					<input
						id="sheet-date"
						class="tf-input"
						name="serviceDate"
						type="date"
						value={today}
						required
					/>
				</div>
				<div class="tf">
					<label for="sheet-provider">Provider</label>
					<ProviderInput id="sheet-provider" bind:value={providerText} suggestions={providers} />
				</div>

				{#if addError}<p class="error md-body-medium" role="alert">{addError}</p>{/if}
			</div>

			<footer class="sheet-foot">
				<button type="button" class="btn btn-text cancel-desktop" onclick={close}>Cancel</button>
				<button type="submit" class="btn btn-filled submit">
					{typedAmount == null ? 'Save receipt' : `Add ${money(typedAmount)} to my total`}
				</button>
			</footer>
		</form>
	{/if}
</dialog>

<style>
	dialog {
		max-height: 90vh;
		overflow-y: auto;
	}
	.sheet-head {
		display: flex;
		align-items: center;
		margin-bottom: 24px;
	}
	.sheet-close {
		display: none;
	}
	.sheet-title {
		font: 400 24px/32px var(--md-font);
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.sheet-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 24px;
	}
	.error {
		color: var(--md-error);
	}
	.file-row {
		display: flex;
		gap: 8px;
	}
	.hint {
		color: var(--md-on-surface-variant);
	}

	/* — the payoff frame — */
	.done {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding-top: 24px;
	}
	.done-mark {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: var(--md-surface-container-high);
		color: var(--md-on-surface);
	}
	.done-title {
		margin-top: 16px;
	}
	.done-sub {
		margin-top: 4px;
		color: var(--md-on-surface-variant);
	}
	.done-total {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 32px;
		padding: 20px;
		border-radius: var(--md-shape-xl);
		background: var(--md-surface-container-high);
		color: var(--md-on-surface);
	}
	.done-figure {
		font-variant-numeric: tabular-nums;
	}
	.done-actions {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 32px;
	}

	@media (max-width: 700px) {
		/* A full-screen dialog on phones. [open] matters: without it
		   `display: flex` overrides the UA's `dialog:not([open]) { display: none }`
		   and the closed sheet renders inline in the page, below the content. */
		dialog.sheet[open] {
			width: 100vw;
			min-width: 0;
			max-width: none;
			height: 100dvh;
			max-height: none;
			margin: 0;
			border-radius: 0;
			padding: env(safe-area-inset-top) var(--gutter) calc(16px + env(safe-area-inset-bottom));
			background: var(--md-surface);
			box-shadow: none;
			display: flex;
			flex-direction: column;
		}
		dialog.sheet :global(.tf) {
			--tf-bg: var(--md-surface);
		}
		.sheet-head {
			height: 64px;
			gap: 4px;
			margin: 0 0 8px -12px;
		}
		.sheet-close {
			display: inline-grid;
			color: var(--md-on-surface);
		}
		.sheet-title {
			font: 400 22px/28px var(--md-font);
		}
		/* Two equal, thumb-sized halves. */
		.file-row {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.file-row .btn {
			height: 56px;
			font-size: 16px;
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
			/* Room for the first field's label, which sits above its outline. */
			padding-top: 8px;
		}
		.sheet-foot {
			margin-top: 16px;
		}
		.submit {
			width: 100%;
			height: 56px;
			font-size: 16px;
		}
	}
</style>
