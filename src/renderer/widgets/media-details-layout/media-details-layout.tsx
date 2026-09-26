import type { ReactNode, Ref } from "react";
import { libraryCommandErrorMessage } from "@/renderer/entities/library";
import { WorkspaceScroll } from "@/renderer/shared/ui/workspace-scroll";
import { ErrorAlert, LoadMoreButton, LoadingStatus } from "@/renderer/shared/ui/workspace-status";
import type {
  MediaDetailsWorkspace,
  ReadyMediaDetailsWorkspace,
} from "./use-media-details-workspace";

/** The shared skeleton of album and artist details: back link, states, content, paging. */
export function MediaDetailsLayout<Summary, Item>({
  scrollRestorationId,
  viewportRef,
  back,
  loadingLabel,
  workspace,
  children,
}: {
  scrollRestorationId: string;
  viewportRef?: Ref<HTMLDivElement>;
  back: ReactNode;
  loadingLabel: string;
  workspace: MediaDetailsWorkspace<Summary, Item>;
  children: (workspace: ReadyMediaDetailsWorkspace<Summary, Item>) => ReactNode;
}) {
  return (
    <WorkspaceScroll
      scrollRestorationId={scrollRestorationId}
      viewportRef={viewportRef}
      contentClassName="py-8 pb-16"
    >
      {back}
      {workspace.status === "loading" ? (
        <LoadingStatus>{loadingLabel}</LoadingStatus>
      ) : workspace.status === "error" ? (
        <ErrorAlert
          message={libraryCommandErrorMessage(workspace.error)}
          onRetry={workspace.reload}
        />
      ) : (
        <>
          {children(workspace)}
          {workspace.hasMore ? (
            <LoadMoreButton pending={workspace.loadingMore} onClick={workspace.loadMore} />
          ) : null}
        </>
      )}
    </WorkspaceScroll>
  );
}
