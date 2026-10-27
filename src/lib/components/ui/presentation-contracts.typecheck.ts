import type { ButtonProps } from "./shadcn/button";
import type { ContextMenuContentProps } from "./context-menu/context-menu-content.svelte";
import type { SelectContentProps } from "./shadcn/select/select-content.svelte";

const acceptedButton: ButtonProps = {
  type: "button",
  size: "compact",
  variant: "quiet",
  class: "w-full font-normal",
  style: "margin-inline: 1px",
  "aria-label": "Open queue",
  "data-region": "queue-control",
  disabled: false,
  onclick: () => undefined,
  ref: null,
};

const typedStyleOverride = { style: { color: "red" } };
// @ts-expect-error Domain row geometry belongs to its caller.
const rejectedButtonGeometry: ButtonProps = { geometry: "queueRow" };
// @ts-expect-error Playback state belongs to its caller.
const rejectedButtonTime: ButtonProps = { timeState: "past" };
// @ts-expect-error Floating menu surfaces own their presentation.
const rejectedMenuClass: ContextMenuContentProps = { class: "z-0" };
// @ts-expect-error Selection surfaces reject inline style overrides.
const rejectedSelectStyle: SelectContentProps = typedStyleOverride;

void [
  acceptedButton,
  rejectedButtonGeometry,
  rejectedButtonTime,
  rejectedMenuClass,
  rejectedSelectStyle,
];
