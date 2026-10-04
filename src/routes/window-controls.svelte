<script lang="ts">
  import Copy from "@lucide/svelte/icons/copy";
  import Minus from "@lucide/svelte/icons/minus";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import { nativeWindow } from "$lib/native";
  import { Button } from "$lib/ui/shadcn/button/index.js";

  const appWindow = nativeWindow;
  let maximized = $state(false);

  $effect(() => {
    if (appWindow === null) return;
    return appWindow.onMaximizedChange((value) => {
      maximized = value;
    });
  });
</script>

{#if appWindow !== null}
  <div class="flex h-10 shrink-0 items-stretch" aria-label="Window controls" role="group">
    <Button
      type="button"
      purpose="quiet"
      density="titlebar"
      aria-label="Minimize window"
      onclick={() => void appWindow.minimize()}
    >
      <Minus aria-hidden="true" class="size-4" />
    </Button>
    <Button
      type="button"
      purpose="quiet"
      density="titlebar"
      aria-label={maximized ? "Restore window" : "Maximize window"}
      onclick={() => void appWindow.toggleMaximize()}
    >
      {#if maximized}
        <Copy aria-hidden="true" class="size-3.5" />
      {:else}
        <Square aria-hidden="true" class="size-3.5" />
      {/if}
    </Button>
    <Button
      type="button"
      purpose="window-close"
      density="titlebar"
      aria-label="Close window"
      onclick={() => void appWindow.close()}
    >
      <X aria-hidden="true" class="size-4" />
    </Button>
  </div>
{/if}
