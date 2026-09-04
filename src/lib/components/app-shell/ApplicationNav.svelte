<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	const destinations = [
		{ href: '/library', label: 'Library' },
		{ href: '/settings', label: 'Settings' }
	] as const;
	const pathname = $derived(page.url.pathname);
	const isCurrent = (href: (typeof destinations)[number]['href']) =>
		pathname === href || pathname.startsWith(`${href}/`);
</script>

<nav
	data-slot="app-navigation"
	aria-label="Application"
	class="grid grid-cols-2 content-start gap-2 border-b border-border-subtle bg-surface px-6 py-2 app-wide:grid-cols-1 app-wide:border-e app-wide:border-b-0 app-wide:px-3 app-wide:pt-18 app-wide:pb-6"
>
	{#each destinations as destination (destination.href)}
		{@const current = isCurrent(destination.href)}
		<a
			href={resolve(destination.href, {})}
			aria-current={current ? 'page' : undefined}
			class="relative flex min-h-12 items-center justify-center rounded-control px-3 text-body-lg hover:bg-surface-hover hover:text-text-primary app-wide:justify-start app-wide:px-6 {current
				? 'bg-surface-raised text-text-primary'
				: 'text-text-secondary'}"
		>
			{destination.label}
			{#if current}<span
					aria-hidden="true"
					class="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-current app-wide:inset-x-auto app-wide:inset-y-2 app-wide:start-1 app-wide:bottom-auto app-wide:h-auto app-wide:w-[3px]"
				></span>{/if}
		</a>
	{/each}
</nav>
