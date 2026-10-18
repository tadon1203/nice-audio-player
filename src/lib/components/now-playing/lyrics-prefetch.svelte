<script lang="ts">
  import { LyricsPrefetchController } from "./lyrics-prefetch-controller.svelte";

  // Renders nothing: it keeps the lyrics of the current and next track fetched.
  new LyricsPrefetchController();
</script>
