import type { ReactNode } from "react";

export function InlineNotice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <p
      className={`inline-notice inline-notice--${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}
