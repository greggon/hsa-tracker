<script lang="ts">
    import { enhance } from '$app/forms';
    import Cropper from 'svelte-easy-crop'

    const today = new Date().toLocaleDateString('en-CA');

    let { form } = $props();

    let previewUrl = $state<string | null>(null);
    let pickedFile = $state<File | null>(null);
    let canCrop = $state(false);
    let crop = $state({ x:0, y:0 });
    let zoom = $state(1);
    let aspect = $state(3/4);
    let pixels = $state<{ x: number; y:number; width: number; height: number } | null>(null);

    function onPick(e: Event) {
        const f = (e.currentTarget as HTMLInputElement).files?.[0];
        if(!f) return;
        pickedFile = f;
        pixels = null;
        crop = { x:0, y:0 };
        zoom = 1;

        if (previewUrl) URL.revokeObjectURL(previewUrl);

        if (f.type ==='application/pdf') {
            canCrop = false;
            previewUrl = null;
            return;
        }

        previewUrl = URL.createObjectURL(f);
        canCrop = true;
    }

</script>

<form 
    method="POST"
    enctype="multipart/form-data"
    use:enhance={({ formData }) => {
        if (pixels) {
            formData.set('cropX', String(Math.round(pixels.x)));
            formData.set('cropY', String(Math.round(pixels.y)));
            formData.set('cropW', String(Math.round(pixels.width)));
            formData.set('cropH', String(Math.round(pixels.height)));
        }
        return async ({ update }) => await update();
    }}
    >
    <label>
        Take photo
        <input type="file" name="fileCamera" accept="image/*" capture="environment" onchange={onPick} />
    </label>

    <label>
        Choose file
        <input type="file" name="filePick" accept="image/*,application/pdf" capture="environment" onchange={onPick} />
    </label>

    {#if previewUrl && canCrop }
    <div class="crop-wrap">
        <Cropper
        image={previewUrl}
        bind:crop 
        bind:zoom 
        {aspect}
        oncropcomplete={(e) => (pixels = e.pixels)}
        />
    </div>
    <div class="aspect-row">
        <button type="button" onclick={() => (aspect = 3/4)}>Portrait</button>
        <button type="button" onclick={() => (aspect = 1)}>Square</button>
        <button type="button" onclick={() => (aspect = 4/3)}>Landscape</button>
    </div>
    {:else if pickedFile}
    <p>{pickedFile.name} - will upload as-is</p>
    {/if}

    <label>Amount <input name="amount" type="text" inputmode="decimal" required /></label>
    <label>Date of service <input name="serviceDate" type="date" value={today} required /></label>
    <label>Provider <input name="provider" type="text" /></label>
    <label>Notes <textarea name="notes"></textarea></label>

    {#if form?.error}<p class="error">{form.error}</p>{/if}
    <button type="submit">Save expense</button>
    </form>

    <style>
        .crop-wrap { 
            position: relative;
            height: 320px;
            background: #222;
            margin-bottom: 0.75rem;
        }
        .aspect-row { display: flex; gap: 0.5rem; margin-top: 0.5rem;}
    </style>