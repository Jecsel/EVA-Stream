import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

async function initSentry() {
  if (import.meta.env.PROD) {
    try {
      const response = await fetch("/api/config/sentry");
      if (response.ok) {
        const { dsn } = await response.json();
        if (dsn) {
          Sentry.init({
            dsn,
            environment: "production",
            integrations: [
              Sentry.browserTracingIntegration(),
              Sentry.replayIntegration(),
            ],
            tracesSampleRate: 1.0,
            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1.0,
          });
        }
      }
    } catch (e) {
      console.error("Failed to initialize Sentry:", e);
    }
  }
}

initSentry();
createRoot(document.getElementById("root")!).render(<App />);
