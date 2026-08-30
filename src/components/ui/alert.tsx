import type { HTMLAttributes } from "react";

export function Alert({
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "error" }) {
  return (
    <div
      role="alert"
      {...props}
      className={`my-3 ${variant === "error" ? "text-error" : "text-text-secondary"}`}
    />
  );
}
