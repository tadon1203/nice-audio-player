<script lang="ts">
  import Copy from "@lucide/svelte/icons/copy";
  import Minus from "@lucide/svelte/icons/minus";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import { windowChrome } from "#lib/native/desktop";
  import { AppServices } from "#lib/app/app-services.svelte";
  import { Button } from "#lib/ui/shadcn/button/index.js";

  const { actions } = AppServices.current();
  let maximized = $state(false);

  $effect(() =>
    windowChrome.onMaximizedChange((value) => {
      maximized = value;
    }),
  );
</script>

<div class="flex h-10 shrink-0 items-stretch" aria-label="Window controls" role="group">
  <Button
    type="button"
    variant="quiet"
    size="inline"
    aria-label="Minimize window"
    onclick={() => actions.run(() => windowChrome.minimize())}
    class="size-10 rounded-none"
  >
    <Minus aria-hidden="true" class="size-4" />
  </Button>
  <Button
    type="button"
    variant="quiet"
    size="inline"
    aria-label={maximized ? "Restore window" : "Maximize window"}
    onclick={() => actions.run(() => windowChrome.toggleMaximize())}
    class="size-10 rounded-none"
  >
    {#if maximized}
      <Copy aria-hidden="true" class="size-3.5" />
    {:else}
      <Square aria-hidden="true" class="size-3.5" />
    {/if}
  </Button>
  <Button
    type="button"
    variant="bare"
    size="inline"
    aria-label="Close window"
    onclick={() => actions.run(() => windowChrome.close())}
    class="hover:bg-destructive hover:text-destructive-foreground size-10 rounded-none"
  >
    <X aria-hidden="true" class="size-4" />
  </Button>
</div>
