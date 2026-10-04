<script lang="ts">
  import Menu from "@lucide/svelte/icons/menu";
  import X from "@lucide/svelte/icons/x";
  import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetTitle,
    SheetTrigger,
  } from "$lib/ui/shadcn/sheet/index.js";
  import Navigation from "./navigation.svelte";
  import WindowControls from "./window-controls.svelte";

  let mobileNavigationOpen = $state(false);
</script>

<header
  class="col-span-full row-start-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] border-b border-border bg-background md:grid-cols-[16rem_minmax(0,1fr)_auto]"
  data-slot="app-titlebar"
>
  <div class="flex min-w-0 items-center gap-2 border-sidebar-border px-2 md:border-r md:px-4">
    <Sheet bind:open={mobileNavigationOpen}>
      <div class="md:hidden">
        <SheetTrigger type="button" aria-label="Open navigation">
          <Menu aria-hidden="true" class="size-4" />
        </SheetTrigger>
      </div>
      <SheetContent
        side="left"
        showCloseButton={false}
        width="navigation"
        flush
        surface="navigation"
      >
        <div class="flex h-10 items-center justify-between border-b border-sidebar-border px-3">
          <SheetTitle>Nice Audio Player</SheetTitle>
          <SheetClose type="button" aria-label="Close navigation">
            <X aria-hidden="true" class="size-4" />
          </SheetClose>
        </div>
        <Navigation onNavigate={() => (mobileNavigationOpen = false)} />
      </SheetContent>
    </Sheet>
    <div aria-hidden="true" class="min-w-0 flex-1" data-tauri-drag-region></div>
  </div>
  <div aria-hidden="true" class="hidden min-w-0 md:block" data-tauri-drag-region></div>
  <WindowControls />
</header>
