import {
	CdkConnectedOverlay,
	CdkOverlayOrigin,
	type ConnectedPosition
} from '@angular/cdk/overlay';
import { Listbox, Option } from '@angular/aria/listbox';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
	signal,
	viewChild,
	type ElementRef
} from '@angular/core';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface SelectOption {
	readonly key: string;
	readonly label: string;
	readonly disabled?: boolean;
}

const OVERLAY_POSITIONS: ConnectedPosition[] = [
	{
		originX: 'start',
		originY: 'bottom',
		overlayX: 'start',
		overlayY: 'top',
		offsetY: 4
	},
	{
		originX: 'start',
		originY: 'top',
		overlayX: 'start',
		overlayY: 'bottom',
		offsetY: -4
	}
];

function createSelectId(): string {
	return `app-select-${Math.random().toString(36).slice(2)}`;
}

@Component({
	selector: 'app-select',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkConnectedOverlay, CdkOverlayOrigin, Listbox, Option, LucideCheck, LucideChevronDown],
	template: `
		<div class="inline-flex max-w-full min-w-0 items-center gap-2">
			<label class="shrink-0" [attr.for]="selectId()">{{ label() }}</label>
			<button
				#trigger
				cdkOverlayOrigin
				type="button"
				class="inline-flex h-control-default w-control-search-width min-w-0 cursor-pointer items-center justify-between gap-3 rounded-small border border-transparent bg-surface-container px-4 text-start text-body-small text-on-surface transition-colors outline-none hover:bg-surface-container-high focus-visible:border-primary focus-visible:bg-surface-container-highest focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-highest disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45"
				role="combobox"
				[attr.id]="selectId()"
				[value]="selectedKey()"
				[attr.data-value]="selectedKey()"
				[attr.aria-label]="'Sort by ' + label()"
				[attr.aria-controls]="listboxId()"
				[attr.aria-expanded]="open()"
				[attr.aria-haspopup]="'listbox'"
				[disabled]="disabled() || options().length === 0"
				(click)="toggle()"
				(keydown)="onTriggerKeydown($event)"
			>
				<span class="min-w-0 truncate">{{ selectedOption()?.label ?? selectedKey() }}</span>
				<svg lucideChevronDown aria-hidden="true" class="size-4 shrink-0 text-secondary"></svg>
			</button>
		</div>

		<ng-template
			cdkConnectedOverlay
			[cdkConnectedOverlayOrigin]="triggerOrigin()"
			[cdkConnectedOverlayOpen]="open()"
			[cdkConnectedOverlayPositions]="overlayPositions"
			[cdkConnectedOverlayMatchWidth]="true"
			[cdkConnectedOverlayFlexibleDimensions]="true"
			[cdkConnectedOverlayPush]="true"
			[cdkConnectedOverlayViewportMargin]="8"
			(attach)="onOverlayAttach()"
			(overlayOutsideClick)="close()"
		>
			<ul
				#listbox="ngListbox"
				ngListbox
				[id]="listboxId()"
				[value]="selectedValues()"
				[disabled]="disabled()"
				[softDisabled]="false"
				[selectionMode]="'explicit'"
				[focusMode]="'roving'"
				[wrap]="true"
				class="max-h-[60vh] w-full min-w-0 overflow-y-auto rounded-small border border-outline-variant bg-surface-container-high p-2 text-on-surface outline-none"
				(click)="onListboxClick($event)"
				(keydown)="onListboxKeydown($event)"
			>
				@for (option of options(); track option.key) {
					<li
						ngOption
						[value]="option.key"
						[label]="option.label"
						[disabled]="option.disabled ?? false"
						[attr.data-select-key]="option.key"
						class="min-h-hit-target flex w-full cursor-pointer items-center justify-between gap-3 rounded-small px-3 py-3 text-body-small text-on-surface outline-none hover:bg-surface-container-high focus-visible:bg-surface-container-highest aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-45 data-[active=true]:bg-surface-container-highest data-[active=true]:text-on-surface"
					>
						<span class="min-w-0 truncate">{{ option.label }}</span>
						@if (option.key === selectedKey()) {
							<svg lucideCheck aria-hidden="true" class="size-4 shrink-0 text-primary"></svg>
						} @else {
							<span aria-hidden="true" class="size-4 shrink-0"></span>
						}
					</li>
				}
			</ul>
		</ng-template>
	`,
	host: { class: 'inline-flex max-w-full' }
})
export class AppSelect {
	readonly label = input('Select');
	readonly options = input.required<readonly SelectOption[]>();
	readonly selectedKey = input.required<string>();
	readonly disabled = input(false);
	readonly selectId = input(createSelectId());
	readonly selectionChange = output<string>();

	protected readonly open = signal(false);
	protected readonly listboxId = computed(() => `${this.selectId()}-listbox`);
	protected readonly selectedOption = computed(() =>
		this.options().find((option) => option.key === this.selectedKey())
	);
	protected readonly selectedValues = computed(() => [this.selectedKey()]);
	protected readonly overlayPositions = OVERLAY_POSITIONS;
	protected readonly triggerOrigin = viewChild.required(CdkOverlayOrigin);
	private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
	private readonly listbox = viewChild<Listbox<string>>('listbox');

	toggle(): void {
		if (this.disabled() || this.options().length === 0) return;
		this.open.update((isOpen) => !isOpen);
	}

	openSelect(): void {
		if (this.disabled() || this.options().length === 0) return;
		this.open.set(true);
	}

	close(restoreFocus = true): void {
		if (!this.open()) return;
		this.open.set(false);
		if (restoreFocus) {
			queueMicrotask(() => this.trigger()?.nativeElement.focus());
		}
	}

	onTriggerKeydown(event: KeyboardEvent): void {
		if (this.open()) return;
		if (
			event.key === 'Enter' ||
			event.key === ' ' ||
			event.key === 'ArrowDown' ||
			event.key === 'ArrowUp'
		) {
			event.preventDefault();
			this.openSelect();
		}
	}

	onOverlayAttach(): void {
		queueMicrotask(() => {
			const listbox = this.listbox();
			if (!listbox) return;
			const selectedIndex = this.options().findIndex((option) => option.key === this.selectedKey());
			listbox.gotoIndex(selectedIndex >= 0 ? selectedIndex : 0);
			if (typeof HTMLElement.prototype.scrollIntoView === 'function') {
				listbox.scrollActiveItemIntoView();
			}
		});
	}

	onListboxKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			this.close();
		} else if (event.key === 'Tab') {
			this.close(false);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopImmediatePropagation();
			const option = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]');
			const key = option?.dataset['selectKey'];
			if (key) this.commit(key);
		}
	}

	onListboxClick(event: MouseEvent): void {
		const optionElement = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]');
		const key = optionElement?.dataset['selectKey'];
		const option = this.options().find((candidate) => candidate.key === key);
		if (!option) return;
		event.stopPropagation();
		if (option.disabled) return;
		this.commit(option.key);
	}

	private commit(key: string): void {
		this.selectionChange.emit(key);
		this.close();
	}
}
