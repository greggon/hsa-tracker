<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import ProviderInput from '$lib/components/ProviderInput.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let confirmEl = $state<HTMLDialogElement | null>(null);
	let saving = $state(false);
	let justSaved = $state(false);

	/**
	 * Escape leaves the receipt the way it was opened.
	 *
	 * Skipped while the confirm dialog is up — a native <dialog> closes itself on
	 * Escape, and dismissing it should not also navigate away. Falls forward to
	 * the list when there is no history to go back to, which happens when the
	 * receipt was opened directly from a link.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || confirmEl?.open) return;
		event.preventDefault();
		if (history.length > 1) history.back();
		else goto(resolve('/receipts'));
	}

	const doc = $derived(data.receipt.docId);
	const docHref = $derived(doc == null ? '' : resolve('/documents/[id]', { id: String(doc) }));
	const isPdf = $derived(data.receipt.mimeType === 'application/pdf');

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

	const prettyStamp = (d: Date | string) =>
		new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	function fileSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	type CheckState = 'pass' | 'fail';

	/**
	 * Every line is answered from the record. The artboard's first line claimed a
	 * "legible" image, which nothing here can assess — so it claims only that an
	 * original is on file.
	 */
	const checks = $derived<{ state: CheckState; label: string }[]>([
		{
			state: data.audit.hasImage ? 'pass' : 'fail',
			label: data.audit.hasImage ? 'Original image on file' : 'No original image on file'
		},
		{
			state: data.audit.fieldsComplete ? 'pass' : 'fail',
			label: data.audit.fieldsComplete ? 'All three fields filled' : 'A field is still missing'
		},
		{
			state: data.audit.notReimbursed && data.audit.notDuplicate ? 'pass' : 'fail',
			label: !data.audit.notReimbursed
				? 'Already reimbursed'
				: !data.audit.notDuplicate
					? 'Another receipt has this exact image'
					: 'Not yet reimbursed, not a duplicate'
		}
	]);

	const title = $derived(
		`${data.receipt.provider ?? 'No provider'} · ${pretty(data.receipt.serviceDate)}`
	);
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:head><title>{title} · HSA Saver</title></svelte:head>

