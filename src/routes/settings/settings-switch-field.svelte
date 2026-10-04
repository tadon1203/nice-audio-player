<script lang="ts">
  import type { Snippet } from "svelte";
  import { Field, FieldLabel } from "$lib/ui/shadcn/field/index.js";
  import { Switch } from "$lib/ui/shadcn/switch/index.js";
  import { cn } from "$lib/utils/cn.js";

  /**
   * A labelled switch row. The switch shows `checked` as the caller holds it, so a change the
   * caller rejects leaves it where it was.
   */
  let {
    id,
    label,
    checked,
    onChange,
    class: className,
    children,
  }: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<Field
  orientation="horizontal"
  class={cn("items-center justify-between gap-6 border-b border-border py-3 text-sm", className)}
>
  <FieldLabel for={id} stacked>
    <span class="font-normal text-foreground">{label}</span>
    <span class="max-w-prose text-sm leading-5 font-normal text-muted-foreground">
      {@render children()}
    </span>
  </FieldLabel>
  <Switch {id} bind:checked={() => checked, onChange} />
</Field>
