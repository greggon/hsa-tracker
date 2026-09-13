<script lang="ts">
    import { resolve } from '$app/paths'
    let { data } = $props();
</script>

<h1>Edit expense {data.expense.id}</h1>
<p>Coming soon.</p>
<a href={resolve("/")}>Back</a>