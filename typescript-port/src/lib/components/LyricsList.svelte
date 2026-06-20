<script lang="ts">
  import { lyricsStore } from '$lib/stores';
  import type { LyricsLine } from '$lib/types';

  let { lines, activeLine, selectedLines } = $derived(lyricsStore);

  function handleLineClick(line: LyricsLine) {
    lyricsStore.setActiveLine(line.id);
  }

  function handleLineDoubleClick(line: LyricsLine) {
    lyricsStore.toggleLineSelection(line.id);
  }

  function getLineClass(line: LyricsLine): string {
    const classes = ['lyric-line'];
    
    if (line.id === activeLine) {
      classes.push('lyric-line-active');
    } else if (selectedLines.includes(line.id)) {
      classes.push('lyric-line-selected');
    } else {
      classes.push('lyric-line-idle');
    }
    
    if (line.type === 'structure') {
      classes.push('lyric-line-structure');
    } else if (line.type === 'translation') {
      classes.push('lyric-line-translation');
    }
    
    return classes.join(' ');
  }
</script>

<div class="lyrics-list flex flex-col gap-1 overflow-y-auto p-2">
  {#if lines.length === 0}
    <div class="flex items-center justify-center p-8 text-muted-foreground">
      No lyrics loaded. Open a file to get started.
    </div>
  {:else}
    {#each lines as line (line.id)}
      <button
        class={getLineClass(line)}
        onclick={() => handleLineClick(line)}
        ondblclick={() => handleLineDoubleClick(line)}
      >
        {#if line.type === 'structure'}
          <span class="text-xs font-medium uppercase tracking-wider opacity-60">
            {line.text}
          </span>
        {:else if line.type === 'translation'}
          <span class="text-sm italic opacity-70">
            {line.text}
          </span>
        {:else}
          <span>{line.text}</span>
        {/if}
      </button>
    {/each}
  {/if}
</div>

<style>
  .lyrics-list {
    scrollbar-width: thin;
  }
</style>
