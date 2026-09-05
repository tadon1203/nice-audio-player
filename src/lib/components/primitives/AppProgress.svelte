<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { Progress } from '$lib/components/ui/progress';

	type Props = Omit<ComponentProps<typeof Progress>, 'value'> & {
		value: number | null;
	};

	let { value, ...restProps }: Props = $props();
</script>

<Progress value={value ?? 0} {...restProps} />
