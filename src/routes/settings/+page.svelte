<script lang="ts">
  import SettingsScreen from "./settings-screen.svelte";
  import { AppServices } from "#lib/app/app-services.svelte";
  import { WorkspaceScroll } from "#lib/app/workspace-scroll.svelte";
  import WorkspaceScrollRegion from "#lib/ui/workspace-scroll.svelte";

  const { scrollMemory } = AppServices.current();
  const scroll = new WorkspaceScroll(scrollMemory, {});

  export const snapshot = scrollMemory.detailSnapshot(scroll.capture, scroll.restore);
</script>

<WorkspaceScrollRegion viewportAttachment={scroll.attach} contentClass="min-h-full pt-8 pb-16">
  <SettingsScreen />
</WorkspaceScrollRegion>
