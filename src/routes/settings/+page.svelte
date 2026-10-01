<script lang="ts">
  import SettingsScreen from "$lib/components/settings/settings-screen.svelte";
  import { captureScroll, restoreScroll } from "$lib/shell/scroll-memory";
  import WorkspaceScroll from "$lib/ui/workspace-scroll.svelte";

  let viewport = $state<HTMLElement | null>(null);

  export const snapshot = {
    capture: () => captureScroll(viewport),
    restore: (offset: number) => restoreScroll(viewport, offset),
  };
</script>

<WorkspaceScroll bind:viewportRef={viewport} contentClass="min-h-full pt-8 pb-16">
  <SettingsScreen />
</WorkspaceScroll>
