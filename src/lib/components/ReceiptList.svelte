<script lang="ts">
	import { resolve } from '$app/paths';
	import { money, pretty } from '$lib/format';
	import type { ReceiptRow } from '$lib/server/db/stats';

	interface Props {
		rows: ReceiptRow[];
		/** Shown in place of the list when there is nothing to draw. */
		empty?: string;
	}

	let { rows, empty = 'Nothing to show.' }: Props = $props();

	type IncompleteReason = ReceiptRow['reasons'][number];

	const REASON_TAG: Record<IncompleteReason, string> = {
		amount: 'Needs amount',
		provider: 'Needs provider',
		document: 'Needs image'
	};

	const href = (id: number) => resolve('/receipts/[id=integer]', { id: String(id) });
</script>

{#snippet statusTag(e: ReceiptRow)}
	{#if e.reimbursedAt}
		<span class="badge badge-paid">Reimbursed</span>
	{:else if e.reasons.length > 0}
		<span class="badge badge-needs">{REASON_TAG[e.reasons[0]]}</span>
	{:else}
		<span class="badge badge-complete">Complete</span>
	{/if}
{/snippet}

{#if rows.length === 0}
	<p class="empty">{empty}</p>
{:else}
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Date of service</th>
					<th>Provider</th>
					<th class="right">Amount</th>
					<th class="right col-status">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as e (e.id)}
					<tr>
						<td class="date">{pretty(e.serviceDate)}</td>
						<td>
							<!-- The link's ::after covers the whole row, so anywhere in it opens
							     the receipt while this stays a single, real link for keyboards. -->
							<a class="rowlink" href={href(e.id)}>{e.provider ?? 'No provider'}</a>
						</td>
						<td class="right amount" class:unread={e.amountCents == null}>
							{money(e.amountCents)}
						</td>
						<td class="right">{@render statusTag(e)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Same rows as a Material two-line list: the phone layout. -->
	<ul class="cards">
		{#each rows as e (e.id)}
			<li>
				<a class="cardrow" href={href(e.id)}>
					<span class="cardrow-main">
						<span class="cardrow-provider">{e.provider ?? 'No provider'}</span>
						<span class="cardrow-date">{pretty(e.serviceDate)}</span>
					</span>
					<span class="cardrow-right">
						<span class="amount" class:unread={e.amountCents == null}>{money(e.amountCents)}</span>
						{@render statusTag(e)}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.table-wrap {
		overflow-x: auto;
	}
	.right {
		text-align: right;
	}
	.col-status {
		width: 150px;
	}
	.date {
		font-variant-numeric: tabular-nums;
		color: var(--md-on-surface-variant);
	}
	.amount {
		font-variant-numeric: tabular-nums;
	}
	.amount.unread {
		color: var(--md-on-surface-variant);
	}

	/* Whole-row target: the row is the positioning context and the link stretches
	   across it, so clicking any cell — or the gap between them — opens the
	   receipt, while the tab order still holds one link per row. */
	tbody tr {
		position: relative;
		cursor: pointer;
	}
	.rowlink {
		color: inherit;
		text-decoration: none;
	}
	.rowlink::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	.rowlink:focus-visible::after {
		outline: 2px solid var(--md-primary);
		outline-offset: -2px;
	}

	/* — phone list — */
	.cards {
		display: none;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cardrow {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 72px;
		padding: 10px 8px 10px 0;
		border-bottom: 1px solid var(--md-outline-variant);
		color: inherit;
		text-decoration: none;
	}
	.cardrow:hover {
		background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
	}
	.cardrow-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.cardrow-provider {
		font: 400 16px/24px var(--md-font);
		letter-spacing: 0.5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cardrow-date {
		font: 400 14px/20px var(--md-font);
		letter-spacing: 0.25px;
		color: var(--md-on-surface-variant);
	}
	.cardrow-right {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.cardrow-right .amount {
		font: 500 16px/24px var(--md-font);
	}
	.empty {
		padding: 16px 0;
		color: var(--md-on-surface-variant);
	}

	@media (max-width: 700px) {
		.table-wrap {
			display: none;
		}
		.cards {
			display: block;
		}
	}
</style>
