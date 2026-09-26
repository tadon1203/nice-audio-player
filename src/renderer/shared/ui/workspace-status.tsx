import type { ReactNode } from "react";
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

/** Requests the next page of a paginated collection. */
export function LoadMoreButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-center py-8">
      <Button type="button" variant="outline" disabled={pending} onClick={onClick}>
        {pending ? (
          <Spinner data-icon="inline-start" aria-hidden="true" role="presentation" />
        ) : null}
        {pending ? "Loading more…" : "Load more"}
      </Button>
    </div>
  );
}
