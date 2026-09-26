import { Search } from "lucide-react";
import type { LibrarySortDirection } from "@/renderer/entities/library";
import {
  CollectionSortControl,
  type SortOption,
} from "@/renderer/shared/components/collection-sort-control";
import { WorkspaceContainer } from "@/renderer/shared/layout/workspace-container";
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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-6">
          <h1 className="text-2xl font-normal leading-8 tracking-tight text-foreground">{title}</h1>
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
        <div className="mt-6 flex min-w-0 flex-wrap items-start justify-between gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <div
            className={sort ? "flex items-center gap-2 self-end pb-1.5" : "flex items-center gap-2"}
          >
            <span className="tabular-nums">{countLabel}</span>
            {updating ? (
              <span role="status" aria-live="polite" className="text-muted-foreground">
                Updating…
              </span>
            ) : null}
          </div>
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
        </div>
      </WorkspaceContainer>
    </header>
  );
}
