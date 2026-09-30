import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// The self-hosted @font-face block (112 rules, ~137 KB) is intentionally kept
// out of the render-blocking `index.css`. This dynamic import makes Vite emit
// it as a separate async stylesheet injected off the critical path, so first
// paint never waits on font declarations. Text renders immediately in the
// fallback stack via `font-display: swap` and swaps when the faces land.
void import("./fonts.css");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
