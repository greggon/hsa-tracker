<script lang="ts">
    import { resolve } from '$app/paths';

	let { data } = $props();

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
	<a class="btn" href={resolve("/expenses/new")}>Add</a>
</header>

{#if data.expenses.length === 0}
	<p class="empty">No expenses yet. <a href={resolve("/expenses/new")}>Add your first one.</a></p>
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

				<a class="btn edit" href={resolve("/expenses/[id]/edit", { id: String(e.id)})}>Edit</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
    .bar { display: flex; justify-content: space-between; align-items: center; }
    .list { list-style: none; padding: 0; margin: 0; }
    .row {
        display: grid;
        grid-template-columns: 48px 1fr auto auto;
        gap: 0.75rem;
        align-items: center;
        padding: 0.75rem 0;
        border-bottom: 1px solid #e5e5e5;
    }
    .thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }
    .placeholder { background: #eee }
    .meta { display: flex; flex-direction: column; min-width: 0;}
    .date { font-size: 0.8rem; color: #666;}
    .provider { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;}
    .right { display: flex; flex-direction: column; align-items: flex-end; }
    .amount { font-variant-numeric: tabular-nums; font-weight: 600;}
    .tag { font-size: 0.7rem; color: #3a7;}
    .btn { padding: 0.4rem 0.7rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none;}
    .empty { color: #666;}
</style>