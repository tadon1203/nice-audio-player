import { Component, input, output } from '@angular/core';
import { LucideArrowDown, LucideArrowUp } from '@lucide/angular';
import type { LibrarySortDirection } from '@shared/native-app-api';
import { AppSelect, type SelectOption } from './app-select';
import { Button } from './button';

export interface SortChange {
	readonly key: string;
	readonly direction: LibrarySortDirection;
}

@Component({
	selector: 'app-sort-control',
	imports: [AppSelect, Button, LucideArrowDown, LucideArrowUp],
	template: `
		<div
			class="flex min-h-control-default max-w-full min-w-0 flex-wrap items-center gap-control text-body text-content-secondary"
		>
			<app-select
				[label]="label()"
				[options]="options()"
				[selectedKey]="selectedKey()"
				[selectId]="selectId()"
				(selectionChange)="onKeyChange($event)"
			/>
			<button
				type="button"
				appButton="icon-compact"
				[attr.aria-label]="direction() === 'ascending' ? 'Sort descending' : 'Sort ascending'"
				[attr.aria-pressed]="direction() === 'ascending'"
				[attr.title]="direction() === 'ascending' ? 'Sort descending' : 'Sort ascending'"
				(click)="toggleDirection()"
			>
				@if (direction() === 'ascending') {
					<svg lucideArrowUp aria-hidden="true" class="size-icon"></svg>
				} @else {
					<svg lucideArrowDown aria-hidden="true" class="size-icon"></svg>
				}
			</button>
		</div>
	`,
	host: { class: 'block max-w-full' }
})
export class SortControl {
	readonly label = input('Sort');
	readonly options = input.required<readonly SelectOption[]>();
	readonly selectedKey = input.required<string>();
	readonly direction = input.required<LibrarySortDirection>();
	readonly sortChange = output<SortChange>();
	readonly selectId = input(`sort-${Math.random().toString(36).slice(2)}`);

	onKeyChange(key: string): void {
		this.sortChange.emit({
			key,
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
