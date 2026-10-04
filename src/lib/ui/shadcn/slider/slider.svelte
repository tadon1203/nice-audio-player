<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { Slider as SliderPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		orientation = "horizontal",

		thumbProps,
		...restProps
	}: PresentationProps<WithoutChildrenOrChild<SliderPrimitive.RootProps>> & {
		/** Attributes for each thumb, which is the element that carries role=slider (aria-label, aria-valuetext). */
		thumbProps?: Pick<SliderPrimitive.ThumbProps, "aria-label" | "aria-valuetext" | "aria-describedby">;
	} = $props();
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<SliderPrimitive.Root
	bind:ref
	bind:value={value as never}
	data-slot="slider"
	{orientation}
	class={cn(
		"data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col"
	)}
	{...restProps}
>
	{#snippet children({ thumbItems })}
		<span
			data-slot="slider-track"
			data-orientation={orientation}
			class={cn(
				"bg-muted rounded-full data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1 relative grow overflow-hidden data-horizontal:w-full data-vertical:h-full"
			)}
		>
			<SliderPrimitive.Range
				data-slot="slider-range"
				class={cn(
					"bg-primary absolute select-none data-horizontal:h-full data-vertical:w-full"
				)}
			/>
		</span>
		{#each thumbItems as thumb (thumb.index)}
			<SliderPrimitive.Thumb
				data-slot="slider-thumb"
				index={thumb.index}
				{...thumbProps}
				class="border-ring ring-ring/50 relative size-3 rounded-full border bg-foreground transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
