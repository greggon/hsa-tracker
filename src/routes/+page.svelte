<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	
	type Expense = PageProps['data']['expenses'][number];

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let editing = $state<Expense | null>(null);
	let errorMsg = $state<string | null>(null);

	function open(e: Expense) {
		editing = e;
		errorMsg = null;
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
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
	<a class="btn" href={resolve('/expenses/new')}>Add</a>
</header>

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

				<button class="btn edit" onclick={() => open(e)}>Edit</button>
			</li>
		{/each}
	</ul>

	<dialog bind:this={dialogEl} onclose={() => (editing = null)}>
		{#if editing}
			<form
				method="POST"
				action="?/update"
				use:enhance={() =>
					async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') close();
						else if (result.type === 'failure') errorMsg = String(result.data?.error ?? 'Save failed.');
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
					<button type="button" onclick={close}>Cancel</button>
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
</style>
