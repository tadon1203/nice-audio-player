<script lang="ts">
  import { Spinner } from "$lib/ui/shadcn/spinner/index.js";

  let {
    pending,
    viewport,
    onLoadMore,
  }: { pending: boolean; viewport: HTMLElement | null; onLoadMore: () => void } = $props();

  /** How far ahead of the end of the list the next page is requested. */
  const PREFETCH_MARGIN_PX = 800;

  let element = $state<HTMLElement | null>(null);

  // Observing again after each page makes the observer report the sentinel afresh, so a page
  // that did not push it out of range is followed by the next one.
  $effect(() => {
    if (element === null || viewport === null || pending) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { root: viewport, rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<!-- Requests the next page as the end of the list nears the view. Place it right after the items. -->
<div bind:this={element} class="flex min-h-16 justify-center py-8">
  {#if pending}
    <span role="status" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner aria-hidden="true" role="presentation" />
      Loading more…
    </span>
  {/if}
</div>
