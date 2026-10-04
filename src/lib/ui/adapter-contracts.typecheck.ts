import type { ComponentProps } from "svelte";
import type Adapter0 from "./shadcn/input/input.svelte";
import type Adapter1 from "./shadcn/checkbox/checkbox.svelte";
import type Adapter2 from "./shadcn/switch/switch.svelte";
import type Adapter3 from "./shadcn/label/label.svelte";
import type Adapter4 from "./shadcn/sheet/sheet-content.svelte";
import type Adapter5 from "./shadcn/tooltip/tooltip-content.svelte";
import type Adapter6 from "./shadcn/alert-dialog/alert-dialog-content.svelte";
const callerStyling = { class: "text-xs", style: "color:red" };
// @ts-expect-error input/input owns presentation, including typed spreads.
const rejected0: ComponentProps<typeof Adapter0> = { ...callerStyling };
void rejected0;
// @ts-expect-error checkbox/checkbox owns presentation, including typed spreads.
const rejected1: ComponentProps<typeof Adapter1> = { ...callerStyling };
void rejected1;
// @ts-expect-error switch/switch owns presentation, including typed spreads.
const rejected2: ComponentProps<typeof Adapter2> = { ...callerStyling };
void rejected2;
// @ts-expect-error label/label owns presentation, including typed spreads.
const rejected3: ComponentProps<typeof Adapter3> = { ...callerStyling };
void rejected3;
// @ts-expect-error sheet/sheet-content owns presentation, including typed spreads.
const rejected4: ComponentProps<typeof Adapter4> = { ...callerStyling };
void rejected4;
// @ts-expect-error tooltip/tooltip-content owns presentation, including typed spreads.
const rejected5: ComponentProps<typeof Adapter5> = { ...callerStyling };
void rejected5;
// @ts-expect-error alert-dialog/alert-dialog-content owns presentation, including typed spreads.
const rejected6: ComponentProps<typeof Adapter6> = { ...callerStyling };
void rejected6;
const acceptedInput: ComponentProps<typeof Adapter0> = {
  type: "search",
  value: "日本語",
  "aria-label": "Filter",
  "data-library-filter": "",
  oninput: (event) => {
    void event.currentTarget.value;
  },
  ref: null,
  disabled: false,
};
void acceptedInput;
