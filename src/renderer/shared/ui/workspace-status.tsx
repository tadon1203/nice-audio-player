import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/renderer/shared/ui/shadcn/alert";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Empty, EmptyDescription } from "@/renderer/shared/ui/shadcn/empty";
import { Spinner } from "@/renderer/shared/ui/shadcn/spinner";

/** A workspace region that is still reading its first data. */
export function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <Empty role="status" className="my-6 py-8">
      <EmptyDescription className="flex items-center gap-2">
        <Spinner aria-hidden="true" role="presentation" />
        {children}
      </EmptyDescription>
    </Empty>
  );
}

/** A workspace region with nothing to show. */
export function EmptyStatus({ children }: { children: ReactNode }) {
  return (
    <Empty role="status" className="my-6 py-8">
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}

/** A recoverable failure that owns the region it replaces. */
export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="my-6" role="alert">
      <AlertCircle aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/** How far ahead of the end of the list the next page is requested. */
const PREFETCH_MARGIN_PX = 800;

/**
 * Requests the next page of a paginated collection as the end of the list nears the visible
 * area, so a long collection scrolls as one list. Place it right after the items.
 */
export function LoadMoreSentinel({
  pending,
  onLoadMore,
}: {
  pending: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const latest = useRef(onLoadMore);
  latest.current = onLoadMore;

  // Observing again after each page makes the observer report the sentinel afresh, so a page
  // that did not push it out of range is followed by the next one.
  useEffect(() => {
    const element = ref.current;
    if (element === null || pending) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current();
      },
      {
        root: element.closest("[data-scroll-restoration-id]"),
        rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px`,
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [pending]);

  return (
    <div ref={ref} className="flex min-h-16 justify-center py-8">
      {pending ? (
        <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" role="presentation" />
          Loading more…
        </span>
      ) : null}
    </div>
  );
}
