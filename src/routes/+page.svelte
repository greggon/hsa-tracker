<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import Cropper from 'svelte-easy-crop';
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

	const money = (cents: number) =>
		(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

	const pretty = (iso: string) =>
		new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
</script>

<header class="bar">
	<h1>Expenses</h1>
	<button class="btn" onclick={openAdd}>Add</button>
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
			<label class="btn"
				>Take photo
				<input
					type="file"
					name="fileCamera"
					accept="image/*"
					capture="environment"
					onchange={onPick}
					hidden
				/>
			</label>

			<label class="btn"
				>Choose file
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
				<button type="button" onclick={() => (aspect = 3 / 4)}>Portrait</button>
				<button type="button" onclick={() => (aspect = 1)}>Square</button>
				<button type="button" onclick={() => (aspect = 4 / 3)}>Landscape</button>
			</div>
		{:else if pickedFile}
			<p class="hint">{pickedFile.name} - will upload as-is</p>
		{/if}

		<label>Amount <input name="amount" type="text" inputmode="decimal" required /></label>
		<label>Date of service <input name="serviceDate" type="date" value={today} required /></label>
		<label>Provider <input name="provider" type="text" /></label>
		<label>Notes <textarea name="notes"></textarea></label>

		{#if addError}<p class="error">{addError}</p>{/if}

		<button type="button" onclick={closeAdd}>Cancel</button>
		<button type="submit">Save expense</button>
	</form>
</dialog>
{#if data.expenses.length === 0}
	<p class="empty">No expenses yet. <a href={resolve('/expenses/new')}>Add your first one.</a></p>
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
					<span class="amount">{money(e.amountCents)}</span>
					{#if e.reimbursedAt}
						<span class="tag">Reimbured</span>
					{/if}
				</div>

				<button class="btn edit" onclick={() => openEdit(e)}>Edit</button>
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
					>Amount
					<input
						name="amount"
						type="text"
						inputmode="decimal"
						value={(editing.amountCents / 100).toFixed(2)}
						required
					/>
				</label>

				<label
					>Date of service
					<input name="serviceDate" type="date" value={editing.serviceDate} required />
				</label>

				<label
					>Provider
					<input name="provider" type="text" value={editing.provider ?? ''} />
				</label>

				<label
					>Category
					<select name="category" value={editing.category ?? ''}>
						<option value="">-</option>
						<option value="medical">Medical</option>
						<option value="dental">Dental</option>
						<option value="vision">Vision</option>
						<option value="pharmacy">Pharmacy</option>
					</select>
				</label>

				<label
					>Patient
					<input name="patient" type="text" value={editing.patient ?? ''} />
				</label>

				<label
					>Notes
					<textarea name="notes">{editing.notes ?? ''}</textarea>
				</label>

				<label class="check">
					<input type="checkbox" name="reimbursed" checked={!!editing.reimbursedAt} />
					Reimbursed
				</label>

				{#if errorMsg}<p class="error">{errorMsg}</p>{/if}

				<div class="actions">
					<button type="button" onclick={closeEdit}>Cancel</button>
					<button type="submit">Save</button>
				</div>
			</form>
		{/if}
	</dialog>
{/if}

<style>
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 48px 1fr auto auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.75rem 0;
		border-bottom: 1px solid #e5e5e5;
	}
	.thumb {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: 4px;
	}
	.placeholder {
		background: #eee;
	}
	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.date {
		font-size: 0.8rem;
		color: #666;
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
	}
	.amount {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.tag {
		font-size: 0.7rem;
		color: #3a7;
	}
	.btn {
		padding: 0.4rem 0.7rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		text-decoration: none;
	}
	.empty {
		color: #666;
	}
	dialog {
		border: none;
		border-radius: 8px;
		padding: 1.25rem;
		width: min(28rem, 92vw);
		max-height: 90vh;
		overflow-y: auto;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	dialog form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	dialog label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
	}
	dialog label.check {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}
	dialog input,
	dialog select,
	dialog textarea {
		font: inherit;
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.error {
		color: #c00;
		margin: 0;
	}
	.crop-wrap {
		position: relative;
		height: 260px;
		background: #222;
		border-radius: 4px;
		margin-bottom: 0.75rem;
	}
	.file-row {
		display: flex;
		gap: 0.5rem;
	}
	.zoom {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}
	.aspect-row {
		display: flex;
		gap: 0.5rem;
	}
	.hint {
		font-size: 0.85rem;
		color: #666;
		margin: 0;
	}
</style>
