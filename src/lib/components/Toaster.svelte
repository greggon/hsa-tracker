<script lang="ts">
	/**
	 * The toast stack. Mounted once, in the root layout.
	 *
	 * The container is always in the DOM, even with nothing to show: a live
	 * region has to exist before content is put into it, or assistive technology
	 * has nothing to watch and the first message goes unannounced.
	 */
	import { fly } from 'svelte/transition';
	import Icon from './Icon.svelte';
	import { toasts } from '$lib/toast.svelte';

	// Svelte transitions do not consult the media query themselves.
	const reduced =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const duration = reduced ? 0 : 190;
</script>

<div class="toaster" aria-live="polite" aria-atomic="false">
	{#each toasts.items as toast (toast.id)}
		<div
			class="toast {toast.tone}"
			role={toast.tone === 'error' ? 'alert' : 'status'}
			transition:fly={{ y: 10, duration }}
		>
			{#if toast.tone === 'error'}
				<span class="mark" aria-hidden="true"><Icon name="errorCircle" size={20} /></span>
			{/if}
			<span class="message">{toast.message}</span>
			<button
				type="button"
				class="close"
				onclick={() => toasts.dismiss(toast.id)}
				aria-label="Dismiss"
			>
				<Icon name="close" size={20} />
			</button>
		</div>
	{/each}
</div>

<style>
	/* Material snackbars: inverse surface, one line where it fits. */
	.toaster {
		position: fixed;
		z-index: 60;
		left: 50%;
		transform: translateX(-50%);
		/* Clears whatever is fixed to the bottom of a phone screen: the
		   navigation bar, or the save bar. */
		bottom: calc(var(--bottom-bar) + 12px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(560px, calc(100vw - 2 * var(--gutter)));
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 4px 4px 4px 16px;
		border-radius: var(--md-shape-xs);
		background: var(--md-inverse-surface);
		color: var(--md-inverse-on-surface);
		box-shadow: var(--md-elev-3);
		font: 400 14px/20px var(--md-font);
		letter-spacing: 0.25px;
	}
	.mark {
		flex: none;
		/* The dark scheme's error tone, legible on the inverse surface. */
		color: #f2b8b5;
	}
	.message {
		flex: 1;
		min-width: 0;
		padding: 10px 0;
		/* A long provider name or a server message must wrap, never clip. */
		overflow-wrap: anywhere;
	}
	.close {
		flex: none;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--md-inverse-on-surface);
		cursor: pointer;
	}
	.close:hover {
		box-shadow: var(--md-state-hover);
	}
	.close:focus-visible {
		outline: 2px solid var(--md-inverse-primary);
		outline-offset: -2px;
	}

	@media (min-width: 701px) {
		.toaster {
			left: var(--gutter);
			transform: none;
			bottom: 24px;
			width: min(560px, calc(100vw - 2 * var(--gutter)));
		}
	}
</style>
