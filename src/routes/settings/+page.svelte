<script lang="ts">
  import SettingsScreen from "./settings-screen.svelte";
  import { createWorkspaceScroll } from "$lib/shell/workspace-scroll.svelte";
  import WorkspaceScroll from "$lib/ui/workspace-scroll.svelte";

  let viewport = $state<HTMLElement | null>(null);

  const scroll = createWorkspaceScroll({ viewport: () => viewport });

  export const snapshot = {
    capture: () => scroll.capture(),
    restore: (offset: number) => scroll.restore(offset),
  };
</script>

<WorkspaceScroll bind:viewportRef={viewport} contentClass="min-h-full pt-8 pb-16">
  <SettingsScreen />
</WorkspaceScroll>
