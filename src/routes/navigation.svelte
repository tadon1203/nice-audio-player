<script lang="ts">
  import Album from "@lucide/svelte/icons/album";
  import LibraryBig from "@lucide/svelte/icons/library-big";
  import ListMusic from "@lucide/svelte/icons/list-music";
  import Settings2 from "@lucide/svelte/icons/settings-2";
  import type { Component } from "svelte";
  import { crossfade, fade } from "svelte/transition";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { Button } from "$lib/ui/shadcn/button/index.js";

  type NavigationItem = {
    label: string;
    to: "/library/albums" | "/library/album-artists" | "/library/tracks" | "/settings";
    icon: Component;
  };

  let { onNavigate }: { onNavigate?: () => void } = $props();

  const libraryItems: readonly NavigationItem[] = [
    { label: "Albums", to: "/library/albums", icon: LibraryBig },
    { label: "Album Artists", to: "/library/album-artists", icon: Album },
    { label: "Tracks", to: "/library/tracks", icon: ListMusic },
  ];
  const settingsItem: NavigationItem = { label: "Settings", to: "/settings", icon: Settings2 };

  function isActive(to: NavigationItem["to"]) {
    const pathname = page.url.pathname;
    return to === "/settings" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  }

  // The selection pill slides between items: it leaves one link and arrives at the next.
  // `crossfade` is created per Navigation, because the sidebar and the mobile sheet can both be
  // mounted and must not trade pills.
  const [send, receive] = crossfade({
    duration: () => motionFor("move").duration,
    easing: (t) => motionFor("move").easing(t),
    fallback: (node) => fade(node, { duration: motionFor("feedback").duration }),
  });
</script>

{#snippet link(item: NavigationItem)}
  {@const active = isActive(item.to)}
  <Button
    variant="quiet"
    size="standard"
    href={resolve(item.to)}
    aria-current={active ? "page" : undefined}
    onclick={onNavigate}
    class="relative h-10 w-full justify-start gap-2 px-2 text-muted-foreground aria-[current=page]:text-foreground hover:bg-sidebar-accent"
  >
    {#if active}
      <span
        aria-hidden="true"
        class="absolute inset-0 rounded-md bg-muted"
        in:receive={{ key: "navigation-selection" }}
        out:send={{ key: "navigation-selection" }}
      ></span>
    {/if}
    <item.icon aria-hidden="true" class="relative" />
    <span class="relative truncate">{item.label}</span>
  </Button>
{/snippet}

<nav
  aria-label="Application"
  class="flex min-h-0 flex-1 flex-col px-2 py-5 md:border-r md:border-sidebar-border"
>
  <div class="min-h-0 flex-1">
    <p class="mb-2 px-2 text-sm text-muted-foreground">Library</p>
    <div class="space-y-1">
      {#each libraryItems as item (item.to)}
        {@render link(item)}
      {/each}
    </div>
  </div>
  {@render link(settingsItem)}
</nav>
