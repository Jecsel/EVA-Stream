import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { processLiveInput, type GeminiLiveMessage, type GeminiLiveResponse } from "./gemini-live";
import { startScrumMasterSession, stopScrumMasterSession, processTranscriptChunk, runPeriodicAnalysis, updateScrumMasterConfig, setSprintGoal, getSessionState, generatePostMeetingSummary } from "./scrum-master";
import { getOrCreateTeam, getTeam, removeTeam, type AgentTeamOrchestrator } from "./agent-team";
import type { AgentType } from "@shared/schema";
import { seedAgents } from "./seed";
import * as Sentry from "@sentry/node";
import { registerMeetingConnection, unregisterMeetingConnection, broadcastToMeeting as _broadcast, getMeetingConnectionCount } from "./ws-broadcast";

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

// WebSocket server for EVA and Scrum Master (multiplexed on single path)
const wss = new WebSocketServer({ server: httpServer, path: "/ws/eva" });

// Re-export broadcastToMeeting for other modules that imported it from here
export { broadcastToMeeting } from "./ws-broadcast";

// Local alias for use within this file
const broadcastToMeeting = _broadcast;

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const meetingId = url.searchParams.get("meetingId") || "unknown";
  
  console.log(`EVA WebSocket connected for meeting: ${meetingId}`);

  // Track this connection for the meeting
  registerMeetingConnection(meetingId, ws);
  console.log(`Meeting ${meetingId} now has ${getMeetingConnectionCount(meetingId)} connected clients`);

  ws.on("message", async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      // Route agent team messages (prefixed with "team_")
      if (message.type && message.type.startsWith("team_")) {
        const teamType = message.type.replace("team_", "");
        switch (teamType) {
          case "start": {
            const team = getOrCreateTeam(meetingId, broadcastToMeeting);
            const agents: AgentType[] = message.agents || ["eva", "sop", "cro", "scrum"];
            await team.start(agents);
            broadcastToMeeting(meetingId, { type: "team_started", agents: team.getAgentStatusArray() });
            break;
          }
          case "stop": {
            const team = getTeam(meetingId);
            if (team) {
              const report = await team.generateCoordinatedOutput();
              await team.stop();
              broadcastToMeeting(meetingId, { type: "team_stopped", report });
              removeTeam(meetingId);
            }
            break;
          }
          case "get_state": {
            const team = getTeam(meetingId);
            if (team) {
              const state = team.getState();
              ws.send(JSON.stringify({
                type: "team_state",
                isActive: state.isActive,
                agents: team.getAgentStatusArray(),
              }));
            } else {
              ws.send(JSON.stringify({ type: "team_state", isActive: false, agents: [] }));
            }
            break;
          }
          case "get_tasks": {
            const team = getTeam(meetingId);
            if (team) {
              const tasks = await team.getTaskManager().getTasks();
              ws.send(JSON.stringify({ type: "team_tasks", tasks }));
            }
            break;
          }
          default:
            ws.send(JSON.stringify({ type: "team_error", content: `Unknown team message type: ${teamType}` }));
        }
        return;
      }

      // Route scrum master messages (prefixed with "scrum_")
      if (message.type && message.type.startsWith("scrum_")) {
        const scrumType = message.type.replace("scrum_", "");
        switch (scrumType) {
          case "start_session": {
            const sessionId = await startScrumMasterSession(meetingId, message.config);
            broadcastToMeeting(meetingId, { type: "scrum_session_started", sessionId });
            break;
          }
          case "stop_session": {
            const summary = await generatePostMeetingSummary(meetingId);
            const { generateScrumMeetingRecord } = await import("./scrum-master");
            const meetingRecord = await generateScrumMeetingRecord(meetingId);
            stopScrumMasterSession(meetingId);
            broadcastToMeeting(meetingId, { type: "scrum_session_ended", summary, meetingRecordId: meetingRecord?.id || null });
            break;
          }
          case "update_config": {
            const config = await updateScrumMasterConfig(meetingId, message.config);
            broadcastToMeeting(meetingId, { type: "scrum_config_updated", config });
            break;
          }
          case "set_sprint_goal": {
            await setSprintGoal(meetingId, message.goal);
            broadcastToMeeting(meetingId, { type: "scrum_sprint_goal_set", goal: message.goal });
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
              broadcastToMeeting(meetingId, { ...intervention, interventionType: intervention.type, type: "scrum_intervention" });
              // Report blockers/action items to agent team
              const activeTeam = getTeam(meetingId);
              if (activeTeam && activeTeam.isTeamActive()) {
                if (intervention.type === "blocker_detected") {
                  activeTeam.sendAlert("scrum", `Blocker detected: ${intervention.message}`, { speaker: intervention.speaker, severity: intervention.severity }).catch(() => {});
                } else if (intervention.type === "action_needed") {
                  activeTeam.shareContext("scrum", "sop", `Action item identified: ${intervention.message}`, { speaker: intervention.speaker }).catch(() => {});
                }
              }
            }
            const aiInterventions = await runPeriodicAnalysis(meetingId);
            for (const intervention of aiInterventions) {
              broadcastToMeeting(meetingId, { ...intervention, interventionType: intervention.type, type: "scrum_intervention" });
            }
            break;
          }
          case "get_state": {
            const state = getSessionState(meetingId);
            ws.send(JSON.stringify({ type: "scrum_state", ...state }));
            break;
          }
          default:
            ws.send(JSON.stringify({ type: "scrum_error", content: `Unknown scrum message type: ${scrumType}` }));
        }
        return;
      }

      // Re-analysis subscription acknowledgment
      if (message.type === "reanalysis_subscribe") {
        ws.send(JSON.stringify({ type: "reanalysis_subscribed", recordingId: message.recordingId, meetingId }));
        return;
      }

      // Regular EVA messages
      const evaMessage: GeminiLiveMessage = message;
      evaMessage.meetingId = meetingId;
      
      if (message.type === "control" && message.command === "start") {
        ws.send(JSON.stringify({ type: "command", action: "start_app_observe" }));
        console.log(`[EVA] Sent start_app_observe command to client for meeting ${meetingId}`);
      }

      // If agent team is active, classify and delegate input
      const team = getTeam(meetingId);
      if (team && team.isTeamActive() && (message.type === "video" || message.type === "transcript" || message.type === "text")) {
        const content = message.data || "";
        if (content && content.length > 10) {
          team.classifyAndDelegate(message.type, content, message.speaker).catch(err => {
            console.error("[AgentTeam] Delegation error:", err);
          });
        }
      }

      const response = await processLiveInput(meetingId, evaMessage);
      
      const shouldSend = response.type === "sop_update" || 
                         response.type === "sop_status" ||
                         response.type === "cro_update" ||
                         response.type === "cro_status" ||
                         (response.content && response.content !== "[Observing meeting]" && response.content !== "observing");
      if (shouldSend) {
        if (response.type === "sop_update" || response.type === "sop_status" || 
            response.type === "cro_update" || response.type === "cro_status") {
          broadcastToMeeting(meetingId, response);
          console.log(`Broadcasted ${response.type} to ${getMeetingConnectionCount(meetingId)} clients`);

          // Report to agent team if active
          if (team && team.isTeamActive()) {
            if (response.type === "sop_update") {
              team.reportAgentStatus("sop", "completed", "SOP generated", response.content.substring(0, 200)).catch(() => {});
            } else if (response.type === "cro_update") {
              team.reportAgentStatus("cro", "completed", "CRO generated", response.content.substring(0, 200)).catch(() => {});
            }
          }
        } else {
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
    unregisterMeetingConnection(meetingId, ws);
    console.log(`Meeting ${meetingId} now has ${getMeetingConnectionCount(meetingId)} connected clients`);
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
