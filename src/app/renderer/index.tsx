import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TooltipProvider } from "@/renderer/shared/ui/shadcn/tooltip";
import { NativeSession } from "./native-session";
import { queryClient } from "./providers";
import { router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Renderer root element is missing");

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <NativeSession />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TooltipProvider>
  </StrictMode>,
);
