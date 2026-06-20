<script lang="ts">
  let count = $state(0);
</script>

<main class="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
  <h1 class="text-4xl font-bold">LyricDisplay</h1>
  <p class="mt-4 text-muted-foreground">Svelte 5 + TypeScript migration in progress</p>
  <button
    class="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
    onclick={() => count++}
  >
    Count: {count}
  </button>
</main>
