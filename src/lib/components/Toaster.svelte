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
			<span class="mark" aria-hidden="true">
				<Icon name={toast.tone === 'error' ? 'cross' : 'check'} size={13} width={2.2} />
			</span>
			<span class="message">{toast.message}</span>
			<button
				type="button"
				class="close"
				onclick={() => toasts.dismiss(toast.id)}
				aria-label="Dismiss"
			>
				<Icon name="cross" size={12} width={2} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		z-index: 60;
		left: 50%;
		transform: translateX(-50%);
		/* Clears the phone tab bar, which is 92px including its safe-area pad. */
		bottom: calc(104px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(24rem, calc(100vw - 32px));
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 11px 11px 11px 13px;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		border: 1px solid var(--color-divider);
		box-shadow: var(--shadow-lg);
		font-size: 13.5px;
		line-height: 1.45;
	}

	.mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 19px;
		height: 19px;
		margin-top: 1px;
		border-radius: 99px;
	}
	.success .mark {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 20%, transparent);
	}
	.error .mark {
		color: var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 20%, transparent);
	}

	.message {
		flex: 1;
		min-width: 0;
		/* A long provider name or a server message must wrap, never clip. */
		overflow-wrap: anywhere;
	}

	.close {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
		cursor: pointer;
	}
	.close:hover {
		background: color-mix(in srgb, var(--color-text) 9%, transparent);
		color: var(--color-text);
	}
	.close:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	@media (min-width: 701px) {
		.toaster {
			left: auto;
			right: 26px;
			transform: none;
			bottom: 26px;
		}
	}
</style>
