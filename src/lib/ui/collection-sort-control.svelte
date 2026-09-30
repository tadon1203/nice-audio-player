<script lang="ts" generics="Key extends string">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import type { LibrarySortDirection } from "$lib/native";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import { ButtonGroup } from "$lib/ui/shadcn/button-group/index.js";
  import { Select, SelectContent, SelectItem, SelectTrigger } from "$lib/ui/shadcn/select/index.js";
  import type { SortOption } from "./sort-option";

  let {
    selectLabel,
    value,
    options,
    direction,
    onValueChange,
    onToggleDirection,
  }: {
    selectLabel: string;
    value: Key;
    options: readonly SortOption<Key>[];
    direction: LibrarySortDirection;
    onValueChange: (value: Key) => void;
    onToggleDirection: () => void;
  } = $props();

  const selectedLabel = $derived(options.find((option) => option.key === value)?.label);
</script>

<ButtonGroup>
  <Select
    type="single"
    {value}
    items={options.map((option) => ({ label: option.label, value: option.key }))}
    onValueChange={(next) => {
      const option = options.find((candidate) => candidate.key === next);
      if (option) onValueChange(option.key);
    }}
  >
    <SelectTrigger role="combobox" class="w-40 shrink-0" aria-label={selectLabel}>
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
    variant="outline"
    size="icon"
    aria-label={direction === "ascending" ? "Sort descending" : "Sort ascending"}
    onclick={onToggleDirection}
  >
    {#if direction === "ascending"}
      <ArrowUp aria-hidden="true" />
    {:else}
      <ArrowDown aria-hidden="true" />
    {/if}
  </Button>
</ButtonGroup>
