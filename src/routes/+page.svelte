<script lang="ts">
	import { enhance } from '$app/forms';
	import Cropper from 'svelte-easy-crop';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	type Expense = PageProps['data']['expenses'][number];

	//Edit dialog
	let editDialogEl = $state<HTMLDialogElement | null>(null);
	let editing = $state<Expense | null>(null);
	let errorMsg = $state<string | null>(null);

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

	function openEdit(e: Expense) {
		editing = e;
		errorMsg = null;
		editDialogEl?.showModal();
	}

	function closeEdit() {
		editDialogEl?.close();
		editing = null;
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
</script>

<header class="bar">
	<h1>Expenses</h1>
	<button class="btn btn-primary" onclick={openAdd}>
		<Icon name="plus" size={14} width={2} />
		Add
	</button>
</header>

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
		<h2>Add expense</h2>

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
			<button type="submit" class="btn btn-primary">Save expense</button>
		</div>
	</form>
</dialog>
{#if data.expenses.length === 0}
	<p class="empty">
		No expenses yet.
		<button type="button" class="btn btn-ghost" onclick={openAdd}>Add your first one.</button>
	</p>
{:else}
	<ul class="list">
		{#each data.expenses as e (e.id)}
			<li class="row">
				{#if e.thumb}
					<img class="thumb" src={e.thumb} alt="" />
				{:else}
					<div class="thumb placeholder"></div>
				{/if}

				<div class="meta">
					<span class="date">{pretty(e.serviceDate)}</span>
					<span class="provider">{e.provider ?? '-'}</span>
				</div>

				<div class="right">
					<span class="amount" class:unread={e.amountCents == null}>{money(e.amountCents)}</span>
					{#if e.amountCents == null}
						<span class="tag tag-outline">Needs amount</span>
					{:else if e.reimbursedAt}
						<span class="tag tag-accent">Reimbursed</span>
					{/if}
				</div>

				<button class="btn btn-secondary" onclick={() => openEdit(e)}>Edit</button>
			</li>
		{/each}
	</ul>

	<dialog bind:this={editDialogEl} onclose={() => (editing = null)}>
		{#if editing}
			<form
				method="POST"
				action="?/update"
				use:enhance={() =>
					async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') closeEdit();
						else if (result.type === 'failure')
							errorMsg = String(result.data?.error ?? 'Save failed.');
					}}
			>
				<h2>Edit expense</h2>
				<input type="hidden" name="id" value={editing.id} />

				<label
					>Amount <span class="opt">leave blank if unreadable</span>
					<input
						class="input"
						name="amount"
						type="text"
						inputmode="decimal"
						value={editing.amountCents == null ? '' : (editing.amountCents / 100).toFixed(2)}
					/>
				</label>

				<label
					>Date of service
					<input
						class="input"
						name="serviceDate"
						type="date"
						value={editing.serviceDate}
						required
					/>
				</label>

				<label
					>Provider
					<input class="input" name="provider" type="text" value={editing.provider ?? ''} />
				</label>

				<label class="check">
					<input type="checkbox" name="reimbursed" checked={!!editing.reimbursedAt} />
					Reimbursed
				</label>

				{#if errorMsg}<p class="error">{errorMsg}</p>{/if}

				<div class="actions">
					<button type="button" class="btn btn-secondary" onclick={closeEdit}>Cancel</button>
					<button type="submit" class="btn btn-primary">Save</button>
				</div>
			</form>
		{/if}
	</dialog>
{/if}

<style>
	/* Layout only — colour, spacing and radii come from the Nocturne tokens,
	   and buttons/inputs/tags now use the system's own classes. This page is
	   rewritten into the artboard's vault layout in a later step. */
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-4) var(--space-6);
	}
	.bar h1 {
		font-size: 25px;
		margin: 0;
	}
	.list {
		list-style: none;
		padding: 0 var(--space-6);
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 48px 1fr auto auto;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-4) 0;
		/* Nocturne row rule: fades to transparent over 48px at each end. */
		background: linear-gradient(
				to right,
				transparent,
				color-mix(in srgb, var(--color-text) 8%, transparent) 48px,
				color-mix(in srgb, var(--color-text) 8%, transparent) calc(100% - 48px),
				transparent
			)
			no-repeat bottom / 100% 1px;
	}
	.thumb {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: var(--radius-sm);
	}
	.placeholder {
		background: linear-gradient(160deg, var(--color-neutral-800), var(--color-surface));
		box-shadow: inset 0 0 0 1px var(--color-divider);
	}
	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.date {
		font-size: 12px;
		color: color-mix(in srgb, var(--color-text) 50%, transparent);
	}
	.provider {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-1);
	}
	.amount {
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-heading-weight);
	}
	/* An unread amount is absent, not zero — it should not read as a figure. */
	.amount.unread {
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}
	.opt {
		font-size: 11px;
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}
	.empty {
		padding: 0 var(--space-6);
		color: color-mix(in srgb, var(--color-text) 55%, transparent);
	}
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
	dialog label.check {
		flex-direction: row;
		align-items: center;
		gap: var(--space-3);
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
