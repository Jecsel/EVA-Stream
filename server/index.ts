import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { processLiveInput, type GeminiLiveMessage, type GeminiLiveResponse } from "./gemini-live";
import { startScrumMasterSession, stopScrumMasterSession, processTranscriptChunk, runPeriodicAnalysis, updateScrumMasterConfig, setSprintGoal, getSessionState, generatePostMeetingSummary } from "./scrum-master";
import { seedAgents } from "./seed";
import * as Sentry from "@sentry/node";

const isProduction = process.env.NODE_ENV === "production";
const sentryEnabled = isProduction && !!process.env.SENTRY_DSN;

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 1.0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
  });

  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason);
  });

  process.on("uncaughtException", (error) => {
    Sentry.captureException(error);
  });

  console.log("Sentry initialized for production error tracking");
}

const app = express();
const httpServer = createServer(app);

// WebSocket server for Gemini Live API
const wss = new WebSocketServer({ server: httpServer, path: "/ws/eva" });

// WebSocket server for Scrum Master real-time interventions
const scrumWss = new WebSocketServer({ server: httpServer, path: "/ws/scrum-master" });

// Track all WebSocket connections by meetingId for broadcasting SOP updates
const meetingConnections = new Map<string, Set<WebSocket>>();

// Track scrum master connections by meetingId
const scrumMasterConnections = new Map<string, Set<WebSocket>>();

// Broadcast message to all clients in a meeting
function broadcastToMeeting(meetingId: string, message: object) {
  const connections = meetingConnections.get(meetingId);
  if (connections) {
    const data = JSON.stringify(message);
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const meetingId = url.searchParams.get("meetingId") || "unknown";
  
  console.log(`EVA WebSocket connected for meeting: ${meetingId}`);
  
  // Track this connection for the meeting
  if (!meetingConnections.has(meetingId)) {
    meetingConnections.set(meetingId, new Set());
  }
  meetingConnections.get(meetingId)!.add(ws);
  console.log(`Meeting ${meetingId} now has ${meetingConnections.get(meetingId)!.size} connected clients`);

  ws.on("message", async (data: Buffer) => {
    try {
      const message: GeminiLiveMessage = JSON.parse(data.toString());
      message.meetingId = meetingId;
      
      const response = await processLiveInput(meetingId, message);
      
      // Always send SOP updates/status, only filter trivial observation messages
      const shouldSend = response.type === "sop_update" || 
                         response.type === "sop_status" ||
                         response.type === "cro_update" ||
                         response.type === "cro_status" ||
                         (response.content && response.content !== "[Observing meeting]" && response.content !== "observing");
      if (shouldSend) {
        // Broadcast SOP/CRO updates to ALL clients in the meeting
        if (response.type === "sop_update" || response.type === "sop_status" || 
            response.type === "cro_update" || response.type === "cro_status") {
          broadcastToMeeting(meetingId, response);
          console.log(`Broadcasted ${response.type} to ${meetingConnections.get(meetingId)?.size || 0} clients`);
        } else {
          // Send other messages only to the sender
          ws.send(JSON.stringify(response));
        }
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
      if (sentryEnabled) {
        Sentry.captureException(error);
      }
      ws.send(JSON.stringify({ type: "error", content: "Failed to process message" }));
    }
  });

  ws.on("close", () => {
    console.log(`EVA WebSocket disconnected for meeting: ${meetingId}`);
    // Remove this connection from tracking
    const connections = meetingConnections.get(meetingId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        meetingConnections.delete(meetingId);
      }
      console.log(`Meeting ${meetingId} now has ${connections.size} connected clients`);
    }
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for meeting ${meetingId}:`, error);
    if (sentryEnabled) {
      Sentry.captureException(error);
    }
  });

  // Send initial connection status
  ws.send(JSON.stringify({ type: "status", content: "EVA connected and ready" }));
});

// Scrum Master WebSocket handler
function broadcastToScrumMaster(meetingId: string, message: object) {
  const connections = scrumMasterConnections.get(meetingId);
  if (connections) {
    const data = JSON.stringify(message);
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}

scrumWss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const meetingId = url.searchParams.get("meetingId") || "unknown";

  console.log(`Scrum Master WebSocket connected for meeting: ${meetingId}`);

  if (!scrumMasterConnections.has(meetingId)) {
    scrumMasterConnections.set(meetingId, new Set());
  }
  scrumMasterConnections.get(meetingId)!.add(ws);

  ws.on("message", async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "start_session": {
          const sessionId = await startScrumMasterSession(meetingId, message.config);
          broadcastToScrumMaster(meetingId, { type: "session_started", sessionId });
          break;
        }

        case "stop_session": {
          const summary = await generatePostMeetingSummary(meetingId);
          stopScrumMasterSession(meetingId);
          broadcastToScrumMaster(meetingId, { type: "session_ended", summary });
          break;
        }

        case "update_config": {
          const config = await updateScrumMasterConfig(meetingId, message.config);
          broadcastToScrumMaster(meetingId, { type: "config_updated", config });
          break;
        }

        case "set_sprint_goal": {
          await setSprintGoal(meetingId, message.goal);
          broadcastToScrumMaster(meetingId, { type: "sprint_goal_set", goal: message.goal });
          break;
        }

        case "transcript": {
          const interventions = processTranscriptChunk(meetingId, {
            text: message.text,
            speaker: message.speaker,
            timestamp: message.timestamp || Date.now(),
            isFinal: message.isFinal ?? true,
          });

          for (const intervention of interventions) {
            broadcastToScrumMaster(meetingId, { ...intervention, msgType: "intervention" });
          }

          const aiInterventions = await runPeriodicAnalysis(meetingId);
          for (const intervention of aiInterventions) {
            broadcastToScrumMaster(meetingId, { ...intervention, msgType: "intervention" });
          }
          break;
        }

        case "get_state": {
          const state = getSessionState(meetingId);
          ws.send(JSON.stringify({ type: "state", ...state }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "error", content: `Unknown message type: ${message.type}` }));
      }
    } catch (error) {
      console.error("Scrum Master WebSocket error:", error);
      ws.send(JSON.stringify({ type: "error", content: "Failed to process message" }));
    }
  });

  ws.on("close", () => {
    console.log(`Scrum Master WebSocket disconnected for meeting: ${meetingId}`);
    const connections = scrumMasterConnections.get(meetingId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        scrumMasterConnections.delete(meetingId);
      }
    }
  });

  ws.on("error", (error) => {
    console.error(`Scrum Master WebSocket error for meeting ${meetingId}:`, error);
  });

  ws.send(JSON.stringify({ type: "status", content: "Scrum Master connected" }));
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

  if (sentryEnabled) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
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
