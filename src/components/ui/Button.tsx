import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "filled" | "neutral";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({ variant = "neutral", className = "", children, ...props }: ButtonProps) {
  return (
    <button {...props} className={`button button--${variant} ${className}`.trim()}>
      {children}
    </button>
  );
}
