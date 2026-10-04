<script lang="ts" generics="Key extends string">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import { ButtonGroup } from "$lib/ui/shadcn/button-group/index.js";
  import { Select, SelectContent, SelectItem, SelectTrigger } from "$lib/ui/shadcn/select/index.js";
  import type { SortableView } from "./sort-option";

  let {
    selectLabel,
    view,
  }: {
    selectLabel: string;
    view: SortableView<Key>;
  } = $props();

  const options = $derived(view.sortOptions);
  const selectedLabel = $derived(options.find((option) => option.key === view.sortKey)?.label);
</script>

<ButtonGroup>
  <Select
    type="single"
    value={view.sortKey}
    items={options.map((option) => ({ label: option.label, value: option.key }))}
    onValueChange={(next) => {
      const option = options.find((candidate) => candidate.key === next);
      if (option) view.setSort(option.key);
    }}
  >
    <SelectTrigger role="combobox" width="sort-control" aria-label={selectLabel}>
      {selectedLabel}
    </SelectTrigger>
    <SelectContent>
      {#each options as option (option.key)}
        <SelectItem value={option.key} label={option.label} />
      {/each}
    </SelectContent>
  </Select>
  <Button
    type="button"
    purpose="outline"
    density="icon"
    aria-label={view.direction === "ascending" ? "Sort descending" : "Sort ascending"}
    onclick={view.toggleDirection}
  >
    {#if view.direction === "ascending"}
      <ArrowUp aria-hidden="true" />
    {:else}
      <ArrowDown aria-hidden="true" />
    {/if}
  </Button>
</ButtonGroup>
