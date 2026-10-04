<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { applyCssMotion } from "$lib/ui/motion/css-motion";
  import { Button } from "$lib/ui/shadcn/button";
  import * as Dialog from "$lib/ui/shadcn/alert-dialog";
  import * as Select from "$lib/ui/shadcn/select";
  import * as Menu from "$lib/ui/dropdown-menu";
  import * as Tooltip from "$lib/ui/shadcn/tooltip";

  let chosen = $state("first");
  let selected = $state("first");
  $effect(() => applyCssMotion(document.documentElement, prefersReducedMotion.current));
</script>

<main class="bg-background text-foreground h-full p-8">
  <Dialog.Root>
    <Dialog.Trigger>Open confirmation</Dialog.Trigger>
    <Dialog.Content>
      <Dialog.Title>Nested controls</Dialog.Title>
      <Dialog.Description>Choose an option without losing the confirmation.</Dialog.Description>
      <Select.Root type="single" bind:value={chosen}>
        <Select.Trigger role="combobox" aria-label="Nested selection">{chosen}</Select.Trigger>
        <Select.Content>
          <Select.Item value="first" label="First">First</Select.Item>
          <Select.Item value="second" label="Second">Second</Select.Item>
        </Select.Content>
      </Select.Root>
      <Menu.Root>
        <Menu.Trigger aria-label="Nested menu">Commands</Menu.Trigger>
        <Menu.Content>
          <Menu.RadioGroup bind:value={selected}>
            <Menu.RadioItem value="first">First command</Menu.RadioItem>
            <Menu.RadioItem value="second">Second command</Menu.RadioItem>
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Root>
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}<Button {...props}>Help</Button>{/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Readable nested help</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
      <Dialog.Cancel>Cancel</Dialog.Cancel>
    </Dialog.Content>
  </Dialog.Root>
</main>
