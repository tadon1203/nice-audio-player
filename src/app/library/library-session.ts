import { DestroyRef, Service, Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject } from 'rxjs';
import type { LibraryScanSnapshot, LibraryStatus } from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { libraryCommandErrorMessage } from './library-errors';

@Service()
export class LibrarySession {
	private readonly backend = inject(Backend);
	private readonly destroyRef = inject(DestroyRef);
	private readonly statusState = signal<LibraryStatus | null>(null);
	private readonly scanState = signal<LibraryScanSnapshot | null>(null);
	private readonly initializingState = signal(true);
	private readonly errorState = signal<string | null>(null);
	private readonly catalogChangedSubject = new Subject<void>();

	readonly status: Signal<LibraryStatus | null> = this.statusState.asReadonly();
	readonly scan: Signal<LibraryScanSnapshot | null> = this.scanState.asReadonly();
	readonly initializing: Signal<boolean> = this.initializingState.asReadonly();
	readonly error: Signal<string | null> = this.errorState.asReadonly();
	readonly catalogChanged: Observable<void> = this.catalogChangedSubject.asObservable();

	constructor() {
		this.backend.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
			if (event.event !== 'libraryScanStateChanged') return;
			const previous = this.scanState();
			this.scanState.set(event.payload);
			if (previous?.state !== 'completed' && event.payload.state === 'completed')
				this.catalogChangedSubject.next();
		});
		void this.initialize();
	}

	async startScan(): Promise<void> {
		this.errorState.set(null);
		try {
			await this.backend.startLibraryScan();
			this.scanState.set(await this.backend.getLibraryScanState());
		} catch (error) {
			this.errorState.set(libraryCommandErrorMessage(error));
		}
	}

	async cancelScan(): Promise<void> {
		this.errorState.set(null);
		try {
			await this.backend.cancelLibraryScan();
			this.scanState.set(await this.backend.getLibraryScanState());
		} catch (error) {
			this.errorState.set(libraryCommandErrorMessage(error));
		}
	}

	invalidateCatalog(): void {
		this.catalogChangedSubject.next();
	}

	private async initialize(): Promise<void> {
		try {
			this.statusState.set(await this.backend.getLibraryStatus());
			this.scanState.set(await this.backend.getLibraryScanState());
		} catch (error) {
			this.errorState.set(libraryCommandErrorMessage(error));
		} finally {
			this.initializingState.set(false);
		}
	}
}
