import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { forwardRef } from "react";
import { buttonVariants } from "./button";

export const Toggle = forwardRef<HTMLButtonElement, Omit<BaseToggle.Props, "className">>(
  function Toggle(props, ref) {
    return <BaseToggle ref={ref} {...props} className={buttonVariants({ variant: "icon" })} />;
  },
);
