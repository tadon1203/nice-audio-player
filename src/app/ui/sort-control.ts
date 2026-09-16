import { Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp } from '@ng-icons/lucide';
import type { LibrarySortDirection } from '@shared/native-app-api';
import { HlmButton } from '@app/ui/spartan/button';
import { HlmSelectImports } from '@app/ui/spartan/select';

export interface SortOption {
	readonly key: string;
	readonly label: string;
	readonly disabled?: boolean;
}

export interface SortChange {
	readonly key: string;
	readonly direction: LibrarySortDirection;
}

let nextSortControlId = 0;

@Component({
	selector: 'app-sort-control',
	imports: [HlmButton, NgIcon, ...HlmSelectImports],
	providers: [provideIcons({ lucideArrowDown, lucideArrowUp })],
	template: `
		<div
			class="flex min-h-control-default max-w-full min-w-0 flex-wrap items-center gap-control text-body text-content-secondary"
		>
			<label [for]="triggerId" class="text-body text-content-secondary">{{ label() }}</label>
			<hlm-select
				[value]="selectedKey()"
				[itemToString]="itemToString"
				(valueChange)="onKeyChange($event)"
			>
				<hlm-select-trigger [buttonId]="triggerId" class="w-sort-control">
					<hlm-select-value />
				</hlm-select-trigger>
				<hlm-select-content *hlmSelectPortal>
					<hlm-select-group>
						@for (option of options(); track option.key) {
							<hlm-select-item [value]="option.key" [disabled]="option.disabled ?? false">
								{{ option.label }}
							</hlm-select-item>
						}
					</hlm-select-group>
				</hlm-select-content>
			</hlm-select>
			<button
				type="button"
				hlmBtn
				variant="ghost"
				size="icon-sm"
				[attr.aria-label]="direction() === 'ascending' ? 'Sort descending' : 'Sort ascending'"
				[attr.title]="direction() === 'ascending' ? 'Sort descending' : 'Sort ascending'"
				(click)="toggleDirection()"
			>
				@if (direction() === 'ascending') {
					<ng-icon name="lucideArrowUp" aria-hidden="true" class="size-icon text-icon" />
				} @else {
					<ng-icon name="lucideArrowDown" aria-hidden="true" class="size-icon text-icon" />
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
	protected readonly triggerId = `sort-control-${++nextSortControlId}`;
	protected readonly itemToString = (key: string): string =>
		this.options().find((option) => option.key === key)?.label ?? key;

	protected onKeyChange(key: string | null | undefined): void {
		if (typeof key !== 'string') return;
		this.sortChange.emit({ key, direction: 'ascending' });
	}

	protected toggleDirection(): void {
		this.sortChange.emit({
			key: this.selectedKey(),
			direction: this.direction() === 'ascending' ? 'descending' : 'ascending'
		});
	}
}
