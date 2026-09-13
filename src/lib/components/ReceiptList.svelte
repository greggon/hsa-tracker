<script lang="ts">
	import { resolve } from '$app/paths';
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

	const href = (id: number) => resolve('/receipts/[id]', { id: String(id) });
</script>

{#snippet statusTag(e: ReceiptRow)}
	{#if e.reimbursedAt}
		<span class="tag tag-neutral">Reimbursed</span>
	{:else if e.reasons.length > 0}
		<span class="tag tag-outline">{REASON_TAG[e.reasons[0]]}</span>
	{:else}
		<span class="tag tag-accent">Complete</span>
	{/if}
{/snippet}

{#snippet thumb(e: ReceiptRow, w: number, h: number)}
	{#if e.docId && e.hasThumb}
		<img
			class="thumb"
			style="width:{w}px;height:{h}px"
			src={resolve('/documents/[id]', { id: String(e.docId) }) + '?thumb'}
			alt=""
			width={w}
			height={h}
			loading="lazy"
			decoding="async"
		/>
	{:else}
		<div class="thumb placeholder" style="width:{w}px;height:{h}px"></div>
	{/if}
{/snippet}

{#if rows.length === 0}
	<p class="empty">{empty}</p>
{:else}
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th class="col-thumb"><span class="visually-hidden">Receipt image</span></th>
					<th>Date of service</th>
					<th>Provider</th>
					<th class="right">Amount</th>
					<th class="right col-status">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as e (e.id)}
					<tr>
						<td>{@render thumb(e, 26, 33)}</td>
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

	<!-- Same rows, one column, thumb-reachable: the phone layout. -->
	<ul class="cards">
		{#each rows as e (e.id)}
			<li>
				<a class="cardrow" href={href(e.id)}>
					{@render thumb(e, 34, 42)}
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
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.table-wrap {
		overflow-x: auto;
	}
	.right {
		text-align: right;
	}
	.col-thumb {
		width: 38px;
	}
	.col-status {
		width: 130px;
	}
	.date {
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--color-text) 80%, transparent);
	}
	.amount {
		font-variant-numeric: tabular-nums;
	}
	.amount.unread {
		color: color-mix(in srgb, var(--color-text) 40%, transparent);
	}
	.thumb {
		object-fit: cover;
		border-radius: 3px;
		box-shadow: inset 0 0 0 1px var(--color-divider);
		flex: none;
	}
	.placeholder {
		background: linear-gradient(160deg, var(--color-neutral-800), var(--color-surface));
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
	tbody tr:hover .rowlink {
		color: var(--color-accent);
	}
	.rowlink:focus-visible::after {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
		border-radius: var(--radius-sm);
	}

	/* — phone row list — */
	.cards {
		display: none;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cardrow {
		display: flex;
		align-items: center;
		gap: 13px;
		padding: 13px 0;
		color: inherit;
		text-decoration: none;
		background: linear-gradient(
				to right,
				color-mix(in srgb, var(--color-text) 10%, transparent),
				color-mix(in srgb, var(--color-text) 10%, transparent)
			)
			no-repeat bottom / 100% 1px;
	}
	.cardrow-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.cardrow-provider {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cardrow-date {
		font-size: 11.5px;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
	.cardrow-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
		font-size: 14px;
	}
	.empty {
		color: color-mix(in srgb, var(--color-text) 55%, transparent);
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
