import { Component, input, output } from '@angular/core';
import { LucideArrowDown, LucideArrowUp, LucideChevronDown } from '@lucide/angular';
import type { LibrarySortDirection } from '@shared/native-app-api';
import { Button } from './button';

export interface SortOption {
	readonly key: string;
	readonly label: string;
}

export interface SortChange {
	readonly key: string;
	readonly direction: LibrarySortDirection;
}

@Component({
	selector: 'app-sort-control',
	imports: [Button, LucideArrowDown, LucideArrowUp, LucideChevronDown],
	template: `
		<div
			class="flex min-h-control-default max-w-full min-w-0 flex-wrap items-center gap-2 text-body-small text-secondary"
		>
			<label [attr.for]="selectId()">{{ label() }}</label>
			<div class="relative">
				<select
					class="h-control-default w-control-search-width appearance-none rounded-small border border-transparent bg-surface-container ps-3 pe-9 text-body-small text-on-surface transition-colors outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary"
					[attr.id]="selectId()"
					[attr.aria-label]="'Sort by ' + label()"
					[value]="selectedKey()"
					(change)="onKeyChange($event)"
				>
					@for (option of options(); track option.key) {
						<option [value]="option.key">{{ option.label }}</option>
					}
				</select>
				<svg
					lucideChevronDown
					aria-hidden="true"
					class="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-secondary"
				></svg>
			</div>
			<button
				type="button"
				appButton="icon"
				class="shrink-0"
				[attr.aria-label]="direction() === 'ascending' ? 'Sort descending' : 'Sort ascending'"
				[attr.aria-pressed]="direction() === 'ascending'"
				[attr.title]="direction() === 'ascending' ? 'Sort descending' : 'Sort ascending'"
				(click)="toggleDirection()"
			>
				@if (direction() === 'ascending') {
					<svg lucideArrowUp aria-hidden="true" class="size-5"></svg>
				} @else {
					<svg lucideArrowDown aria-hidden="true" class="size-5"></svg>
				}
			</button>
		</div>
	`,
	host: { class: 'block max-w-full' }
})
export class SortControl {
	readonly label = input('Sort');
	readonly options = input.required<readonly SortOption[]>();
	readonly selectedKey = input.required<string>();
	readonly direction = input.required<LibrarySortDirection>();
	readonly sortChange = output<SortChange>();
	readonly selectId = input(`sort-${Math.random().toString(36).slice(2)}`);

	onKeyChange(event: Event): void {
		this.sortChange.emit({
			key: (event.target as HTMLSelectElement).value,
			direction: 'ascending'
		});
	}

	toggleDirection(): void {
		this.sortChange.emit({
			key: this.selectedKey(),
			direction: this.direction() === 'ascending' ? 'descending' : 'ascending'
		});
	}
}
