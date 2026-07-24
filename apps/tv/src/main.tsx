import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@group-crash/design-tokens/tokens.css";
import "@group-crash/ui/styles.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

