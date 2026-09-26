import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nativeApi } from "@/renderer/shared/lib/native";
import { libraryQueryKeys } from "./queries";

function useInvalidateLibraryData() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: libraryQueryKeys.data });
}

export function useAddLibraryRoot() {
  const invalidate = useInvalidateLibraryData();
  return useMutation({
    mutationFn: async () => {
      const api = nativeApi();
      const path = await api.selectLibraryDirectory();
      return path === null ? null : api.registerLibraryRoot(path);
    },
    onSuccess: (root) => (root === null ? undefined : invalidate()),
  });
}

export function useSetLibraryRootEnabled() {
  const invalidate = useInvalidateLibraryData();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      nativeApi().setLibraryRootEnabled(id, enabled),
    onSuccess: invalidate,
  });
}

export function useRemoveLibraryRoot() {
  const invalidate = useInvalidateLibraryData();
  return useMutation({
    mutationFn: (id: string) => nativeApi().removeLibraryRoot(id),
    onSuccess: invalidate,
  });
}

function useLibraryScanCommand(command: () => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: command,
    onSuccess: () => client.invalidateQueries({ queryKey: libraryQueryKeys.scan }),
  });
}

export function useStartLibraryScan() {
  return useLibraryScanCommand(() => nativeApi().startLibraryScan());
}

export function useCancelLibraryScan() {
  return useLibraryScanCommand(() => nativeApi().cancelLibraryScan());
}
