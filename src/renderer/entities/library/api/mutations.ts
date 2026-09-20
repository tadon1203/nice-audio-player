import { useMutation, useQueryClient } from "@tanstack/react-query";
import { electronApi } from "@/renderer/shared/lib/electron";
import { libraryQueryKeys } from "./queries";

function useInvalidateLibraryData() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: libraryQueryKeys.data });
}

export function useAddLibraryRoot() {
  const invalidate = useInvalidateLibraryData();
  return useMutation({
    mutationFn: async () => {
      const api = electronApi();
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
      electronApi().setLibraryRootEnabled(id, enabled),
    onSuccess: invalidate,
  });
}

export function useRemoveLibraryRoot() {
  const invalidate = useInvalidateLibraryData();
  return useMutation({
    mutationFn: (id: string) => electronApi().removeLibraryRoot(id),
    onSuccess: invalidate,
  });
}

export function useStartLibraryScan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => electronApi().startLibraryScan(),
    onSuccess: (scan) => client.setQueryData(libraryQueryKeys.scan, scan),
  });
}

export function useCancelLibraryScan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => electronApi().cancelLibraryScan(),
    onSuccess: (scan) => client.setQueryData(libraryQueryKeys.scan, scan),
  });
}
