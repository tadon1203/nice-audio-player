import { z } from "zod";

const environmentSchema = z.object({
  VITE_APP_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  VITE_ENABLE_PERFORMANCE_OVERLAY: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
});

export const environment = environmentSchema.parse(import.meta.env);
