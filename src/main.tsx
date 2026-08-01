import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LayoutFixtureApp } from "./test/LayoutFixtureApp";
import { resolveLayoutFixture } from "./test/layout-fixture-state";
import "./styles/app.css";

const application =
  import.meta.env.MODE === "test" ? (
    <LayoutFixtureApp fixture={resolveLayoutFixture(window.location.search)} />
  ) : (
    <App />
  );

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{application}</React.StrictMode>,
);