<div class="app">
	<header class="bar">
		<a class="btn btn-ghost back" href={resolve('/receipts')}>
			<Icon name="chevronLeft" size={15} width={2} />
			All receipts
		</a>
		<span class="title">{title}</span>
		<div class="bar-actions">
			{#if doc}
				<a
					class="btn btn-secondary"
					href={resolve('/documents/[id]', { id: String(doc) })}
					download={data.receipt.originalFilename ?? 'receipt'}
				>
					Download original
				</a>
			{/if}
			<button class="btn btn-secondary" onclick={() => confirmEl?.showModal()}>Delete</button>
		</div>
	</header>

	<div class="split">
		<div class="viewer">
			{#if doc && !isPdf}
				<img
					class="receipt"
					src="{docHref}?web"
					alt="Receipt from {data.receipt.provider ?? 'an unnamed provider'}"
				/>
			{:else if doc && isPdf}
				<div class="receipt placeholder pdf">
					<Icon name="receipt" size={30} />
					<span>PDF receipt</span>
					<a class="btn btn-secondary" href={resolve('/documents/[id]', { id: String(doc) })}>
						Open original
					</a>
				</div>
			{:else}
				<div class="receipt placeholder">
					<Icon name="camera" size={30} />
					<span>No image on file</span>
				</div>
			{/if}

			{#if doc}
				<div class="file-meta">
					<span>
						{data.receipt.originalFilename ?? 'receipt'}
						{#if data.receipt.byteSize}· {fileSize(data.receipt.byteSize)}{/if}
						{#if data.receipt.addedAt}· added {prettyStamp(data.receipt.addedAt)}{/if}
					</span>
				</div>
			{/if}
		</div>

		<div class="panel">
			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						saving = false;
						justSaved = result.type === 'success';
					};
				}}
			>
				<div class="fld">
					<label for="amount">Amount <span class="opt">blank if unreadable</span></label>
					<input
						id="amount"
						class="input amount"
						name="amount"
						type="text"
						inputmode="decimal"
						value={data.receipt.amountCents == null
							? ''
							: (data.receipt.amountCents / 100).toFixed(2)}
					/>
				</div>

				<div class="pair">
					<div class="fld">
						<label for="serviceDate">Date of service</label>
						<input
							id="serviceDate"
							class="input"
							name="serviceDate"
							type="date"
							value={data.receipt.serviceDate}
							required
						/>
					</div>
					<div class="fld">
						<label for="provider">Provider</label>
						<ProviderInput
							id="provider"
							value={data.receipt.provider ?? ''}
							suggestions={page.data.providers ?? []}
						/>
					</div>
				</div>

				<hr class="hr" />

				<div class="audit">
					<div class="kick">Will this hold up?</div>
					<ul>
						{#each checks as c (c.label)}
							<li class={c.state}>
								<Icon name={c.state === 'pass' ? 'check' : 'cross'} size={15} width={2} />
								{c.label}
							</li>
						{/each}
					</ul>
				</div>

				{#if form?.error}<p class="error">{form.error}</p>{/if}
				{#if justSaved && !form?.error}<p class="saved">Saved.</p>{/if}

				<div class="actions">
					<button type="submit" class="btn btn-primary grow" disabled={saving}>
						{saving ? 'Saving…' : 'Save changes'}
					</button>
				</div>
			</form>

			<form method="POST" action="?/reimburse" use:enhance>
				<button type="submit" class="btn btn-secondary block">
					{data.receipt.reimbursedAt ? 'Undo reimbursement' : 'Mark reimbursed'}
				</button>
			</form>

			{#if data.receipt.reimbursedAt}
				<p class="note">
					Reimbursed {prettyStamp(data.receipt.reimbursedAt)} · {money(data.receipt.amountCents)} is no
					longer counted in your total.
				</p>
			{/if}
		</div>
	</div>
</div>

<dialog bind:this={confirmEl}>
	<h2>Delete this receipt?</h2>
	<p class="dialog-body">
		It disappears from your vault and stops counting toward your total. The image itself is kept, so
		this can be undone from the database if you need it back.
	</p>
	<form method="POST" action="?/remove" use:enhance>
		<div class="actions">
			<button type="button" class="btn btn-secondary" onclick={() => confirmEl?.close()}>
				Cancel
			</button>
			<button type="submit" class="btn btn-primary danger">Delete receipt</button>
		</div>
	</form>
</dialog>

<style>
	.app {
		max-width: 900px;
		margin: 0 auto;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 22px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-text) 7%, transparent);
	}
	.back {
		font-size: 13.5px;
		padding: 0;
		gap: 6px;
	}
	.title {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 14px;
		margin-left: 6px;
	}
	.bar-actions {
		margin-left: auto;
		display: flex;
		gap: 9px;
	}
	.bar-actions .btn {
		font-size: 13px;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}

	.viewer {
		min-width: 0;
		padding: 22px;
		/* The artboard recesses the image well below the page ground. Nocturne has
		   no token darker than --color-bg, and shade mixed from black is a shadow
		   rather than a colour, which the system permits. */
		background: color-mix(in srgb, var(--color-bg) 82%, #000);
	}
	.receipt {
		width: 100%;
		height: 472px;
		object-fit: contain;
		border-radius: 10px;
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		background: linear-gradient(160deg, var(--color-neutral-800), var(--color-surface));
		box-shadow: inset 0 0 0 1px var(--color-divider);
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
		font-size: 13px;
	}
	.file-meta {
		margin-top: 12px;
		font-size: 11.5px;
		color: color-mix(in srgb, var(--color-text) 42%, transparent);
	}

	.panel {
		min-width: 0;
		padding: 26px 24px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.panel form {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.fld {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.fld label {
		font-size: 11px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
	}
	.opt {
		color: color-mix(in srgb, var(--color-text) 35%, transparent);
	}
	.amount {
		min-height: 46px;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 22px;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.pair {
		display: flex;
		gap: 14px;
	}
	.pair .fld {
		flex: 1;
		min-width: 0;
	}

	.kick {
		font-size: 10px;
		line-height: 1;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
		margin-bottom: 11px;
	}
	.audit ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
		font-size: 13px;
	}
	.audit li {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.audit li.pass :global(svg) {
		color: var(--color-accent);
	}
	.audit li.fail {
		color: var(--color-danger);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}
	.grow {
		flex: 1;
		min-height: 42px;
	}
	.block {
		width: 100%;
		min-height: 42px;
	}
	.danger {
		color: var(--color-danger);
		border-color: var(--color-danger);
	}
	.error {
		color: var(--color-danger);
		margin: 0;
		font-size: 13px;
	}
	.saved {
		color: var(--color-accent-300);
		margin: 0;
		font-size: 13px;
	}
	.note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}

	@media (max-width: 820px) {
		.split {
			grid-template-columns: minmax(0, 1fr);
		}
		.receipt {
			height: 340px;
		}
		.pair {
			flex-direction: column;
		}
	}

	dialog {
		color: var(--color-text);
		background: var(--color-surface);
		border: none;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--space-6);
		width: min(28rem, 92vw);
	}
	dialog::backdrop {
		background: color-mix(in srgb, var(--color-neutral-900) 50%, transparent);
	}
	dialog h2 {
		font-size: 20px;
	}
	.dialog-body {
		font-size: 13px;
		line-height: 1.6;
		color: color-mix(in srgb, var(--color-text) 65%, transparent);
	}
</style>
