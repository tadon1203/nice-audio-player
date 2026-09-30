<script lang="ts">
  // TEMP Phase 2 check, delete in Phase 4
  import { getPlayback } from "$lib/playback/context";

  const playback = getPlayback();
</script>

<main class="p-8">
  <p>connection: {playback.connection}</p>
  <p>item: {playback.item?.title ?? "none"}</p>
  <p>positionMs: {playback.positionMs}</p>
</main>
