import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserFixtureApp } from "./test/BrowserFixtureApp";
import { resolveBrowserFixture } from "./test/browser-fixture-state";
import "./styles/app.css";
import { createRootOptions } from "./lib/react-root-diagnostics";
import { TooltipProvider } from "./components/ui/tooltip";
if (import.meta.env.MODE === "test") {
  const { installTauriBrowserMocks } = await import("./test/tauri-browser-mocks");
  installTauriBrowserMocks();
}

const application =
  import.meta.env.MODE === "test" ? (
    <BrowserFixtureApp fixture={resolveBrowserFixture(window.location.search)} />
  ) : (
    <App />
  );

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
  createRootOptions(import.meta.env.MODE),
).render(
  <React.StrictMode>
    <TooltipProvider>{application}</TooltipProvider>
  </React.StrictMode>,
);
