<script lang="ts">
  import { lyricsStore } from '$lib/stores';

  let { activeLine, lines } = $derived(lyricsStore);

  let visibleLines = $derived.by(() => {
    if (!activeLine || !lines.length) return [];
    
    const activeIndex = lines.findIndex(l => l.id === activeLine);
    if (activeIndex === -1) return [];
    
    const maxLines = 5;
    const start = Math.max(0, activeIndex - Math.floor(maxLines / 2));
    const end = Math.min(lines.length, start + maxLines);
    
    return lines.slice(start, end).filter(l => l.type === 'lyric');
  });
</script>

<div class="transparent-background flex h-screen w-screen items-center justify-center bg-[#1a1a2e]">
  <div class="flex flex-col items-center gap-3 p-8">
    {#each visibleLines as line (line.id)}
      <div
        class="text-center transition-all duration-300"
        class:active={line.id === activeLine}
      >
        <span
          class="font-semibold"
          style="font-size: 32px; color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.3);"
        >
          {line.text}
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  .active {
    transform: scale(1.03);
  }
</style>
