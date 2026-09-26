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

export function useStartLibraryScan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => nativeApi().startLibraryScan(),
    onSuccess: () => client.invalidateQueries({ queryKey: libraryQueryKeys.scan }),
  });
}

export function useCancelLibraryScan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => nativeApi().cancelLibraryScan(),
    onSuccess: () => client.invalidateQueries({ queryKey: libraryQueryKeys.scan }),
  });
}
