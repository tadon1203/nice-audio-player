<script lang="ts">
  import PageTitle from "#lib/ui/page-title.svelte";
  import LibraryDirectoriesSection from "./library-directories-section.svelte";
  import PlaybackSection from "./playback-section.svelte";
</script>

<section aria-labelledby="settings-heading">
  <div class="border-b border-border pb-7">
    <PageTitle id="settings-heading">Settings</PageTitle>
    <p class="mt-2 max-w-prose text-sm leading-5 text-muted-foreground">
      Library directories and playback preferences.
    </p>
  </div>
  <LibraryDirectoriesSection />
  <PlaybackSection />
</section>
