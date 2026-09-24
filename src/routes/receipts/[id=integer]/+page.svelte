<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import ProviderInput from '$lib/components/ProviderInput.svelte';
	import { money, pretty } from '$lib/format';
	import { toasts } from '$lib/toast.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let confirmEl = $state<HTMLDialogElement | null>(null);
	let saving = $state(false);

	/** The top bar's overflow menu, which holds Delete. */
	let menuOpen = $state(false);
	let menuWrap = $state<HTMLElement | null>(null);

	function closeMenuOnOutsidePointer(event: PointerEvent) {
		if (menuOpen && !menuWrap?.contains(event.target as Node)) menuOpen = false;
	}

	function askToDelete() {
		menuOpen = false;
		confirmEl?.showModal();
	}

	/**
	 * Back to wherever this receipt was opened from.
	 *
	 * `history.back()` rather than a fixed destination, so the vault, the
	 * receipts list and a filtered year all return to themselves with their
	 * scroll position intact. Falls forward to the list when there is no history
	 * to go back to, which happens when the receipt was opened from a bare link.
	 */
	function leave() {
		if (history.length > 1) history.back();
		else goto(resolve('/receipts'));
	}

	/**
	 * Escape leaves the receipt the way it was opened.
	 *
	 * Skipped while the confirm dialog is up — a native <dialog> closes itself on
	 * Escape, and dismissing it should not also navigate away. With the menu
	 * open, Escape closes just the menu.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || confirmEl?.open) return;
		event.preventDefault();
		if (menuOpen) menuOpen = false;
		else leave();
	}

	const doc = $derived(data.receipt.docId);
	const docHref = $derived(
		doc == null ? '' : resolve('/documents/[id=integer]', { id: String(doc) })
	);
	const isPdf = $derived(data.receipt.mimeType === 'application/pdf');

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

<svelte:window onkeydown={onKeydown} onpointerdown={closeMenuOnOutsidePointer} />
<svelte:head><title>{title} · HSA Saver</title></svelte:head>

<div class="app">
	<header class="bar">
		<!-- The href is the fallback for a new tab or no script; a plain click goes
		     back the way Save and Escape do, to wherever the receipt was opened from. -->
		<a
			class="icon-btn back"
			href={resolve('/receipts')}
			aria-label="Back"
			onclick={(event) => {
				event.preventDefault();
				leave();
			}}
		>
			<Icon name="arrowBack" />
		</a>
		<h1 class="title md-title-large">{data.receipt.provider ?? 'No provider'}</h1>
		{#if doc}
			<a
				class="icon-btn"
				href={resolve('/documents/[id=integer]', { id: String(doc) })}
				download={data.receipt.originalFilename ?? 'receipt'}
				aria-label="Download original"
				title="Download original"
			>
				<Icon name="download" />
			</a>
		{/if}
		<div class="menu-wrap" bind:this={menuWrap}>
			<button
				type="button"
				class="icon-btn"
				aria-label="More actions"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-controls="receipt-menu"
				onclick={() => (menuOpen = !menuOpen)}
			>
				<Icon name="more" />
			</button>
			{#if menuOpen}
				<ul class="menu receipt-menu" id="receipt-menu" role="menu">
					<li role="none">
						<button type="button" class="menu-item danger" role="menuitem" onclick={askToDelete}>
							<Icon name="delete" />
							Delete receipt
						</button>
					</li>
				</ul>
			{/if}
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
				<div class="receipt placeholder">
					<Icon name="file" size={36} />
					<span class="md-body-medium">PDF receipt</span>
					<a class="btn btn-tonal" href={resolve('/documents/[id=integer]', { id: String(doc) })}>
						Open original
					</a>
				</div>
			{:else}
				<div class="receipt placeholder">
					<Icon name="image" size={36} />
					<span class="md-body-medium">No image on file</span>
				</div>
			{/if}

			{#if doc}
				<p class="file-meta md-body-small">
					{data.receipt.originalFilename ?? 'receipt'}
					{#if data.receipt.byteSize}· {fileSize(data.receipt.byteSize)}{/if}
					{#if data.receipt.addedAt}· added {prettyStamp(data.receipt.addedAt)}{/if}
				</p>
			{/if}
		</div>

		<div class="panel">
			<form
				id="save-form"
				class="fields"
				method="POST"
				action="?/save"
				use:enhance={() => {
					saving = true;
					return async ({ result }) => {
						saving = false;

						if (result.type === 'success') {
							// Toast first, navigate second: the toast lives in the layout, so
							// it is still on screen when the previous page renders.
							toasts.success('Receipt saved.');
							leave();
							return;
						}

						if (result.type === 'failure') {
							toasts.error(String(result.data?.error ?? 'Could not save this receipt.'));
							return;
						}

						// Redirects and unexpected errors keep SvelteKit's own handling.
						await applyAction(result);
					};
				}}
			>
				<div class="tf">
					<label for="amount">Amount</label>
					<span class="tf-prefix" aria-hidden="true">$</span>
					<input
						id="amount"
						class="tf-input amount"
						name="amount"
						type="text"
						inputmode="decimal"
						aria-describedby="amount-help"
						value={data.receipt.amountCents == null
							? ''
							: (data.receipt.amountCents / 100).toFixed(2)}
					/>
					<span class="tf-support" id="amount-help">Leave blank if unreadable</span>
				</div>

				<div class="pair">
					<div class="tf">
						<label for="serviceDate">Date of service</label>
						<input
							id="serviceDate"
							class="tf-input"
							name="serviceDate"
							type="date"
							value={data.receipt.serviceDate}
							required
						/>
					</div>
					<div class="tf">
						<label for="provider">Provider</label>
						<ProviderInput
							id="provider"
							value={data.receipt.provider ?? ''}
							suggestions={data.providers}
						/>
					</div>
				</div>
			</form>

			<section class="card card-outlined audit" aria-labelledby="audit-heading">
				<h2 class="md-title-medium" id="audit-heading">Will this hold up?</h2>
				<ul>
					{#each checks as c (c.label)}
						<li class={c.state}>
							<Icon name={c.state === 'pass' ? 'checkCircle' : 'errorCircle'} size={20} />
							{c.label}
						</li>
					{/each}
				</ul>

				<form
					method="POST"
					action="?/reimburse"
					use:enhance={() => {
						// Stays on the page deliberately: the checklist and the note below it
						// both change, and you want to see them change.
						const undoing = data.receipt.reimbursedAt != null;
						return async ({ result, update }) => {
							if (result.type === 'failure') {
								toasts.error(String(result.data?.error ?? 'Could not update this receipt.'));
								return;
							}
							await update({ reset: false });
							if (result.type === 'success') {
								toasts.success(undoing ? 'Reimbursement undone.' : 'Marked reimbursed.');
							}
						};
					}}
				>
					<button type="submit" class="btn btn-tonal btn-block">
						{data.receipt.reimbursedAt ? 'Undo reimbursement' : 'Mark reimbursed'}
					</button>
				</form>

				{#if data.receipt.reimbursedAt}
					<p class="note md-body-small">
						Reimbursed {prettyStamp(data.receipt.reimbursedAt)} · {money(data.receipt.amountCents)} is
						no longer counted in your total.
					</p>
				{/if}
			</section>

			<!-- Submits the fields above through `form`. Pinned to the bottom of a
			     phone screen, like the capture sheet's submit, so Save is in reach
			     from the image as well as the form. -->
			<div class="save-bar">
				<button type="submit" form="save-form" class="btn btn-filled save" disabled={saving}>
					{saving ? 'Saving…' : 'Save changes'}
				</button>
			</div>
		</div>
	</div>
</div>

<dialog class="modal confirm" bind:this={confirmEl}>
	<h2 class="dialog-headline">Delete this receipt?</h2>
	<p class="dialog-body">
		It disappears from your vault and stops counting toward your total. The image itself is kept, so
		this can be undone from the database if you need it back.
	</p>
	<form
		method="POST"
		action="?/remove"
		use:enhance={() => {
			return async ({ result }) => {
				if (result.type === 'failure') {
					toasts.error(String(result.data?.error ?? 'Could not delete this receipt.'));
					confirmEl?.close();
					return;
				}
				// The action redirects to the vault; the toast explains why the
				// receipt is no longer in the list you land on.
				if (result.type === 'redirect') toasts.success('Receipt deleted.');
				await applyAction(result);
			};
		}}
	>
		<div class="dialog-actions">
			<button type="button" class="btn btn-text" onclick={() => confirmEl?.close()}>Cancel</button>
			<button type="submit" class="btn btn-text btn-danger">Delete</button>
		</div>
	</form>
</dialog>

<style>
	.app {
		max-width: 1000px;
		margin: 0 auto;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 64px;
		padding: 8px calc(var(--gutter) - 12px);
	}
	.back {
		color: var(--md-on-surface);
	}
	.title {
		flex: 1;
		min-width: 0;
		margin-left: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.menu-wrap {
		position: relative;
	}
	.receipt-menu {
		position: absolute;
		z-index: 20;
		top: calc(100% + 4px);
		right: 4px;
		min-width: 200px;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 24px;
		padding: 8px var(--gutter) 24px;
	}

	.viewer {
		min-width: 0;
	}
	.receipt {
		width: 100%;
		height: 480px;
		object-fit: contain;
		border-radius: var(--md-shape-lg);
		background: var(--md-surface-container-highest);
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: var(--md-on-surface-variant);
	}
	.file-meta {
		margin: 8px 4px 0;
		color: var(--md-on-surface-variant);
	}

	.panel {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 24px;
		/* Room for the first field's label, which sits above its outline. */
		padding-top: 8px;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.pair {
		display: flex;
		gap: 16px;
	}
	.pair .tf {
		flex: 1;
		min-width: 0;
	}

	.audit {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.audit ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.audit li {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	/* Passing checks stay neutral; red is the accent here, and a red tick
	   would read as a problem. */
	.audit li.pass :global(svg) {
		color: var(--md-on-surface-variant);
	}
	.audit li.fail {
		color: var(--md-error);
	}
	.audit form {
		margin-top: 4px;
	}
	.note {
		color: var(--md-on-surface-variant);
	}

	.save-bar {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 900px) {
		.split {
			grid-template-columns: minmax(0, 1fr);
		}
		.receipt {
			height: 340px;
		}
		.pair {
			flex-direction: column;
			gap: 24px;
		}
	}

	@media (max-width: 700px) {
		.bar {
			padding: 8px 4px;
		}
		.receipt {
			height: 300px;
		}
		.save-bar {
			position: fixed;
			z-index: 5;
			left: 0;
			right: 0;
			bottom: 0;
			padding: 12px var(--gutter) calc(16px + env(safe-area-inset-bottom));
			background: var(--md-surface-container);
		}
		.save {
			width: 100%;
			height: 56px;
			font-size: 16px;
			line-height: 24px;
			letter-spacing: 0.15px;
		}
	}
</style>
