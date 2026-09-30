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

function createLibraryScanCommand(command: () => Promise<unknown>) {
  const client = useQueryClient();
  return createMutation(() => ({
    mutationFn: command,
    onSuccess: () => client.invalidateQueries({ queryKey: libraryQueryKeys.scan }),
  }));
}

export function createStartLibraryScan() {
  return createLibraryScanCommand(() => requireNative().startLibraryScan());
}

export function createCancelLibraryScan() {
  return createLibraryScanCommand(() => requireNative().cancelLibraryScan());
}
