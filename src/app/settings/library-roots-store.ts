import { Injectable, Signal, inject, signal } from '@angular/core';
import type { LibraryRoot } from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { libraryCommandErrorMessage } from '@app/library/library-errors';
import { LibrarySession } from '@app/library/library-session';

@Injectable()
export class LibraryRootsStore {
	private readonly backend = inject(Backend);
	private readonly library = inject(LibrarySession);
	private readonly rootsState = signal<readonly LibraryRoot[]>([]);
	private readonly loadingState = signal(false);
	private readonly errorState = signal<string | null>(null);
	private readonly pendingIdsState = signal<ReadonlySet<string>>(new Set());

	readonly roots: Signal<readonly LibraryRoot[]> = this.rootsState.asReadonly();
	readonly loading: Signal<boolean> = this.loadingState.asReadonly();
	readonly error: Signal<string | null> = this.errorState.asReadonly();
	readonly pendingIds: Signal<ReadonlySet<string>> = this.pendingIdsState.asReadonly();

	async load(): Promise<void> {
		this.loadingState.set(true);
		this.errorState.set(null);
		try {
			this.rootsState.set(await this.backend.listLibraryRoots());
		} catch (error) {
			this.errorState.set(libraryCommandErrorMessage(error));
		} finally {
			this.loadingState.set(false);
		}
	}

	async addFolder(): Promise<void> {
		this.errorState.set(null);
		try {
			const path = await this.backend.selectLibraryDirectory();
			if (path === null) return;
			const root = await this.backend.registerLibraryRoot(path);
			this.rootsState.update((roots) => {
				const existing = roots.some((candidate) => candidate.id === root.id);
				return existing
					? roots.map((candidate) => (candidate.id === root.id ? root : candidate))
					: [...roots, root];
			});
			this.library.invalidateCatalog();
		} catch (error) {
			this.errorState.set(libraryCommandErrorMessage(error));
		}
	}

	async setEnabled(root: LibraryRoot, enabled: boolean): Promise<void> {
		if (this.pendingIdsState().has(root.id)) return;
		this.setPending(root.id, true);
		this.errorState.set(null);
		try {
			const updated = await this.backend.setLibraryRootEnabled(root.id, enabled);
			this.rootsState.update((roots) =>
				roots.map((candidate) => (candidate.id === root.id ? updated : candidate))
			);
			this.library.invalidateCatalog();
		} catch (error) {
			this.errorState.set(libraryCommandErrorMessage(error));
		} finally {
			this.setPending(root.id, false);
		}
	}

	async remove(root: LibraryRoot): Promise<void> {
		if (this.pendingIdsState().has(root.id)) return;
		this.setPending(root.id, true);
		this.errorState.set(null);
		try {
			await this.backend.removeLibraryRoot(root.id);
			this.rootsState.update((roots) => roots.filter((candidate) => candidate.id !== root.id));
			this.library.invalidateCatalog();
		} catch (error) {
			this.errorState.set(libraryCommandErrorMessage(error));
		} finally {
			this.setPending(root.id, false);
		}
	}

	private setPending(id: string, pending: boolean): void {
		this.pendingIdsState.update((ids) => {
			const next = new Set(ids);
			if (pending) next.add(id);
			else next.delete(id);
			return next;
		});
	}
}
