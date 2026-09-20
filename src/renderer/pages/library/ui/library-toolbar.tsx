import { ArrowDown, ArrowUp, Search } from "lucide-react";
import type { LibrarySortDirection } from "@/renderer/entities/library";
import { Button } from "@/renderer/shared/ui/button";
import { Field, FieldLabel } from "@/renderer/shared/ui/field";
import { Input } from "@/renderer/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/shared/ui/select";

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
    <header className="px-[clamp(24px,3vw,40px)] pt-8">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-6">
        <h1 className="text-2xl font-normal leading-8 tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        <label className="relative w-full md:me-2 md:w-[190px]">
          <span className="sr-only">Filter library</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            aria-label="Filter library"
            className="h-9 w-full ps-9"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Search music…"
            type="search"
          />
        </label>
      </div>
      <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3 text-sm text-muted-foreground">
        <span className="tabular-nums">{countLabel}</span>
        {sort ? (
          <Field className="flex w-auto items-center gap-2">
            <FieldLabel className="text-sm text-muted-foreground">Sort</FieldLabel>
            <Select
              value={sort.key}
              items={sort.options.map((option) => ({ label: option.label, value: option.key }))}
              onValueChange={(value) => {
                if (typeof value === "string") sort.onKeyChange(value);
              }}
            >
              <SelectTrigger className="h-9 w-[188px] shrink-0" aria-label="Sort library">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sort.options.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={sort.direction === "ascending" ? "Sort descending" : "Sort ascending"}
              onClick={sort.onToggleDirection}
            >
              {sort.direction === "ascending" ? (
                <ArrowUp aria-hidden="true" />
              ) : (
                <ArrowDown aria-hidden="true" />
              )}
            </Button>
          </Field>
        ) : null}
      </div>
    </header>
  );
}
