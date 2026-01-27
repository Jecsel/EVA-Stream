import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { processLiveInput, type GeminiLiveMessage, type GeminiLiveResponse } from "./gemini-live";
import { seedAgents } from "./seed";

const app = express();
const httpServer = createServer(app);

// WebSocket server for Gemini Live API
const wss = new WebSocketServer({ server: httpServer, path: "/ws/eva" });

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const meetingId = url.searchParams.get("meetingId") || "unknown";
  
  console.log(`EVA WebSocket connected for meeting: ${meetingId}`);

  ws.on("message", async (data: Buffer) => {
    try {
      const message: GeminiLiveMessage = JSON.parse(data.toString());
      message.meetingId = meetingId;
      
      const response = await processLiveInput(meetingId, message);
      
      // Only send non-trivial responses
      if (response.content && response.content !== "[Observing meeting]") {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
      ws.send(JSON.stringify({ type: "error", content: "Failed to process message" }));
    }
  });

  ws.on("close", () => {
    console.log(`EVA WebSocket disconnected for meeting: ${meetingId}`);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for meeting ${meetingId}:`, error);
  });

  // Send initial connection status
  ws.send(JSON.stringify({ type: "status", content: "EVA connected and ready" }));
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '10mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  
  await seedAgents();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
