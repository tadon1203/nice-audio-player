<script lang="ts">
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { cn } from '$lib/utils.js';
	import type { SVGAttributes } from 'svelte/elements';

	let {
		class: className,
		role = 'status',
		// we add name, color, and stroke for compatibility with different icon libraries props
		name,
		color,
		stroke,
		'aria-label': ariaLabel = 'Loading',
		...restProps
	}: SVGAttributes<SVGSVGElement> = $props();
</script>

<Loader2Icon
	{role}
	name={name ?? ''}
	color={color ?? ''}
	stroke={stroke ?? ''}
	aria-label={ariaLabel}
	class={cn('animate-spin size-4', className)}
	{...restProps}
/>
