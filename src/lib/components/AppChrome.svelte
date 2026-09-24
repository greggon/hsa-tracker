<script lang="ts">
	/**
	 * The shared frame: top app bar, phone navigation bar, and the capture
	 * sheet they open. Used by every page so they
	 * cannot drift apart.
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
	 * On a phone the vault's search starts as an icon: the full-width bar would
	 * push the hero card down, and all it filters is the list below it. The
	 * receipts list, where the list is the whole page, opens on the bar.
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
		<span class="brand-mark"><Icon name="vault" size={22} /></span>
		<span class="md-title-large">HSA Saver</span>
	</a>
	<nav class="links" aria-label="Sections">
		<a
			class="md-label-large"
			href={resolve('/')}
			aria-current={current === 'vault' ? 'page' : undefined}>Vault</a
		>
		<a
			class="md-label-large"
			href={resolve('/receipts')}
			aria-current={current === 'receipts' ? 'page' : undefined}>Receipts</a
		>
	</nav>
	<div class="nav-right">
		{#if collapsible && !searching}
			<button
				type="button"
				class="icon-btn search-toggle"
				aria-label="Search receipts"
				onclick={openSearch}
			>
				<Icon name="search" />
			</button>
		{/if}
		<label class="search-bar search">
			<Icon name="search" />
			<span class="visually-hidden">Search provider or amount</span>
			<input
				type="search"
				placeholder="Search provider or amount"
				bind:this={searchEl}
				bind:value={search}
				onblur={() => (searchOpen = false)}
			/>
		</label>
		<button class="btn btn-filled add-desktop" onclick={() => (capture = 'form')}>
			<Icon name="add" size={18} />
			File receipt
		</button>
	</div>
</header>

<TabBar {current} oncapture={() => (capture = 'camera')} />

<CaptureSheet bind:request={capture} {providers} {current} />

<style>
	.nav {
		display: flex;
		align-items: center;
		gap: 24px;
		min-height: 64px;
		padding: 8px var(--gutter);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--md-on-surface);
		text-decoration: none;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--md-shape-md);
		background: var(--md-primary-container);
		color: var(--md-on-primary-container);
	}
	/* Each destination wears the navigation indicator pill when current. */
	.links {
		display: flex;
		gap: 4px;
	}
	.links a {
		display: flex;
		align-items: center;
		height: 40px;
		padding: 0 16px;
		border-radius: var(--md-shape-full);
		color: var(--md-on-surface-variant);
		text-decoration: none;
	}
	.links a:hover {
		box-shadow: var(--md-state-hover);
	}
	.links a[aria-current='page'] {
		background: var(--md-secondary-container);
		color: var(--md-on-secondary-container);
	}
	.nav-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.search {
		width: 320px;
		height: 48px;
	}
	.search-toggle {
		display: none;
	}

	@media (max-width: 900px) {
		.nav {
			flex-wrap: wrap;
			row-gap: 8px;
		}
		.nav-right {
			width: 100%;
		}
		.search {
			flex: 1;
			width: auto;
			height: 56px;
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

		/* The search bar takes the whole row: always on Receipts, and on the
		   Vault once it is opened. */
		.nav:not(.collapsible) .brand,
		.nav.searching .brand {
			display: none;
		}

		/* Vault, search closed: the icon sits beside the brand on one row. */
		.collapsible:not(.searching) {
			flex-wrap: nowrap;
			padding-right: 4px;
		}
		.collapsible:not(.searching) .nav-right {
			width: auto;
			margin-left: auto;
		}
		.collapsible:not(.searching) .search {
			display: none;
		}
		.search-toggle {
			display: inline-grid;
		}
	}
</style>
