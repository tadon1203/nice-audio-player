<script lang="ts">
  import SettingsScreen from "./settings-screen.svelte";
  import { useApp } from "#lib/app/app.svelte";
  import { WorkspaceScroll } from "#lib/app/scroll.svelte";
  import WorkspaceScrollRegion from "#lib/ui/workspace-scroll.svelte";

  const { scroll: scrollOffsets } = useApp();
  const scroll = new WorkspaceScroll(scrollOffsets, {});

  export const snapshot = scrollOffsets.detailSnapshot(scroll.capture, scroll.restore);
</script>

<WorkspaceScrollRegion viewportAttachment={scroll.attach} contentClass="min-h-full pt-8 pb-16">
  <SettingsScreen />
</WorkspaceScrollRegion>
