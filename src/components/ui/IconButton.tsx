import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  selected?: boolean;
};

/** Shared compact-control contract; features may position it but not redefine its interaction state. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = "", children, selected = false, ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      className={`icon-button${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
});
