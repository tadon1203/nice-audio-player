<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { ScrollView } from "#lib/ui/scroll-view.svelte";
  import { Spinner } from "#lib/ui/shadcn/spinner/index.js";

  let { pending, onLoadMore }: { pending: boolean; onLoadMore: () => void } = $props();

  const scrollView = ScrollView.current();

  /** How far ahead of the end of the list the next page is requested. */
  const PREFETCH_MARGIN_PX = 800;

  // Observing again after each page makes the observer report the sentinel afresh, so a page
  // that did not push it out of range is followed by the next one. The attachment runs again
  // when `pending` or the scroll view's viewport changes, which is that observing again.
  const requestNearEnd: Attachment<HTMLElement> = (node) => {
    const viewport = scrollView.viewport;
    if (viewport === null || pending) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { root: viewport, rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px` },
    );
    observer.observe(node);
    return (): void => observer.disconnect();
  };
</script>

<!-- Requests the next page as the end of the list nears the view. Place it right after the items. -->
<div {@attach requestNearEnd} class="flex min-h-16 justify-center py-8">
  {#if pending}
    <span role="status" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner aria-hidden="true" role="presentation" />
      Loading more…
    </span>
  {/if}
</div>
