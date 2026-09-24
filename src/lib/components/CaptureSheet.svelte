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
				<button type="button" class="btn btn-ghost sheet-cancel" onclick={close}>Cancel</button>
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
					<ImageCropper src={previewUrl} oncrop={(rect) => (pixels = rect)} />
				{:else if pickedFile}
					<p class="hint">{pickedFile.name} - will upload as-is</p>
				{/if}

				<!-- Same field markup as the edit page, so the two forms cannot drift. -->
				<div class="fld">
					<label for="sheet-amount">Amount <span class="opt">leave blank if unreadable</span></label
					>
					<input
						id="sheet-amount"
						class="input amount"
						name="amount"
						type="text"
						inputmode="decimal"
						placeholder="$0.00"
						bind:value={amountText}
					/>
				</div>
				<div class="fld">
					<label for="sheet-date">Date of service</label>
					<input
						id="sheet-date"
						class="input"
						name="serviceDate"
						type="date"
						value={today}
						required
					/>
				</div>
				<div class="fld">
					<label for="sheet-provider">Provider</label>
					<ProviderInput id="sheet-provider" bind:value={providerText} suggestions={providers} />
				</div>

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
	dialog {
		max-height: 90vh;
		overflow-y: auto;
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
		width: 76px;
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.sheet-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-6);
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
			padding: calc(8px + env(safe-area-inset-top)) var(--gutter)
				calc(20px + env(safe-area-inset-bottom));
			display: flex;
			flex-direction: column;
		}
		.sheet-head {
			display: flex;
			margin: 0 -12px;
		}
		.sheet-cancel {
			width: 76px;
			justify-content: flex-start;
			padding-inline: 12px;
		}
		.sheet-title {
			font-size: 16px;
		}
		/* Two equal, thumb-sized halves. */
		.file-row {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.file-row .btn {
			min-height: 48px;
			font-size: 15px;
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
