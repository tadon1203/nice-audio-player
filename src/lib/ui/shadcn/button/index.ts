import Root, {
	type ButtonDensity,
	type ButtonGeometry,
	type ButtonProps,
	type ButtonPurpose,
	type ButtonTypeRole,
} from "./button.svelte";
import LegacyRoot, {
	type LegacyButtonProps,
	type LegacyButtonSize,
	type LegacyButtonVariant,
	legacyButtonVariants,
} from "./legacy-button.svelte";

export {
	Root,
	Root as Button,
	LegacyRoot as LegacyButton,
	legacyButtonVariants,
	type ButtonProps,
	type ButtonProps as Props,
	type ButtonPurpose,
	type ButtonDensity,
	type ButtonGeometry,
	type ButtonTypeRole,
	type LegacyButtonProps,
	type LegacyButtonSize,
	type LegacyButtonVariant,
};
