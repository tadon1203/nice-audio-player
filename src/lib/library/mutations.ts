import { createMutation, useQueryClient } from "@tanstack/svelte-query";
import { requireNative } from "$lib/native";
import { libraryQueryKeys } from "./queries";

// These call `useQueryClient`, so they run while a component initializes.

export function createAddLibraryRoot() {
  const client = useQueryClient();
  return createMutation(() => ({
    mutationFn: async () => {
      const api = requireNative();
      const path = await api.selectLibraryDirectory();
      return path === null ? null : api.registerLibraryRoot(path);
    },
    onSuccess: (root) =>
      root === null ? undefined : client.invalidateQueries({ queryKey: libraryQueryKeys.data }),
  }));
}

export function createSetLibraryRootEnabled() {
  const client = useQueryClient();
  return createMutation(() => ({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      requireNative().setLibraryRootEnabled(id, enabled),
    onSuccess: () => client.invalidateQueries({ queryKey: libraryQueryKeys.data }),
  }));
}

export function createRemoveLibraryRoot() {
  const client = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => requireNative().removeLibraryRoot(id),
    onSuccess: () => client.invalidateQueries({ queryKey: libraryQueryKeys.data }),
  }));
}

/** Removes the Missing tracks from the Library (never a source file); resolves to how many. */
export function createDeleteMissingTracks() {
  const client = useQueryClient();
  return createMutation(() => ({
    mutationFn: () => requireNative().deleteMissingLibraryTracks(),
    onSuccess: () => client.invalidateQueries({ queryKey: libraryQueryKeys.data }),
  }));
}

export function createOpenLogDirectory() {
  return createMutation(() => ({ mutationFn: () => requireNative().openLogDirectory() }));
}

// The backend restarts the app on success, so the promise normally never settles.
export function createResetLibrary() {
  return createMutation(() => ({ mutationFn: () => requireNative().resetLibraryAndRescan() }));
}

// Scan state arrives by event, so these do not touch the query cache.
export function createStartLibraryScan() {
  return createMutation(() => ({ mutationFn: () => requireNative().startLibraryScan() }));
}

export function createCancelLibraryScan() {
  return createMutation(() => ({ mutationFn: () => requireNative().cancelLibraryScan() }));
}
