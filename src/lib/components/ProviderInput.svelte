<script lang="ts">
	import { filterProviders, highlight } from '$lib/providers';

	interface Props {
		value?: string;
		/** The user's providers, most-used first. */
		suggestions?: string[];
		id?: string;
		name?: string;
		placeholder?: string;
	}

	let {
		value = $bindable(''),
		suggestions = [],
		id = 'provider',
		name = 'provider',
		placeholder = ''
	}: Props = $props();

	let open = $state(false);
	let active = $state(-1);
	let inputEl = $state<HTMLInputElement | null>(null);

	const matches = $derived(filterProviders(suggestions, value));
	const showing = $derived(open && matches.length > 0);
	const listId = $derived(`${id}-suggestions`);

	function choose(provider: string) {
		value = provider;
		open = false;
		active = -1;
		inputEl?.focus();
	}

	function dismiss() {
		open = false;
		active = -1;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showing) {
			// The capture sheet is a <dialog>, which closes itself on Escape.
			// Stopping the event here means the first press dismisses only the
			// suggestions, not the whole form.
			event.preventDefault();
			event.stopPropagation();
			dismiss();
			return;
		}

		if (!showing) {
			if (event.key === 'ArrowDown' && matches.length > 0) {
				event.preventDefault();
				open = true;
				active = 0;
			}
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = (active + 1) % matches.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = active <= 0 ? matches.length - 1 : active - 1;
		} else if (event.key === 'Enter' && active >= 0) {
			// Without this the keypress would submit the form instead.
			event.preventDefault();
			choose(matches[active]);
		} else if (event.key === 'Tab' && active >= 0) {
			choose(matches[active]);
		}
	}
</script>

<div class="combo">
	<input
		bind:this={inputEl}
		bind:value
		{id}
		{name}
		{placeholder}
		class="input"
		type="text"
		autocomplete="off"
		role="combobox"
		aria-expanded={showing}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
		oninput={() => {
			open = true;
			active = -1;
		}}
		onfocus={() => (open = true)}
		onblur={dismiss}
		onkeydown={onKeydown}
	/>

	{#if showing}
		<!--
			In flow rather than floating: the sheet's body and the dialog itself both
			scroll, and an absolutely positioned menu is clipped by whichever of them
			runs out of room first — invisible exactly when the field is near the
			bottom, which is where it sits. Pushing the footer down is the lesser
			cost of the two.
		-->
		<ul class="menu" id={listId} role="listbox" aria-label="Providers you have used">
			{#each matches as provider, i (provider)}
				{@const [before, match, after] = highlight(provider, value)}
				<li
					id="{listId}-{i}"
					role="option"
					aria-selected={i === active}
					class:active={i === active}
				>
					<!-- pointerdown is prevented so the input keeps focus and blur does
					     not close the menu before the click lands. -->
					<button
						type="button"
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => choose(provider)}
						onmouseenter={() => (active = i)}
					>
						{before}<mark>{match}</mark>{after}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.combo {
		display: contents;
	}
	.menu {
		list-style: none;
		margin: 5px 0 0;
		padding: 4px;
		max-height: 196px;
		overflow-y: auto;
		background: var(--color-bg);
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}
	.menu button {
		display: block;
		width: 100%;
		padding: 7px 9px;
		text-align: left;
		font: inherit;
		font-size: 14px;
		color: var(--color-text);
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	li.active button,
	.menu button:hover {
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	}
	mark {
		background: none;
		color: var(--color-accent);
		font-weight: var(--font-heading-weight);
	}
</style>
