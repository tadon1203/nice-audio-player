import type { ReactNode, Ref } from "react";
import { libraryCommandErrorMessage } from "@/entities/library";
import { WorkspaceScroll } from "@/shared/ui/workspace-scroll";
import { ErrorAlert, LoadMoreSentinel, LoadingStatus } from "@/shared/ui/workspace-status";
import type {
  MediaDetailsWorkspace,
  ReadyMediaDetailsWorkspace,
} from "../model/use-media-details-workspace";

/** The shared skeleton of album and artist details: back link, states, content, paging. */
export function MediaDetailsLayout<Summary, Item>({
  scrollRestorationId,
  viewportRef,
  back,
  loadingLabel,
  loadingHeader,
  workspace,
  children,
}: {
  scrollRestorationId: string;
  viewportRef?: Ref<HTMLDivElement>;
  back: ReactNode;
  loadingLabel: string;
  /** What is already known from the route while data loads, so the page is not empty. */
  loadingHeader?: ReactNode;
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
        <>
          {loadingHeader}
          <LoadingStatus>{loadingLabel}</LoadingStatus>
        </>
      ) : workspace.status === "error" ? (
        <ErrorAlert
          message={libraryCommandErrorMessage(workspace.error)}
          onRetry={workspace.reload}
        />
      ) : (
        <>
          {children(workspace)}
          {workspace.hasMore ? (
            <LoadMoreSentinel pending={workspace.loadingMore} onLoadMore={workspace.loadMore} />
          ) : null}
        </>
      )}
    </WorkspaceScroll>
  );
}
