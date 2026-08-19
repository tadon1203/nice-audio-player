import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "filled" | "neutral" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "neutral", className = "", children, ...props },
  ref,
) {
  return (
    <button ref={ref} {...props} className={`button button--${variant} ${className}`.trim()}>
      {children}
    </button>
  );
});
