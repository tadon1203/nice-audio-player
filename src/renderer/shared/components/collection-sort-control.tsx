import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { ButtonGroup } from "@/renderer/shared/ui/shadcn/button-group";
import { Field, FieldTitle } from "@/renderer/shared/ui/shadcn/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/shared/ui/shadcn/select";

type SortOption = { readonly key: string; readonly label: string };
type SortDirection = "ascending" | "descending";

export function CollectionSortControl({
  label = "Sort",
  selectLabel,
  value,
  options,
  direction,
  onValueChange,
  onToggleDirection,
}: {
  label?: string;
  selectLabel: string;
  value: string;
  options: readonly SortOption[];
  direction: SortDirection;
  onValueChange: (value: string) => void;
  onToggleDirection: () => void;
}) {
  return (
    <Field className="w-auto gap-1.5">
      <FieldTitle className="text-sm font-normal text-muted-foreground">{label}</FieldTitle>
      <ButtonGroup>
        <Select
          value={value}
          items={options.map((option) => ({ label: option.label, value: option.key }))}
          onValueChange={(nextValue) => {
            if (typeof nextValue === "string") onValueChange(nextValue);
          }}
        >
          <SelectTrigger className="w-40 shrink-0" aria-label={selectLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={direction === "ascending" ? "Sort descending" : "Sort ascending"}
          onClick={onToggleDirection}
        >
          {direction === "ascending" ? (
            <ArrowUp aria-hidden="true" />
          ) : (
            <ArrowDown aria-hidden="true" />
          )}
        </Button>
      </ButtonGroup>
    </Field>
  );
}
