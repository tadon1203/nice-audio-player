import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import { LayoutFixtureApp } from "./test/LayoutFixtureApp";
import { resolveLayoutFixture } from "./test/layout-fixture-state";
import "./styles/app.css";
import { createRootOptions } from "./lib/react-root-diagnostics";

const application =
  import.meta.env.MODE === "test" ? (
    <LayoutFixtureApp fixture={resolveLayoutFixture(window.location.search)} />
  ) : (
    <App />
  );

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
  createRootOptions(import.meta.env.MODE),
).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">{application}</MotionConfig>
  </React.StrictMode>,
);
