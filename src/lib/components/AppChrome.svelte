<script lang="ts">
	/**
	 * The shared frame: header, phone tab bar, and the capture sheet all three
	 * ways of reaching it open. Used by every page so they cannot drift apart.
	 */
	import { flushSync } from 'svelte';
	import { resolve } from '$app/paths';
	import CaptureSheet, { type CaptureRequest } from './CaptureSheet.svelte';
	import Icon from './Icon.svelte';
	import TabBar from './TabBar.svelte';

	interface Props {
		/** Which section is being viewed, for the nav and tab-bar highlight. */
		current: 'vault' | 'receipts';
		/** Two-way bound so each page can filter its own rows. */
		search?: string;
		/**
		 * The user's providers, for the capture sheet's autocomplete. Passed in
		 * rather than read from `page.data` so this component states what it
		 * needs and can be rendered anywhere.
		 */
		providers?: string[];
		/** Bound by pages that offer their own "add a receipt" affordance. */
		capture?: CaptureRequest;
	}

	let {
		current,
		search = $bindable(''),
		providers = [],
		capture = $bindable(null)
	}: Props = $props();

	/**
	 * On a phone the vault's search starts as an icon: the full-width field
	 * would push the hero figure down, and all it filters is the list below it.
	 * The receipts list, where the list is the whole page, keeps the field.
	 */
	const collapsible = $derived(current === 'vault');
	let searchOpen = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);
	const searching = $derived(searchOpen || search !== '');

	/** Focused synchronously, inside the tap, or iOS will not raise the keyboard. */
	function openSearch() {
		flushSync(() => (searchOpen = true));
		searchEl?.focus();
	}
</script>

<header class="nav" class:collapsible class:searching>
	<a class="brand" href={resolve('/')}>
		<Icon name="vault" size={17} />
		HSA Saver
	</a>
	<nav class="links">
		<a href={resolve('/')} aria-current={current === 'vault' ? 'page' : undefined}>Vault</a>
		<a href={resolve('/receipts')} aria-current={current === 'receipts' ? 'page' : undefined}>
			Receipts
		</a>
	</nav>
	<div class="nav-right">
		{#if collapsible && !searching}
			<button
				type="button"
				class="btn btn-icon search-toggle"
				aria-label="Search receipts"
				onclick={openSearch}
			>
				<Icon name="search" size={20} width={1.8} />
			</button>
		{/if}
		<label class="visually-hidden" for="chrome-search">Search provider or amount</label>
		<input
			id="chrome-search"
			class="input search"
			type="search"
			placeholder="Search provider or amount"
			bind:this={searchEl}
			bind:value={search}
			onblur={() => (searchOpen = false)}
		/>
		<button class="btn btn-primary add-desktop" onclick={() => (capture = 'form')}>
			<Icon name="plus" size={14} width={2} />
			Add receipt
		</button>
	</div>
</header>

<TabBar {current} oncapture={() => (capture = 'camera')} />

<CaptureSheet bind:request={capture} {providers} {current} />

<style>
	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		padding: 14px var(--gutter);
		border-bottom: 1px solid var(--color-rule);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 17px;
		letter-spacing: -0.02em;
		color: var(--color-text);
		text-decoration: none;
	}
	.brand :global(svg) {
		color: var(--color-accent);
	}
	.links {
		display: flex;
		gap: 20px;
		font-size: 13.5px;
	}
	.links a {
		text-decoration: none;
		color: color-mix(in srgb, var(--color-text) 60%, transparent);
	}
	.links a[aria-current='page'] {
		color: var(--color-accent);
	}
	.nav-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.search {
		width: 220px;
		min-height: 32px;
	}
	.search-toggle {
		display: none;
	}

	@media (max-width: 900px) {
		.nav {
			flex-wrap: wrap;
			gap: var(--space-4);
		}
		.nav-right {
			width: 100%;
		}
		.search {
			flex: 1;
			width: auto;
		}
	}

	@media (max-width: 700px) {
		.links,
		.add-desktop {
			display: none;
		}
		.nav-right {
			margin-left: 0;
		}
		.search {
			min-height: 44px;
		}

		/* Vault, search closed: the icon sits beside the brand on one row. */
		.collapsible:not(.searching) {
			flex-wrap: nowrap;
			padding-block: 6px;
			padding-right: calc(var(--gutter) - 12px);
		}
		.collapsible:not(.searching) .nav-right {
			width: auto;
			margin-left: auto;
		}
		.collapsible:not(.searching) .search {
			display: none;
		}
		.search-toggle {
			display: inline-flex;
			color: color-mix(in srgb, var(--color-text) 75%, transparent);
		}
	}
</style>
