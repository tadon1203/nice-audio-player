import type { ButtonProps } from "./shadcn/button/button.svelte";
import type { ContextMenuContentProps } from "./context-menu/context-menu-content.svelte";
import type { SelectContentProps } from "./shadcn/select/select-content.svelte";

const acceptedButton: ButtonProps = {
	type: "button",
	density: "compact",
	purpose: "quiet",
	typeRole: "label",
	"aria-label": "Open queue",
	"data-region": "queue-control",
	disabled: false,
	onclick: () => undefined,
	ref: null,
};

const typedStyleOverride = { style: { color: "red" } };
// @ts-expect-error Shared controls reject direct caller styling.
const rejectedButtonClass: ButtonProps = { class: "text-xs" };
// @ts-expect-error Typed spreads cannot add a style escape hatch.
const rejectedButtonStyle: ButtonProps = typedStyleOverride;
// @ts-expect-error Floating menu surfaces own their presentation.
const rejectedMenuClass: ContextMenuContentProps = { class: "z-0" };
// @ts-expect-error Selection surfaces reject inline style overrides.
const rejectedSelectStyle: SelectContentProps = typedStyleOverride;

void [
	acceptedButton,
	rejectedButtonClass,
	rejectedButtonStyle,
	rejectedMenuClass,
	rejectedSelectStyle,
];
