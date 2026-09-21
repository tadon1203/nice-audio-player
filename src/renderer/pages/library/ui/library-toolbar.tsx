import { Search } from "lucide-react";
import type { LibrarySortDirection } from "@/renderer/entities/library";
import { CollectionSortControl } from "@/renderer/shared/components/collection-sort-control";
import { WorkspaceContainer } from "@/renderer/shared/layout/workspace-container";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/renderer/shared/ui/shadcn/input-group";

type SortOption = { readonly key: string; readonly label: string };

export function LibraryToolbar({
  title,
  countLabel,
  filter,
  onFilterChange,
  sort,
}: {
  title: string;
  countLabel: string;
  filter: string;
  onFilterChange: (value: string) => void;
  sort?: {
    key: string;
    direction: LibrarySortDirection;
    options: readonly SortOption[];
    onKeyChange: (key: string) => void;
    onToggleDirection: () => void;
  };
}) {
  return (
    <header className="pt-8">
      <WorkspaceContainer>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-6">
          <h1 className="text-2xl font-normal leading-8 tracking-tight text-foreground">{title}</h1>
          <InputGroup className="h-9 w-full sm:w-48">
            <InputGroupInput
              aria-label="Filter library"
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder="Search music…"
              type="search"
            />
            <InputGroupAddon align="inline-start" aria-hidden="true">
              <Search className="size-4 text-muted-foreground" />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div className="mt-6 flex min-w-0 flex-wrap items-start justify-between gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <span className={sort ? "self-end pb-1.5 tabular-nums" : "tabular-nums"}>
            {countLabel}
          </span>
          {sort ? (
            <CollectionSortControl
              selectLabel="Sort library"
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
