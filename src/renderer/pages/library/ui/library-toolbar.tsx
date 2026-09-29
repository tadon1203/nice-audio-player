import { Search } from "lucide-react";
import type { LibrarySortDirection } from "@/renderer/entities/library";
import {
  CollectionSortControl,
  type SortOption,
} from "@/renderer/shared/ui/collection-sort-control";
import { RollingNumber } from "@/renderer/shared/ui/rolling-number";
import { PageTitle } from "@/renderer/shared/ui/headings";
import { WorkspaceContainer } from "@/renderer/shared/ui/workspace-container";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/renderer/shared/ui/shadcn/input-group";

export function LibraryToolbar<Key extends string>({
  title,
  countLabel,
  searchLabel,
  searchPlaceholder,
  filter,
  updating = false,
  onFilterChange,
  sort,
}: {
  title: string;
  countLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  filter: string;
  updating?: boolean;
  onFilterChange: (value: string) => void;
  sort?: {
    key: Key;
    direction: LibrarySortDirection;
    options: readonly SortOption<Key>[];
    onKeyChange: (key: Key) => void;
    onToggleDirection: () => void;
  };
}) {
  return (
    <header className="pt-8">
      <WorkspaceContainer>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3">
          {/* Title and count share one baseline; search and sort share one row. */}
          <div className="flex min-w-0 items-baseline gap-4">
            <PageTitle>{title}</PageTitle>
            <CountLabel label={countLabel} />
            {updating ? (
              <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
                Updating…
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {sort ? (
              <CollectionSortControl
                selectLabel={`Sort ${title.toLocaleLowerCase()}`}
                value={sort.key}
                options={sort.options}
                direction={sort.direction}
                onValueChange={sort.onKeyChange}
                onToggleDirection={sort.onToggleDirection}
              />
            ) : null}
            <InputGroup className="h-9 w-full sm:w-52">
              <InputGroupInput
                aria-label={searchLabel}
                value={filter}
                onChange={(event) => onFilterChange(event.target.value)}
                placeholder={searchPlaceholder}
                type="search"
              />
              <InputGroupAddon align="inline-start" aria-hidden="true">
                <Search className="size-4 text-muted-foreground" />
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>
      </WorkspaceContainer>
    </header>
  );
}

/** `1,284 albums`: the number rolls like a slot machine, the unit stays put. */
function CountLabel({ label }: { label: string }) {
  const match = /^([\d,.]+)(\s.*)?$/.exec(label);
  return (
    <span className="text-sm tabular-nums text-muted-foreground">
      {match ? (
        <>
          <RollingNumber value={match[1]!} settle="right-last" spin={1} />
          {match[2]}
        </>
      ) : (
        label
      )}
    </span>
  );
}
