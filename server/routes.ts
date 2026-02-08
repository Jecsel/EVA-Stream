import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMeetingSchema, insertRecordingSchema, insertChatMessageSchema, insertTranscriptSegmentSchema, insertUserSchema, updateUserSchema, insertPromptSchema, updatePromptSchema, insertAgentSchema, updateAgentSchema, insertMeetingNoteSchema, insertMeetingFileSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { analyzeChat, analyzeTranscription, generateMermaidFlowchart, transcribeRecording, generateSOPFromTranscript, generateDecisionBasedSOP } from "./gemini";
import { getAuthUrl, getTokensFromCode, createCalendarEvent, getUserInfo, validateOAuthState } from "./google-calendar";
import { textToSpeech, textToSpeechStream, getVoices, getDefaultVoiceId } from "./elevenlabs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import admin from "firebase-admin";
import { runDevAgent, type AgentMessage } from "./dev-agent";

// Initialize Firebase Admin SDK for token verification
if (!admin.apps.length) {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin SDK initialized successfully");
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", e);
    }
  } else {
    console.log("FIREBASE_SERVICE_ACCOUNT_KEY not set - moderator verification disabled");
  }
}

const SALT_ROUNDS = 10;

// API Key authentication middleware for external API
async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  // Check Authorization: Bearer header
  const authHeader = req.headers["authorization"] as string;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use: Authorization: Bearer <your-api-key>" });
    return;
  }
  
  const providedKey = authHeader.substring(7); // Remove "Bearer " prefix
  
  if (!providedKey) {
    res.status(401).json({ error: "Missing API key in Authorization header" });
    return;
  }
  
  // Check against database API keys
  const apiKey = await storage.getApiKeyByKey(providedKey);
  if (!apiKey) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }
  
  // Update last used timestamp
  await storage.updateApiKeyLastUsed(apiKey.id);
  
  next();
}

// Generate a unique room ID
function generateRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [3, 4, 3]; // xxx-xxxx-xxx format
  return segments
    .map(len => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join(""))
    .join("-");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Developer AI Agent - Chat endpoint with streaming
  app.post("/api/dev-agent/chat", async (req, res) => {
    try {
      const { messages, screenContext } = req.body as {
        messages: AgentMessage[];
        screenContext?: string;
      };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "Messages array is required" });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await runDevAgent(messages, screenContext || null, {
        onText: (text) => {
          res.write(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
        },
        onToolUse: (toolName, input) => {
          res.write(`data: ${JSON.stringify({ type: "tool_use", tool: toolName, input })}\n\n`);
        },
        onToolResult: (toolName, result) => {
          const truncated = result.length > 2000 ? result.slice(0, 2000) + "..." : result;
          res.write(`data: ${JSON.stringify({ type: "tool_result", tool: toolName, result: truncated })}\n\n`);
        },
        onDone: (fullResponse) => {
          res.write(`data: ${JSON.stringify({ type: "done", content: fullResponse })}\n\n`);
          res.end();
        },
        onError: (error) => {
          res.write(`data: ${JSON.stringify({ type: "error", content: error.message })}\n\n`);
          res.end();
        },
      });
    } catch (error: any) {
      console.error("Dev agent error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process dev agent request" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", content: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // Sentry config endpoint for frontend (production only)
  app.get("/api/config/sentry", (req, res) => {
    if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
      res.json({ dsn: process.env.SENTRY_DSN });
    } else {
      res.json({ dsn: null });
    }
  });

  // External API - Create meeting endpoint for other systems
  const externalCreateMeetingSchema = z.object({
    title: z.string().optional(),
    scheduledDate: z.string().datetime().optional(),
    moderatorCode: z.string().min(4).max(32).optional(), // Secret code for moderator access without login
  });

  // External API - Schedule meeting with calendar integration
  const externalScheduleMeetingSchema = z.object({
    title: z.string().min(1),
    scheduledDate: z.string().datetime(),
    endDate: z.string().datetime().optional(),
    attendeeEmails: z.array(z.string().email()).optional(),
    description: z.string().optional(),
    userId: z.string().optional(),
    userEmail: z.string().email().optional(),
    eventType: z.enum(["event", "task"]).optional().default("event"),
    isAllDay: z.boolean().optional().default(false),
    recurrence: z.enum(["none", "daily", "weekly", "monthly", "annually", "weekdays"]).optional().default("none"),
    recurrenceEndDate: z.string().datetime().optional(),
    moderatorCode: z.string().min(4).max(32).optional(), // Secret code for moderator access without login
  });

  app.post("/api/external/schedule-meeting", validateApiKey, async (req, res) => {
    try {
      const validated = externalScheduleMeetingSchema.parse(req.body);
      
      const roomId = generateRoomId();
      const startTime = new Date(validated.scheduledDate);
      const endTime = validated.endDate 
        ? new Date(validated.endDate) 
        : new Date(startTime.getTime() + 60 * 60 * 1000);

      if (endTime <= startTime) {
        res.status(400).json({ error: "endDate must be after scheduledDate" });
        return;
      }

      // Auto-generate moderator code if not provided
      const moderatorCode = validated.moderatorCode || uuidv4().substring(0, 8);

      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
      const meetingLink = `${protocol}://${host}/meeting/${roomId}`;
      const moderatorLink = `${meetingLink}?mod=${encodeURIComponent(moderatorCode)}`;

      const allAgents = await storage.listAgents();
      const sopAgent = allAgents.find(a => a.type === "sop" || a.name.toLowerCase().includes("sop"));
      const selectedAgentIds = sopAgent ? [sopAgent.id] : null;

      const meeting = await storage.createMeeting({
        title: validated.title,
        roomId,
        status: "scheduled",
        scheduledDate: startTime,
        endDate: endTime,
        attendeeEmails: validated.attendeeEmails || null,
        eventType: validated.eventType,
        isAllDay: validated.isAllDay,
        recurrence: validated.recurrence,
        recurrenceEndDate: validated.recurrenceEndDate ? new Date(validated.recurrenceEndDate) : null,
        createdBy: validated.userId || null,
        selectedAgents: selectedAgentIds,
        moderatorCode,
      });

      let calendarEvent = null;
      let user = null;
      if (validated.userId) {
        user = await storage.getUser(validated.userId);
      }
      if (!user && validated.userEmail) {
        user = await storage.getUserByEmail(validated.userEmail);
      }

      if (user?.googleAccessToken) {
        try {
          calendarEvent = await createCalendarEvent({
            title: validated.title,
            description: validated.description || `Join the meeting: ${meetingLink}`,
            startTime,
            endTime,
            attendeeEmails: validated.attendeeEmails || [],
            meetingLink,
            accessToken: user.googleAccessToken,
            refreshToken: user.googleRefreshToken || undefined,
            isAllDay: validated.isAllDay,
            recurrence: validated.recurrence,
          });

          await storage.updateMeeting(meeting.id, {
            calendarEventId: calendarEvent.id || null,
          });
        } catch (calendarError) {
          console.error("Failed to create calendar event:", calendarError);
        }
      }

      res.json({
        success: true,
        meeting: {
          id: meeting.id,
          title: meeting.title,
          roomId: meeting.roomId,
          status: meeting.status,
          scheduledDate: meeting.scheduledDate,
          endDate: endTime,
          attendeeEmails: meeting.attendeeEmails,
          recurrence: meeting.recurrence,
          calendarEventId: calendarEvent?.id || null,
          createdAt: meeting.createdAt,
        },
        link: meetingLink,
        moderatorLink,
        calendarEventCreated: !!calendarEvent,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("External schedule meeting error:", error);
        res.status(500).json({ error: "Failed to schedule meeting" });
      }
    }
  });

  // External API - Get meetings by userId or userEmail
  app.get("/api/external/meetings", validateApiKey, async (req, res) => {
    try {
      const { userId, userEmail, status, limit, offset } = req.query;
      
      if (!userId && !userEmail) {
        res.status(400).json({ error: "Either userId or userEmail query parameter is required" });
        return;
      }

      const allMeetings = await storage.listMeetings();
      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");

      let filteredMeetings = allMeetings.filter(meeting => {
        if (userId && meeting.createdBy === userId) return true;
        if (userEmail && meeting.attendeeEmails?.includes(userEmail as string)) return true;
        return false;
      });

      if (status) {
        filteredMeetings = filteredMeetings.filter(m => m.status === status);
      }

      filteredMeetings.sort((a, b) => 
        new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
      );

      const limitNum = limit ? parseInt(limit as string, 10) : 50;
      const offsetNum = offset ? parseInt(offset as string, 10) : 0;
      const paginatedMeetings = filteredMeetings.slice(offsetNum, offsetNum + limitNum);

      const meetingsWithLinks = paginatedMeetings.map(meeting => ({
        id: meeting.id,
        title: meeting.title,
        roomId: meeting.roomId,
        status: meeting.status,
        scheduledDate: meeting.scheduledDate,
        endDate: meeting.endDate,
        attendeeEmails: meeting.attendeeEmails,
        recurrence: meeting.recurrence,
        calendarEventId: meeting.calendarEventId,
        createdBy: meeting.createdBy,
        createdAt: meeting.createdAt,
        link: `${protocol}://${host}/meeting/${meeting.roomId}`,
      }));

      res.json({
        success: true,
        meetings: meetingsWithLinks,
        total: filteredMeetings.length,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      console.error("External get meetings error:", error);
      res.status(500).json({ error: "Failed to get meetings" });
    }
  });

  app.post("/api/external/create-meeting", validateApiKey, async (req, res) => {
    try {
      const validated = externalCreateMeetingSchema.parse(req.body);
      
      const roomId = generateRoomId();
      const title = validated.title || `Meeting ${roomId}`;
      
      // Auto-generate moderator code if not provided
      const moderatorCode = validated.moderatorCode || uuidv4().substring(0, 8);
      
      // Get the SOP Generator agent to auto-enable for external meetings
      const allAgents = await storage.listAgents();
      const sopAgent = allAgents.find(a => a.type === "sop" || a.name.toLowerCase().includes("sop"));
      const selectedAgentIds = sopAgent ? [sopAgent.id] : null;
      
      // Create the meeting with SOP Generator enabled
      const meeting = await storage.createMeeting({
        title,
        roomId,
        status: validated.scheduledDate ? "scheduled" : "live",
        scheduledDate: validated.scheduledDate ? new Date(validated.scheduledDate) : new Date(),
        selectedAgents: selectedAgentIds,
        moderatorCode,
      });
      
      // Build the full meeting link
      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
      const meetingLink = `${protocol}://${host}/meeting/${roomId}`;
      const moderatorLink = `${meetingLink}?mod=${encodeURIComponent(moderatorCode)}`;
      
      res.json({
        success: true,
        meeting: {
          id: meeting.id,
          title: meeting.title,
          roomId: meeting.roomId,
          status: meeting.status,
          scheduledDate: meeting.scheduledDate,
          createdAt: meeting.createdAt,
        },
        link: meetingLink,
        moderatorLink,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("External create meeting error:", error);
        res.status(500).json({ error: "Failed to create meeting" });
      }
    }
  });

  // API Key Management (admin routes)
  app.get("/api/admin/api-keys", async (req, res) => {
    try {
      const keys = await storage.listApiKeys();
      // Don't expose the full key, only the prefix
      const safeKeys = keys.map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        isActive: k.isActive,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      }));
      res.json(safeKeys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/admin/api-keys", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      // Generate a secure random API key
      const key = `sk_${uuidv4().replace(/-/g, "")}`;
      const keyPrefix = key.substring(0, 10) + "...";

      const apiKey = await storage.createApiKey({
        name,
        key,
        keyPrefix,
        isActive: true,
      });

      // Return the full key only on creation (user must save it now)
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key, // Full key only on creation
        keyPrefix: apiKey.keyPrefix,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
      });
    } catch (error) {
      console.error("Failed to create API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/admin/api-keys/:id", async (req, res) => {
    try {
      const success = await storage.revokeApiKey(req.params.id);
      if (!success) {
        res.status(404).json({ error: "API key not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  // Meetings
  app.post("/api/meetings", async (req, res) => {
    try {
      const validated = insertMeetingSchema.parse(req.body);
      const meeting = await storage.createMeeting(validated);
      res.json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to create meeting" });
      }
    }
  });

  app.get("/api/meetings/upcoming", async (req, res) => {
    try {
      const meetings = await storage.listUpcomingMeetings();
      res.json(meetings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch meetings" });
    }
  });

  app.get("/api/meetings/past", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const meetings = await storage.listPastMeetings(limit);
      res.json(meetings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch past meetings" });
    }
  });

  app.get("/api/meetings/:id", async (req, res) => {
    try {
      const meeting = await storage.getMeeting(req.params.id);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }
      res.json(meeting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch meeting" });
    }
  });

  app.get("/api/meetings/room/:roomId", async (req, res) => {
    try {
      let meeting = await storage.getMeetingByRoomId(req.params.roomId);
      const userId = req.query.userId as string | undefined;
      
      // Auto-create meeting if it doesn't exist (for ad-hoc meetings)
      if (!meeting) {
        // Auto-select all agents when creating a new meeting
        const allAgents = await storage.listAgents();
        const allAgentIds = allAgents.map(agent => agent.id);
        
        meeting = await storage.createMeeting({
          title: `Meeting ${req.params.roomId}`,
          roomId: req.params.roomId,
          status: "live",
          scheduledDate: new Date(),
          selectedAgents: allAgentIds.length > 0 ? allAgentIds : null,
          createdBy: userId || null,
        });
      } else if (!meeting.createdBy && userId) {
        // Atomically claim moderator role for API-created meetings (first authenticated user)
        meeting = await storage.updateMeeting(meeting.id, { createdBy: userId }) || meeting;
      }
      
      res.json(meeting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch or create meeting" });
    }
  });

  app.patch("/api/meetings/:id", async (req, res) => {
    try {
      const meeting = await storage.updateMeeting(req.params.id, req.body);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }
      res.json(meeting);
    } catch (error) {
      res.status(500).json({ error: "Failed to update meeting" });
    }
  });

  // Recordings
  app.post("/api/recordings", async (req, res) => {
    try {
      const validated = insertRecordingSchema.parse(req.body);
      const recording = await storage.createRecording(validated);
      res.json(recording);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to create recording" });
      }
    }
  });

  app.get("/api/recordings", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const recordings = await storage.listRecordings(limit);
      res.json(recordings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recordings" });
    }
  });

  app.get("/api/recordings/:id", async (req, res) => {
    try {
      const recording = await storage.getRecording(req.params.id);
      if (!recording) {
        res.status(404).json({ error: "Recording not found" });
        return;
      }
      res.json(recording);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recording" });
    }
  });

  // Public SOP view endpoint - requires share token for security
  app.get("/api/public/sop/:token", async (req, res) => {
    try {
      const recording = await storage.getRecordingByShareToken(req.params.token);
      if (!recording) {
        res.status(404).json({ error: "SOP not found or invalid share link" });
        return;
      }
      // Return only the SOP-related fields for public viewing
      res.json({
        id: recording.id,
        title: recording.title,
        sopContent: recording.sopContent,
        flowchartCode: recording.flowchartCode,
        recordedAt: recording.recordedAt,
        duration: recording.duration,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch SOP" });
    }
  });

  // Generate or get share token for a recording
  app.post("/api/recordings/:id/share-token", async (req, res) => {
    try {
      const recording = await storage.getRecording(req.params.id);
      if (!recording) {
        res.status(404).json({ error: "Recording not found" });
        return;
      }
      
      // If already has a share token, return it
      if (recording.shareToken) {
        res.json({ shareToken: recording.shareToken });
        return;
      }
      
      // Generate new share token
      const shareToken = uuidv4();
      await storage.updateRecording(req.params.id, { shareToken });
      
      res.json({ shareToken });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate share token" });
    }
  });

  app.patch("/api/recordings/:id", async (req, res) => {
    try {
      const recording = await storage.updateRecording(req.params.id, req.body);
      if (!recording) {
        res.status(404).json({ error: "Recording not found" });
        return;
      }
      res.json(recording);
    } catch (error) {
      res.status(500).json({ error: "Failed to update recording" });
    }
  });

  app.delete("/api/recordings/:id", async (req, res) => {
    try {
      const success = await storage.deleteRecording(req.params.id);
      if (!success) {
        res.status(404).json({ error: "Recording not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete recording" });
    }
  });

  // Trigger AI transcription for a recording
  app.post("/api/recordings/:id/transcribe", async (req, res) => {
    try {
      const recording = await storage.getRecording(req.params.id);
      if (!recording) {
        res.status(404).json({ error: "Recording not found" });
        return;
      }

      if (!recording.videoUrl) {
        res.status(400).json({ error: "Recording has no video URL to transcribe" });
        return;
      }

      const meeting = await storage.getMeeting(recording.meetingId);
      const meetingTitle = meeting?.title || recording.title || "Meeting";

      // Trigger transcription asynchronously
      processRecordingTranscription(
        recording.id,
        recording.videoUrl,
        recording.meetingId,
        meetingTitle
      ).catch(err => console.error("Recording transcription error:", err));

      res.json({ 
        success: true, 
        message: "Transcription started. It will be available shortly.",
        recordingId: recording.id 
      });
    } catch (error) {
      console.error("Failed to start transcription:", error);
      res.status(500).json({ error: "Failed to start transcription" });
    }
  });

  // Chat Messages
  app.post("/api/meetings/:meetingId/messages", async (req, res) => {
    try {
      const validated = insertChatMessageSchema.parse({
        ...req.body,
        meetingId: req.params.meetingId,
      });
      const message = await storage.createChatMessage(validated);
      res.json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to create message" });
      }
    }
  });

  app.get("/api/meetings/:meetingId/messages", async (req, res) => {
    try {
      const messages = await storage.getChatMessagesByMeeting(req.params.meetingId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Transcript Segments
  app.post("/api/meetings/:meetingId/transcripts", async (req, res) => {
    try {
      const meetingId = req.params.meetingId;
      const validated = insertTranscriptSegmentSchema.parse({
        ...req.body,
        meetingId,
      });
      const segment = await storage.createTranscriptSegment(validated);
      res.json(segment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to create transcript segment" });
      }
    }
  });

  app.get("/api/meetings/:meetingId/transcripts", async (req, res) => {
    try {
      const segments = await storage.getTranscriptsByMeeting(req.params.meetingId);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transcripts" });
    }
  });


  // AI Chat endpoint - EVA SOP Assistant
  app.post("/api/meetings/:meetingId/chat", async (req, res) => {
    try {
      const { message, isScreenSharing } = req.body;
      const meetingId = req.params.meetingId;

      // Get meeting context
      const meeting = await storage.getMeeting(meetingId);
      const meetingContext = meeting ? `Meeting: ${meeting.title}` : "General Meeting";

      // Get the agent's prompt if one is selected for this meeting
      let customPrompt: string | undefined;
      if (meeting?.selectedAgents && meeting.selectedAgents.length > 0) {
        const agentsWithPrompts = await storage.listAgentsWithPrompts();
        
        // Check if Scrum Master agent is selected
        const scrumAgent = agentsWithPrompts.find(
          a => a.type === "scrum" && meeting.selectedAgents?.includes(a.id)
        );
        if (scrumAgent) {
          const { getScrumMasterChatPrompt } = await import("./gemini");
          customPrompt = scrumAgent.prompt?.content || getScrumMasterChatPrompt();
        } else {
          // Support both legacy "sop" type and new "eva" type for backward compatibility
          const evaAgent = agentsWithPrompts.find(
            a => (a.type === "eva" || a.type === "sop") && meeting.selectedAgents?.includes(a.id)
          );
          if (evaAgent?.prompt?.content) {
            customPrompt = evaAgent.prompt.content;
          }
        }
      }

      // Save user message
      await storage.createChatMessage({
        meetingId,
        role: "user",
        content: message,
      });

      // Get AI response from Gemini with custom prompt if available
      const aiResponse = await analyzeChat(message, meetingContext, isScreenSharing, customPrompt);

      // Save AI response
      const savedMessage = await storage.createChatMessage({
        meetingId,
        role: "ai",
        content: aiResponse.message,
        context: isScreenSharing ? "Screen Analysis" : undefined,
      });

      res.json({
        message: aiResponse.message,
        sopUpdate: aiResponse.sopUpdate,
        savedMessage,
      });
    } catch (error) {
      console.error("AI chat error:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Generate Mermaid flowchart from SOP content
  app.post("/api/generate-flowchart", async (req, res) => {
    try {
      const { sopContent, meetingId } = req.body;
      
      if (!sopContent || typeof sopContent !== 'string') {
        res.status(400).json({ error: "sopContent is required" });
        return;
      }

      // Get the flowchart agent's prompt if available
      let customPrompt: string | undefined;
      if (meetingId) {
        const meeting = await storage.getMeeting(meetingId);
        if (meeting?.selectedAgents && meeting.selectedAgents.length > 0) {
          const agentsWithPrompts = await storage.listAgentsWithPrompts();
          const flowchartAgent = agentsWithPrompts.find(
            a => a.type === "flowchart" && meeting.selectedAgents?.includes(a.id)
          );
          if (flowchartAgent?.prompt?.content) {
            customPrompt = flowchartAgent.prompt.content;
          }
        }
      }

      const mermaidCode = await generateMermaidFlowchart(sopContent, customPrompt);
      res.json({ mermaidCode });
    } catch (error) {
      console.error("Flowchart generation error:", error);
      res.status(500).json({ error: "Failed to generate flowchart" });
    }
  });

  // End meeting via sendBeacon (URLSearchParams) - for auto-save on page close
  app.post("/api/meetings/:meetingId/end-beacon", express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const meetingId = req.params.meetingId;
      const sopContent = req.body.sopContent;
      const duration = req.body.duration;

      // Validate required fields are present
      if (!duration) {
        console.log("End-beacon called without required fields, skipping");
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      // Get meeting
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }

      // Check if meeting was already ended
      if (meeting.status === "completed") {
        res.status(200).json({ message: "Meeting already ended" });
        return;
      }

      // Get all chat messages and transcript segments for summary
      const messages = await storage.getChatMessagesByMeeting(meetingId);
      const transcriptSegments = await storage.getTranscriptsByMeeting(meetingId);
      
      // Generate simple summary (no AI call to keep it fast)
      let summary = "Meeting ended (auto-saved).";
      
      // First try to use transcript segments for summary
      if (transcriptSegments.length > 0) {
        const finalSegments = transcriptSegments.filter(t => t.isFinal && t.text.trim().length > 0);
        if (finalSegments.length > 0) {
          const previewText = finalSegments.slice(0, 3).map(t => t.text.slice(0, 50)).join(", ");
          summary = `Meeting with ${finalSegments.length} transcript segments. Topics: ${previewText}...`;
        }
      }
      // Fall back to chat messages
      else if (messages.length > 0) {
        const userMessages = messages.filter(m => m.role === "user");
        if (userMessages.length > 0) {
          summary = `Meeting with ${messages.length} messages. Topics discussed: ${userMessages.slice(0, 3).map(m => m.content.slice(0, 50)).join(", ")}...`;
        }
      }

      // Update meeting status to completed
      await storage.updateMeeting(meetingId, { status: "completed" });

      // Create recording
      await storage.createRecording({
        meetingId,
        title: meeting.title,
        duration,
        summary,
        sopContent: sopContent || null,
      });

      console.log(`Meeting ${meetingId} auto-saved via beacon`);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("End meeting (beacon) error:", error);
      res.status(500).json({ error: "Failed to end meeting" });
    }
  });

  // End meeting and create recording with AI summary
  app.post("/api/meetings/:meetingId/end", async (req, res) => {
    try {
      const meetingId = req.params.meetingId;
      const { sopContent, croContent, duration } = req.body;

      // Get meeting
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }

      // Get all chat messages and transcript segments for summary
      const messages = await storage.getChatMessagesByMeeting(meetingId);
      const transcriptSegments = await storage.getTranscriptsByMeeting(meetingId);

      // Check if Scrum Master agent is selected for this meeting
      let isScrumMeeting = false;
      let scrumPromptContent: string | undefined;
      if (meeting.selectedAgents && meeting.selectedAgents.length > 0) {
        const allAgents = await storage.listAgentsWithPrompts();
        const scrumAgent = allAgents.find(a => a.type === "scrum");
        if (scrumAgent && meeting.selectedAgents.includes(scrumAgent.id)) {
          isScrumMeeting = true;
          scrumPromptContent = scrumAgent.prompt?.content || undefined;
        }
      }
      
      // Generate AI summary of the meeting
      let summary = "Meeting ended without discussion.";
      let scrumResult = null;

      // Build transcript text
      let transcriptText = "";
      if (transcriptSegments.length > 0) {
        transcriptText = transcriptSegments
          .filter(t => t.isFinal && t.text.trim().length > 0)
          .map(t => `${t.speaker}: ${t.text}`)
          .join("\n");
      }

      if (isScrumMeeting) {
        // Fetch previous standup history for continuity (up to 5 past standups)
        let previousStandupContext: string | undefined;
        try {
          const prevSummaries = meeting.createdBy
            ? await storage.getPreviousScrumSummaries(meetingId, meeting.createdBy, 5)
            : [];

          if (prevSummaries.length > 0) {
            const allParts: string[] = [];

            for (let idx = 0; idx < prevSummaries.length; idx++) {
              const prevSummary = prevSummaries[idx];
              const prevData = prevSummary.scrumData as any;
              const dateStr = prevSummary.createdAt
                ? new Date(prevSummary.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : `Standup ${idx + 1}`;

              const parts: string[] = [];
              parts.push(`--- Standup ${idx === 0 ? "(Most Recent)" : `#${idx + 1}`}: ${dateStr} ---`);

              if (prevSummary.fullSummary) {
                parts.push(`Overview: ${prevSummary.fullSummary}`);
              }
              if (prevData?.participants?.length > 0) {
                parts.push("Per-person updates:");
                for (const p of prevData.participants) {
                  parts.push(`  ${p.name}:`);
                  if (p.today?.length > 0) parts.push(`    Working on: ${p.today.join(", ")}`);
                  if (p.blockers?.length > 0) parts.push(`    Blockers: ${p.blockers.join(", ")}`);
                }
              }
              if (prevData?.blockers?.length > 0) {
                parts.push("Active blockers:");
                for (const b of prevData.blockers) {
                  parts.push(`  - ${b.description} (Owner: ${b.owner}, Severity: ${b.severity}, Status: ${b.status})`);
                }
              }
              if (prevData?.actionItems?.length > 0) {
                parts.push("Action items:");
                for (const a of prevData.actionItems) {
                  parts.push(`  - ${a.title} (Assigned to: ${a.assignee}, Priority: ${a.priority})`);
                }
              }
              allParts.push(parts.join("\n"));
            }

            previousStandupContext = allParts.join("\n\n");
            console.log(`[Meeting End] Found ${prevSummaries.length} previous standup(s) for context (${previousStandupContext.length} chars)`);
          }
        } catch (err) {
          console.error("[Meeting End] Failed to fetch previous standup:", err);
        }

        // Use Scrum Master summary generation
        const { generateScrumSummary } = await import("./gemini");
        scrumResult = await generateScrumSummary(
          transcriptText,
          meeting.title,
          messages.length > 0 ? messages : undefined,
          scrumPromptContent,
          previousStandupContext
        );
        
        if (scrumResult) {
          summary = scrumResult.fullSummary;
          
          // Save structured scrum summary
          try {
            await storage.createMeetingSummary({
              meetingId,
              fullSummary: scrumResult.fullSummary,
              summaryType: "scrum",
              scrumData: scrumResult.scrumData,
              keyTopics: scrumResult.scrumData.participants.map(p => `${p.name}'s update`),
              decisions: [],
              openQuestions: scrumResult.scrumData.blockers.filter(b => b.status === "active").map(b => `[BLOCKER] ${b.description} (${b.owner})`),
            });
          } catch (summaryError) {
            console.error("[Meeting End] Failed to save scrum summary:", summaryError);
          }

          // Save action items from scrum data
          if (scrumResult.scrumData.actionItems && scrumResult.scrumData.actionItems.length > 0) {
            for (const item of scrumResult.scrumData.actionItems) {
              try {
                await storage.createScrumActionItem({
                  meetingId,
                  title: item.title,
                  assignee: item.assignee,
                  priority: item.priority,
                  status: "open",
                });
              } catch (itemError) {
                console.error("[Meeting End] Failed to save action item:", itemError);
              }
            }
          }
        }
      }
      
      // Standard summary generation (for non-scrum meetings or as fallback)
      if (!scrumResult) {
        if (transcriptText.length > 10) {
          const summaryResponse = await analyzeChat(
            `Summarize this meeting in 2-3 sentences. Focus on key decisions and action items:\n\n${transcriptText.slice(0, 4000)}`,
            `Meeting: ${meeting.title}`,
            false
          );
          summary = summaryResponse.message;
        } else if (messages.length > 0) {
          const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join("\n");
          const summaryResponse = await analyzeChat(
            `Summarize this meeting in 2-3 sentences. Focus on key decisions and action items:\n\n${chatHistory.slice(0, 4000)}`,
            `Meeting: ${meeting.title}`,
            false
          );
          summary = summaryResponse.message;
        }
      }

      // Generate CRO from chat messages if not provided and we have CRO interview data
      let finalCroContent = croContent || null;
      if (!finalCroContent && messages.length >= 5) {
        const messageText = messages.map(m => m.content.toLowerCase()).join(" ");
        const isCroInterview = messageText.includes("responsibilities") || 
                               messageText.includes("bottleneck") || 
                               messageText.includes("delegate") ||
                               messageText.includes("cro interview") ||
                               messageText.includes("core role");
        
        if (isCroInterview) {
          console.log("[Meeting End] Detected CRO interview, generating CRO document...");
          const { generateCROFromChatMessages } = await import("./gemini");
          finalCroContent = await generateCROFromChatMessages(messages, meeting.title);
        }
      }

      // Update meeting status to completed
      await storage.updateMeeting(meetingId, { status: "completed" });

      const documentContent = sopContent || finalCroContent || null;
      const recording = await storage.createRecording({
        meetingId,
        title: meeting.title,
        duration: duration || "00:00",
        summary,
        sopContent: documentContent,
      });

      res.json({ 
        recording, 
        summary, 
        croGenerated: !!finalCroContent && !croContent,
        isScrumMeeting,
        scrumData: scrumResult?.scrumData || null,
      });
    } catch (error) {
      console.error("End meeting error:", error);
      res.status(500).json({ error: "Failed to end meeting" });
    }
  });

  // Get scrum summary for a meeting
  app.get("/api/meetings/:meetingId/scrum-summary", async (req, res) => {
    try {
      const meetingId = req.params.meetingId;
      const summary = await storage.getMeetingSummary(meetingId);
      
      if (!summary || summary.summaryType !== "scrum") {
        res.status(404).json({ error: "No scrum summary found for this meeting" });
        return;
      }

      const actionItems = await storage.getScrumActionItemsByMeeting(meetingId);
      
      res.json({ summary, actionItems });
    } catch (error) {
      console.error("Get scrum summary error:", error);
      res.status(500).json({ error: "Failed to get scrum summary" });
    }
  });

  // Get scrum action items for a meeting
  app.get("/api/meetings/:meetingId/scrum-action-items", async (req, res) => {
    try {
      const meetingId = req.params.meetingId;
      const actionItems = await storage.getScrumActionItemsByMeeting(meetingId);
      res.json(actionItems);
    } catch (error) {
      console.error("Get scrum action items error:", error);
      res.status(500).json({ error: "Failed to get action items" });
    }
  });

  // Update a scrum action item
  app.patch("/api/scrum-action-items/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, priority, assignee, notes, title } = req.body;
      const updated = await storage.updateScrumActionItem(id, { 
        status, priority, assignee, notes, title 
      });
      if (!updated) {
        res.status(404).json({ error: "Action item not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      console.error("Update scrum action item error:", error);
      res.status(500).json({ error: "Failed to update action item" });
    }
  });

  // Delete a scrum action item
  app.delete("/api/scrum-action-items/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteScrumActionItem(id);
      if (!deleted) {
        res.status(404).json({ error: "Action item not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete scrum action item error:", error);
      res.status(500).json({ error: "Failed to delete action item" });
    }
  });

  // Get consolidated scrum board data for the meeting guide
  app.get("/api/meetings/:meetingId/previous-standup", async (req, res) => {
    try {
      const meetingId = req.params.meetingId;
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }

      if (!meeting.createdBy) {
        res.json({ hasPreviousStandup: false });
        return;
      }

      const allSummaries = await storage.getPreviousScrumSummaries(meetingId, meeting.createdBy, 5);

      if (allSummaries.length === 0) {
        res.json({ hasPreviousStandup: false });
        return;
      }

      const allActionItems: any[] = [];
      for (const s of allSummaries) {
        if (s.meetingId) {
          const items = await storage.getScrumActionItemsByMeeting(s.meetingId);
          allActionItems.push(...items);
        }
      }

      const openActionItems = allActionItems.filter(a => a.status !== "done");
      const doneActionItems = allActionItems.filter(a => a.status === "done");

      const allBlockers: Array<{
        description: string;
        owner: string;
        severity: string;
        status: string;
        firstSeen: string | null;
        meetingTitle: string;
      }> = [];
      const personStatusMap: Record<string, {
        name: string;
        lastWorkingOn: string[];
        lastCompleted: string[];
        currentBlockers: string[];
        lastSeen: string | null;
        meetingTitle: string;
      }> = {};
      const discussionHistory: Array<{
        date: string | null;
        meetingTitle: string;
        summary: string;
        meetingId: string;
      }> = [];

      for (const s of allSummaries) {
        const scrumData = s.scrumData as any;
        const mtg = s.meetingId ? await storage.getMeeting(s.meetingId) : null;
        const meetingTitle = mtg?.title || "Standup";
        const dateStr = s.createdAt ? new Date(s.createdAt).toISOString() : null;

        if (s.fullSummary) {
          discussionHistory.push({
            date: dateStr,
            meetingTitle,
            summary: s.fullSummary,
            meetingId: s.meetingId || "",
          });
        }

        if (scrumData?.blockers?.length > 0) {
          for (const b of scrumData.blockers) {
            if (b.status === "active") {
              const existing = allBlockers.find(
                eb => eb.description.toLowerCase() === b.description.toLowerCase() && eb.owner === b.owner
              );
              if (existing) {
                if (dateStr && (!existing.firstSeen || new Date(dateStr) < new Date(existing.firstSeen))) {
                  existing.firstSeen = dateStr;
                }
              } else {
                allBlockers.push({
                  description: b.description,
                  owner: b.owner,
                  severity: b.severity || "medium",
                  status: b.status,
                  firstSeen: dateStr,
                  meetingTitle,
                });
              }
            }
          }
        }

        if (scrumData?.participants?.length > 0) {
          for (const p of scrumData.participants) {
            if (!personStatusMap[p.name]) {
              personStatusMap[p.name] = {
                name: p.name,
                lastWorkingOn: p.today || [],
                lastCompleted: p.yesterday || [],
                currentBlockers: p.blockers || [],
                lastSeen: dateStr,
                meetingTitle,
              };
            }
          }
        }
      }

      const totalStandups = allSummaries.length;
      const lastStandupDate = allSummaries[0]?.createdAt
        ? new Date(allSummaries[0].createdAt).toISOString()
        : null;

      res.json({
        hasPreviousStandup: true,
        totalStandups,
        lastStandupDate,
        carryOverBlockers: allBlockers,
        openActionItems,
        completedActionItems: doneActionItems,
        teamStatus: Object.values(personStatusMap),
        discussionHistory,
      });
    } catch (error) {
      console.error("Get previous standup error:", error);
      res.status(500).json({ error: "Failed to get previous standup data" });
    }
  });

  // Google Calendar OAuth - Get auth URL
  app.post("/api/google/auth-url", async (req, res) => {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        res.status(503).json({ error: "Google Calendar not configured" });
        return;
      }
      
      const { userId } = req.body;
      if (!userId) {
        res.status(400).json({ error: "User ID required" });
        return;
      }
      
      // Get host from request to build dynamic redirect URI
      const host = req.get("host") || "localhost:5000";
      const authUrl = getAuthUrl(userId, host);
      res.json({ authUrl });
    } catch (error) {
      console.error("Google auth URL error:", error);
      res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  // Google Calendar OAuth callback
  app.get("/api/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || typeof code !== "string") {
        res.redirect("/?error=missing_code");
        return;
      }

      if (!state || typeof state !== "string") {
        res.redirect("/?error=invalid_state");
        return;
      }

      const stateResult = validateOAuthState(state);
      if (!stateResult) {
        res.redirect("/?error=invalid_state");
        return;
      }

      const { userId, redirectUri } = stateResult;
      const tokens = await getTokensFromCode(code, redirectUri);
      const userInfo = await getUserInfo(tokens.access_token!);

      // Check if user exists by ID or email, create if not (upsert)
      let user = await storage.getUser(userId);
      
      // Also check by email if user not found by ID
      if (!user && userInfo.email) {
        user = await storage.getUserByEmail(userInfo.email);
      }
      
      if (!user) {
        // Create user with Firebase UID as the ID
        user = await storage.createUserWithId(userId, {
          username: userInfo.email || userId,
          email: userInfo.email || `${userId}@videoai.local`,
          password: "", // Firebase users don't need password
          role: "user",
          status: "active",
          googleAccessToken: tokens.access_token || null,
          googleRefreshToken: tokens.refresh_token || null,
          googleEmail: userInfo.email || null,
        });
      } else {
        // Update existing user with Google tokens (use their existing ID)
        await storage.updateUser(user.id, {
          googleAccessToken: tokens.access_token || undefined,
          googleRefreshToken: tokens.refresh_token || undefined,
          googleEmail: userInfo.email || undefined,
        });
      }

      // Redirect back to app with success status only (no tokens in URL)
      res.redirect(`/?google_auth=success&google_email=${encodeURIComponent(userInfo.email || "")}`);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect("/?error=auth_failed");
    }
  });

  // Get user's Google Calendar status
  app.get("/api/google/status/:userId", async (req, res) => {
    try {
      let user = await storage.getUser(req.params.userId);
      
      // Fallback: check by email query param if user not found by ID
      if (!user && req.query.email) {
        user = await storage.getUserByEmail(req.query.email as string);
      }
      
      if (!user) {
        // Return not connected instead of 404 for cleaner frontend handling
        res.json({ connected: false, email: null });
        return;
      }
      res.json({
        connected: !!user.googleAccessToken,
        email: user.googleEmail || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get Google status" });
    }
  });

  // Disconnect Google Calendar
  app.post("/api/google/disconnect/:userId", async (req, res) => {
    try {
      let user = await storage.getUser(req.params.userId);
      
      // Fallback: check by email if user not found by ID
      if (!user && req.body.email) {
        user = await storage.getUserByEmail(req.body.email);
      }
      
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      
      await storage.updateUser(user.id, {
        googleAccessToken: undefined,
        googleRefreshToken: undefined,
        googleEmail: undefined,
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to disconnect Google" });
    }
  });

  // Schedule meeting with Google Calendar event
  const scheduleWithCalendarSchema = z.object({
    title: z.string().min(1),
    scheduledDate: z.string(),
    endDate: z.string().optional(),
    attendeeEmails: z.array(z.string().email()).optional(),
    description: z.string().optional(),
    agenda: z.string().optional(),
    files: z.array(z.object({
      filename: z.string(),
      originalName: z.string(),
      mimeType: z.string(),
      size: z.string(),
      content: z.string().optional(),
    })).optional(),
    userId: z.string().optional(),
    userEmail: z.string().email().optional(),
    eventType: z.enum(["event", "task"]).optional().default("event"),
    isAllDay: z.boolean().optional().default(false),
    recurrence: z.enum(["none", "daily", "weekly", "monthly", "annually", "weekdays", "custom"]).optional().default("none"),
    selectedAgents: z.array(z.string()).optional(),
  });

  app.post("/api/meetings/schedule-with-calendar", async (req, res) => {
    try {
      const validated = scheduleWithCalendarSchema.parse(req.body);
      
      const roomId = generateRoomId();
      const startTime = new Date(validated.scheduledDate);
      const endTime = validated.endDate 
        ? new Date(validated.endDate) 
        : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

      // Build the full meeting link
      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
      const meetingLink = `${protocol}://${host}/meeting/${roomId}`;

      // Create meeting in database
      const meeting = await storage.createMeeting({
        title: validated.title,
        roomId,
        status: "scheduled",
        scheduledDate: startTime,
        endDate: endTime,
        attendeeEmails: validated.attendeeEmails || null,
        selectedAgents: validated.selectedAgents || null,
        eventType: validated.eventType,
        isAllDay: validated.isAllDay,
        recurrence: validated.recurrence,
        createdBy: validated.userId || null,
      });

      let calendarEvent = null;
      
      // Get user's Google tokens from server-side storage (check by ID first, then email)
      let user = null;
      if (validated.userId) {
        user = await storage.getUser(validated.userId);
      }
      if (!user && validated.userEmail) {
        user = await storage.getUserByEmail(validated.userEmail);
      }
      
      if (user?.googleAccessToken) {
        try {
          calendarEvent = await createCalendarEvent({
            title: validated.title,
            description: validated.description,
            startTime,
            endTime,
            attendeeEmails: validated.attendeeEmails || [],
            meetingLink,
            accessToken: user.googleAccessToken,
            refreshToken: user.googleRefreshToken || undefined,
            isAllDay: validated.isAllDay,
            recurrence: validated.recurrence,
          });

          // Update meeting with calendar event ID
          await storage.updateMeeting(meeting.id, {
            calendarEventId: calendarEvent.id || null,
          });
        } catch (calendarError) {
          console.error("Failed to create calendar event:", calendarError);
          // Continue without calendar event - meeting is still created
        }
      }

      // Create agenda if provided
      if (validated.agenda) {
        try {
          await storage.createMeetingAgenda({
            meetingId: meeting.id,
            items: [],
            content: validated.agenda,
          });
        } catch (agendaError) {
          console.error("Failed to create meeting agenda:", agendaError);
        }
      }

      // Upload files if provided
      if (validated.files && validated.files.length > 0) {
        for (const file of validated.files) {
          try {
            await storage.createMeetingFile({
              meetingId: meeting.id,
              filename: file.filename,
              originalName: file.originalName,
              mimeType: file.mimeType,
              size: file.size,
              content: file.content,
            });
          } catch (fileError) {
            console.error("Failed to upload meeting file:", fileError);
          }
        }
      }

      res.json({
        success: true,
        meeting: {
          id: meeting.id,
          title: meeting.title,
          roomId: meeting.roomId,
          scheduledDate: meeting.scheduledDate,
          endDate: endTime,
          attendeeEmails: meeting.attendeeEmails,
          calendarEventId: calendarEvent?.id,
        },
        link: meetingLink,
        calendarEventCreated: !!calendarEvent,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("Schedule meeting error:", error);
        res.status(500).json({ error: "Failed to schedule meeting" });
      }
    }
  });

  // JaaS JWT Token Generation
  app.post("/api/jaas/token", async (req, res) => {
    try {
      const { roomName, userName, userEmail, userAvatar, wantsModerator, moderatorCode } = req.body;
      
      // Determine if user should be moderator by verifying Firebase ID token
      let isModerator = false;
      let verifiedUserId: string | null = null;
      
      // Check for Firebase ID token in Authorization header
      const authHeader = req.headers["authorization"] as string;
      console.log("[JaaS Token] Auth header present:", !!authHeader, "Firebase Admin ready:", admin.apps.length > 0, "wantsModerator:", wantsModerator);
      
      // If user explicitly doesn't want moderator, skip the verification
      if (wantsModerator === false) {
        console.log("[JaaS Token] User opted out of moderator role");
      } else if (authHeader && authHeader.startsWith("Bearer ") && admin.apps.length > 0) {
        const idToken = authHeader.substring(7);
        try {
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          verifiedUserId = decodedToken.uid;
          console.log("[JaaS Token] Verified user UID:", verifiedUserId);
        } catch (e) {
          // Token verification failed - user will join as non-moderator
          console.log("[JaaS Token] Firebase token verification failed:", e);
        }
      }
      
      // Check if user should be moderator (like Zoom: creator auto-moderator, or anyone with valid code)
      if (wantsModerator !== false && roomName) {
        // Extract roomId from roomName (format: "VideoAI-{roomId}")
        const roomId = roomName.replace(/^VideoAI-/i, "");
        if (roomId) {
          const meeting = await storage.getMeetingByRoomId(roomId);
          console.log("[JaaS Token] Meeting lookup:", { roomId, meetingCreatedBy: meeting?.createdBy, verifiedUserId, hasModeratorCode: !!moderatorCode });
          
          // Priority 1: Meeting creator is always a moderator (automatic, no code needed)
          if (verifiedUserId && meeting && meeting.createdBy === verifiedUserId) {
            isModerator = true;
            console.log("[JaaS Token] User is moderator (creator match - automatic)");
          }
          // Priority 2: Anyone (logged-in or not) with valid moderator code becomes moderator
          else if (wantsModerator === true && moderatorCode) {
            if (meeting && meeting.moderatorCode && meeting.moderatorCode === moderatorCode) {
              isModerator = true;
              console.log("[JaaS Token] User is moderator (valid moderator code provided)");
            } else if (!meeting?.moderatorCode) {
              // Meeting has no moderator code set - deny access for security
              console.log("[JaaS Token] User is NOT moderator (meeting has no moderator code set)");
            } else {
              console.log("[JaaS Token] User is NOT moderator (invalid moderator code)");
            }
          } else if (wantsModerator === true && !moderatorCode) {
            console.log("[JaaS Token] User wants moderator but no code provided");
          }
        }
      } else if (wantsModerator === false) {
        console.log("[JaaS Token] User declined moderator role, moderator=false");
      } else {
        console.log("[JaaS Token] No roomName provided, moderator=false");
      }
      
      console.log("[JaaS Token] Final moderator status:", isModerator);

      // JaaS configuration from environment - all required
      const rawPrivateKey = process.env.JAAS_PRIVATE_KEY;
      const appId = process.env.JAAS_APP_ID;
      const apiKey = process.env.JAAS_API_KEY;

      // All JaaS credentials must be configured
      if (!rawPrivateKey || !appId || !apiKey) {
        res.status(503).json({ error: "JaaS not configured" });
        return;
      }

      // Handle various private key formats from environment variables
      let privateKey = rawPrivateKey.trim();
      
      // Check if key contains literal \n (escaped) and convert to actual newlines
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
      // If key has no actual newlines but has PEM headers, it's all on one line
      // We need to reconstruct proper PEM format with 64-char lines
      if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN')) {
        // Extract the header, body, and footer
        const beginMatch = privateKey.match(/(-----BEGIN [A-Z ]+-----)/);
        const endMatch = privateKey.match(/(-----END [A-Z ]+-----)/);
        
        if (beginMatch && endMatch) {
          const header = beginMatch[1];
          const footer = endMatch[1];
          
          // Extract the base64 content between header and footer
          const startIdx = privateKey.indexOf(header) + header.length;
          const endIdx = privateKey.indexOf(footer);
          const base64Content = privateKey.substring(startIdx, endIdx).replace(/\s/g, '');
          
          // Reconstruct with 64-char lines
          const lines = [];
          for (let i = 0; i < base64Content.length; i += 64) {
            lines.push(base64Content.substring(i, i + 64));
          }
          
          privateKey = `${header}\n${lines.join('\n')}\n${footer}`;
        }
      }

      const now = new Date();
      const userId = uuidv4();

      const token = jwt.sign(
        {
          aud: "jitsi",
          context: {
            user: {
              id: userId,
              name: userName || "Guest",
              avatar: userAvatar || "",
              email: userEmail || `${userId}@guest.local`,
              moderator: isModerator,
            },
            features: {
              livestreaming: "true",
              recording: "true",
              transcription: "true",
              "outbound-call": "true",
            },
          },
          iss: "chat",
          room: roomName || "*",
          sub: appId,
          exp: Math.round(now.setHours(now.getHours() + 3) / 1000),
          nbf: Math.round(new Date().getTime() / 1000) - 10,
        },
        privateKey,
        { algorithm: "RS256", header: { kid: apiKey, typ: "JWT", alg: "RS256" } }
      );

      res.json({ token, appId, isModerator });
    } catch (error) {
      console.error("JaaS token generation error:", error);
      res.status(500).json({ error: "Failed to generate JaaS token" });
    }
  });

  // JaaS Webhook endpoint - receives events from 8x8 JaaS
  // Payload structure per https://developer.8x8.com/jaas/docs/webhooks-payload/
  app.post("/api/jaas/webhook", async (req, res) => {
    try {
      const body = req.body;
      
      // Extract fields - JaaS sends at top level of payload
      const idempotencyKey = body.idempotencyKey;
      const eventType = body.eventType;
      const sessionId = body.sessionId;
      const fqn = body.fqn;
      const data = body.data;

      console.log(`JaaS Webhook received: ${eventType}`, { sessionId, fqn, body: JSON.stringify(body).slice(0, 500) });

      // Validate required fields
      if (!idempotencyKey || !eventType || !sessionId || !fqn) {
        console.error("JaaS webhook missing required fields:", { idempotencyKey, eventType, sessionId, fqn });
        res.status(400).json({ 
          error: "Missing required fields", 
          received: { idempotencyKey: !!idempotencyKey, eventType: !!eventType, sessionId: !!sessionId, fqn: !!fqn }
        });
        return;
      }

      // Check idempotency - skip if already processed
      const existingEvent = await storage.getWebhookEventByIdempotencyKey(idempotencyKey);
      if (existingEvent) {
        console.log(`Duplicate webhook event skipped: ${idempotencyKey}`);
        res.status(200).json({ status: "duplicate", message: "Event already processed" });
        return;
      }

      // Store webhook event for idempotency tracking
      await storage.createWebhookEvent({
        idempotencyKey,
        eventType,
        sessionId,
        fqn,
        payload: body,
      });

      // Extract room name from FQN (format: "AppID/roomName")
      const rawRoomName = fqn?.split("/")[1];
      
      // Helper function to find meeting by room name with flexible matching
      // JaaS room names may have prefixes like "VideoAI-" that need to be stripped (case-insensitive)
      const findMeetingByFlexibleRoomId = async (roomNameToFind: string | undefined) => {
        if (!roomNameToFind) return null;
        
        console.log(`Looking for meeting with room name: ${roomNameToFind}`);
        
        // Try exact match first
        let meeting = await storage.getMeetingByRoomId(roomNameToFind);
        if (meeting) {
          console.log(`Found meeting by exact room match: ${roomNameToFind}`);
          return meeting;
        }
        
        // Try case-insensitive exact match
        meeting = await storage.getMeetingByRoomIdCaseInsensitive(roomNameToFind);
        if (meeting) {
          console.log(`Found meeting by case-insensitive match: ${roomNameToFind}`);
          return meeting;
        }
        
        // Try stripping common prefixes (e.g., "VideoAI-roomid" -> "roomid")
        const parts = roomNameToFind.split("-");
        if (parts.length > 1) {
          // Try the last part (e.g., "VideoAI-y6xi7f" -> "y6xi7f")
          const lastPart = parts[parts.length - 1];
          meeting = await storage.getMeetingByRoomId(lastPart);
          if (meeting) {
            console.log(`Found meeting by stripping prefix: ${roomNameToFind} -> ${lastPart}`);
            return meeting;
          }
          
          // Try case-insensitive match on last part
          meeting = await storage.getMeetingByRoomIdCaseInsensitive(lastPart);
          if (meeting) {
            console.log(`Found meeting by case-insensitive last part: ${roomNameToFind} -> ${lastPart}`);
            return meeting;
          }
          
          // Try everything after the first hyphen (e.g., "prefix-room-id" -> "room-id")
          const afterFirstHyphen = parts.slice(1).join("-");
          meeting = await storage.getMeetingByRoomId(afterFirstHyphen);
          if (meeting) {
            console.log(`Found meeting by removing first prefix: ${roomNameToFind} -> ${afterFirstHyphen}`);
            return meeting;
          }
          
          // Try case-insensitive on after first hyphen
          meeting = await storage.getMeetingByRoomIdCaseInsensitive(afterFirstHyphen);
          if (meeting) {
            console.log(`Found meeting by case-insensitive after prefix: ${roomNameToFind} -> ${afterFirstHyphen}`);
            return meeting;
          }
        }
        
        console.log(`No meeting found for room: ${roomNameToFind}`);
        return null;
      };
      
      // Use the raw room name for logging, but use flexible matching for lookups
      const roomName = rawRoomName;

      // Handle different event types
      switch (eventType) {
        case "ROOM_CREATED": {
          console.log(`Room created: ${data?.conference}`);
          break;
        }

        case "ROOM_DESTROYED": {
          console.log(`Room destroyed: ${data?.conference}`);
          // Find and complete the meeting
          if (roomName) {
            const meeting = await findMeetingByFlexibleRoomId(roomName);
            if (meeting && meeting.status !== "completed") {
              await storage.updateMeeting(meeting.id, { status: "completed" });
            }
          }
          break;
        }

        case "PARTICIPANT_JOINED": {
          console.log(`Participant joined: ${data?.name}`);
          break;
        }

        case "PARTICIPANT_LEFT": {
          console.log(`Participant left: ${data?.name}, reason: ${data?.disconnectReason}`);
          break;
        }

        case "RECORDING_STARTED": {
          console.log(`Recording started for: ${data?.conference}`);
          break;
        }

        case "RECORDING_ENDED": {
          console.log(`Recording ended for: ${data?.conference}`);
          break;
        }

        case "RECORDING_UPLOADED": {
          console.log(`=== RECORDING_UPLOADED webhook received ===`);
          console.log(`Room name from FQN: ${roomName}`);
          console.log(`Video URL: ${data?.preAuthenticatedLink}`);
          
          // Find associated meeting and update recording with video URL
          if (roomName && data?.preAuthenticatedLink) {
            const meeting = await findMeetingByFlexibleRoomId(roomName);
            console.log(`Meeting lookup result: ${meeting ? `Found meeting ${meeting.id} (${meeting.title})` : 'No meeting found'}`);
            if (meeting) {
              // Find existing recording for this meeting
              const recordings = await storage.getRecordingsByMeeting(meeting.id);
              const existingRecording = recordings[0];
              
              let recordingId: string;
              if (existingRecording) {
                // Update existing recording with video URL
                await storage.updateRecording(existingRecording.id, {
                  videoUrl: data.preAuthenticatedLink
                });
                recordingId = existingRecording.id;
                console.log(`Updated recording ${existingRecording.id} with video URL`);
              } else {
                // Create new recording with video URL
                const newRecording = await storage.createRecording({
                  meetingId: meeting.id,
                  title: meeting.title,
                  duration: "Unknown",
                  videoUrl: data.preAuthenticatedLink,
                });
                recordingId = newRecording.id;
                console.log(`Created new recording for meeting ${meeting.id} with video URL`);
              }

              // Trigger AI transcription of the recording asynchronously
              processRecordingTranscription(
                recordingId,
                data.preAuthenticatedLink,
                meeting.id,
                meeting.title
              ).catch(err => console.error("Recording transcription error:", err));
            }
          }
          break;
        }

        case "TRANSCRIPTION_UPLOADED": {
          console.log(`Transcription uploaded, downloading from: ${data?.preAuthenticatedLink}`);
          
          // Find associated meeting
          let meetingId: string | null = null;
          if (roomName) {
            const meeting = await findMeetingByFlexibleRoomId(roomName);
            meetingId = meeting?.id || null;
          }

          // Create initial transcription record
          const transcription = await storage.createMeetingTranscription({
            meetingId,
            sessionId,
            fqn,
            downloadUrl: data?.preAuthenticatedLink,
          });

          // Download transcription asynchronously
          if (data?.preAuthenticatedLink) {
            processTranscription(
              transcription.id,
              data.preAuthenticatedLink,
              roomName,
              meetingId ?? undefined
            ).catch(err => console.error("Transcription processing error:", err));
          }
          break;
        }

        case "CHAT_UPLOADED": {
          console.log(`Chat uploaded: ${data?.preAuthenticatedLink}`);
          break;
        }

        default:
          console.log(`Unhandled JaaS event type: ${eventType}`);
      }

      res.status(200).json({ status: "received", eventType });
    } catch (error) {
      console.error("JaaS webhook error:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // Get transcriptions for a meeting
  app.get("/api/meetings/:meetingId/transcriptions", async (req, res) => {
    try {
      const transcriptions = await storage.getTranscriptionsByMeetingId(req.params.meetingId);
      res.json(transcriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transcriptions" });
    }
  });

  // ============================================
  // Admin Routes - Users
  // ============================================
  
  // Get current user by email (for role checking)
  app.get("/api/admin/users/by-email/:email", async (req, res) => {
    try {
      const user = await storage.getUserByEmail(req.params.email);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });
  
  // List all users with optional search
  app.get("/api/admin/users", async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const usersList = await storage.listUsers(search);
      // Don't return passwords
      const safeUsers = usersList.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get single user
  app.get("/api/admin/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Create user
  app.post("/api/admin/users", async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      
      // Check if username or email already exists
      const existingUsername = await storage.getUserByUsername(validated.username);
      if (existingUsername) {
        res.status(400).json({ error: "Username already exists" });
        return;
      }
      const existingEmail = await storage.getUserByEmail(validated.email);
      if (existingEmail) {
        res.status(400).json({ error: "Email already exists" });
        return;
      }
      
      // Hash the password before storing
      const hashedPassword = await bcrypt.hash(validated.password, SALT_ROUNDS);
      const user = await storage.createUser({ ...validated, password: hashedPassword });
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to create user" });
      }
    }
  });

  // Update user
  app.patch("/api/admin/users/:id", async (req, res) => {
    try {
      const validated = updateUserSchema.parse(req.body);
      
      // If changing username, check it's not taken
      if (validated.username) {
        const existing = await storage.getUserByUsername(validated.username);
        if (existing && existing.id !== req.params.id) {
          res.status(400).json({ error: "Username already exists" });
          return;
        }
      }
      
      // If changing email, check it's not taken
      if (validated.email) {
        const existing = await storage.getUserByEmail(validated.email);
        if (existing && existing.id !== req.params.id) {
          res.status(400).json({ error: "Email already exists" });
          return;
        }
      }
      
      // Prepare update data - exclude empty password
      const { password: inputPassword, ...otherFields } = validated;
      let updateData: Record<string, unknown> = { ...otherFields };
      
      // Only update password if a non-empty value is provided
      if (inputPassword && inputPassword.trim().length > 0) {
        updateData.password = await bcrypt.hash(inputPassword, SALT_ROUNDS);
      }
      
      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to update user" });
      }
    }
  });

  // Delete user
  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      const success = await storage.deleteUser(req.params.id);
      if (!success) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ============================================
  // Admin Routes - Prompts
  // ============================================
  
  // List all prompts with optional type filter
  app.get("/api/admin/prompts", async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const promptsList = await storage.listPrompts(type);
      res.json(promptsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prompts" });
    }
  });

  // Get single prompt
  app.get("/api/admin/prompts/:id", async (req, res) => {
    try {
      const prompt = await storage.getPrompt(req.params.id);
      if (!prompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }
      res.json(prompt);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prompt" });
    }
  });

  // Create prompt
  app.post("/api/admin/prompts", async (req, res) => {
    try {
      const validated = insertPromptSchema.parse(req.body);
      
      const cleanContent = validated.content?.replace(/<[^>]*>/g, '').trim();
      if (!cleanContent) {
        res.status(400).json({ error: "Prompt content cannot be empty" });
        return;
      }
      
      const prompt = await storage.createPrompt(validated);
      res.json(prompt);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to create prompt" });
      }
    }
  });

  // Update prompt (with version history)
  app.patch("/api/admin/prompts/:id", async (req, res) => {
    try {
      const validated = updatePromptSchema.parse(req.body);
      
      if (validated.content !== undefined) {
        const cleanContent = validated.content.replace(/<[^>]*>/g, '').trim();
        if (!cleanContent) {
          res.status(400).json({ error: "Prompt content cannot be empty" });
          return;
        }
      }
      
      // Get current prompt to save as version before updating
      const currentPrompt = await storage.getPrompt(req.params.id);
      if (!currentPrompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }
      
      // Get next version number
      const latestVersion = await storage.getLatestVersionNumber(req.params.id);
      const nextVersion = (latestVersion + 1).toString();
      
      // Save current state as a version before updating
      await storage.createPromptVersion({
        promptId: currentPrompt.id,
        version: nextVersion,
        name: currentPrompt.name,
        type: currentPrompt.type,
        content: currentPrompt.content,
        description: currentPrompt.description,
        isActive: currentPrompt.isActive,
      });
      
      // Update the prompt
      const prompt = await storage.updatePrompt(req.params.id, validated);
      res.json(prompt);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("Update prompt error:", error);
        res.status(500).json({ error: "Failed to update prompt" });
      }
    }
  });

  // Get prompt version history
  app.get("/api/admin/prompts/:id/versions", async (req, res) => {
    try {
      const prompt = await storage.getPrompt(req.params.id);
      if (!prompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }
      const versions = await storage.getPromptVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prompt versions" });
    }
  });

  // Revert prompt to a specific version
  app.post("/api/admin/prompts/:id/revert/:versionId", async (req, res) => {
    try {
      const { id: promptId, versionId } = req.params;
      
      // Get the version to revert to
      const version = await storage.getPromptVersion(versionId);
      if (!version) {
        res.status(404).json({ error: "Version not found" });
        return;
      }
      
      // Verify the version belongs to the correct prompt
      if (version.promptId !== promptId) {
        res.status(400).json({ error: "Version does not belong to this prompt" });
        return;
      }
      
      // Get current prompt to save before reverting
      const currentPrompt = await storage.getPrompt(promptId);
      if (!currentPrompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }
      
      // Save current state as a new version before reverting
      const latestVersion = await storage.getLatestVersionNumber(promptId);
      await storage.createPromptVersion({
        promptId: currentPrompt.id,
        version: (latestVersion + 1).toString(),
        name: currentPrompt.name,
        type: currentPrompt.type,
        content: currentPrompt.content,
        description: currentPrompt.description,
        isActive: currentPrompt.isActive,
      });
      
      // Revert by updating with version data
      const updatedPrompt = await storage.updatePrompt(promptId, {
        name: version.name,
        type: version.type,
        content: version.content,
        description: version.description,
        isActive: version.isActive,
      });
      
      res.json(updatedPrompt);
    } catch (error) {
      console.error("Revert prompt error:", error);
      res.status(500).json({ error: "Failed to revert prompt" });
    }
  });

  // Delete prompt
  app.delete("/api/admin/prompts/:id", async (req, res) => {
    try {
      const success = await storage.deletePrompt(req.params.id);
      if (!success) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete prompt" });
    }
  });

  // ============================================
  // Public Routes - Agents (for meeting room)
  // ============================================
  
  // List all active agents for agent selection in meetings
  app.get("/api/agents", async (req, res) => {
    try {
      const agentsList = await storage.listAgents(undefined, undefined);
      // Only return active agents
      const activeAgents = agentsList.filter(a => a.status === "active");
      res.json(activeAgents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch agents" });
    }
  });

  // ============================================
  // Admin Routes - Agents
  // ============================================
  
  // List all agents with optional search and type filter (includes linked prompts)
  app.get("/api/admin/agents", async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const type = req.query.type as string | undefined;
      const agentsList = await storage.listAgentsWithPrompts(search, type);
      res.json(agentsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch agents" });
    }
  });

  // Get single agent
  app.get("/api/admin/agents/:id", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      res.json(agent);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch agent" });
    }
  });

  // Create agent
  app.post("/api/admin/agents", async (req, res) => {
    try {
      // Ensure capabilities is an array
      const body = {
        ...req.body,
        capabilities: Array.isArray(req.body.capabilities) 
          ? req.body.capabilities 
          : req.body.capabilities?.split(",").map((c: string) => c.trim()).filter((c: string) => c) || []
      };
      
      const validated = insertAgentSchema.parse(body);
      
      // Check if name already exists
      const existingName = await storage.getAgentByName(validated.name);
      if (existingName) {
        res.status(400).json({ error: "Agent name already exists" });
        return;
      }
      
      const agent = await storage.createAgent(validated);
      res.json(agent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("Create agent error:", error);
        res.status(500).json({ error: "Failed to create agent" });
      }
    }
  });

  // Update agent
  app.patch("/api/admin/agents/:id", async (req, res) => {
    try {
      // Ensure capabilities is an array if provided
      const body = { ...req.body };
      if (body.capabilities !== undefined) {
        body.capabilities = Array.isArray(body.capabilities) 
          ? body.capabilities 
          : body.capabilities?.split(",").map((c: string) => c.trim()).filter((c: string) => c) || [];
      }
      
      const validated = updateAgentSchema.parse(body);
      
      // If changing name, check it's not taken
      if (validated.name) {
        const existing = await storage.getAgentByName(validated.name);
        if (existing && existing.id !== req.params.id) {
          res.status(400).json({ error: "Agent name already exists" });
          return;
        }
      }
      
      const agent = await storage.updateAgent(req.params.id, validated);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      res.json(agent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("Update agent error:", error);
        res.status(500).json({ error: "Failed to update agent" });
      }
    }
  });

  // Delete agent
  app.delete("/api/admin/agents/:id", async (req, res) => {
    try {
      const success = await storage.deleteAgent(req.params.id);
      if (!success) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete agent" });
    }
  });

  // =====================================================
  // EVA Ops Memory - Observation Sessions & SOPs
  // =====================================================

  // Create observation session
  app.post("/api/observation-sessions", async (req, res) => {
    try {
      const session = await storage.createObservationSession(req.body);
      res.json(session);
    } catch (error) {
      console.error("Create observation session error:", error);
      res.status(500).json({ error: "Failed to create observation session" });
    }
  });

  // Get observation session
  app.get("/api/observation-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getObservationSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // Update observation session (phase changes, status)
  app.patch("/api/observation-sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateObservationSession(req.params.id, req.body);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // List observation sessions
  app.get("/api/observation-sessions", async (req, res) => {
    try {
      const meetingId = req.query.meetingId as string | undefined;
      const sessions = await storage.listObservationSessions(meetingId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to list sessions" });
    }
  });

  // Add observation to session
  app.post("/api/observation-sessions/:sessionId/observations", async (req, res) => {
    try {
      const observation = await storage.createObservation({
        ...req.body,
        sessionId: req.params.sessionId,
      });
      res.json(observation);
    } catch (error) {
      console.error("Create observation error:", error);
      res.status(500).json({ error: "Failed to create observation" });
    }
  });

  // Get observations for session
  app.get("/api/observation-sessions/:sessionId/observations", async (req, res) => {
    try {
      const observations = await storage.getObservationsBySession(req.params.sessionId);
      res.json(observations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch observations" });
    }
  });

  // Create clarification question
  app.post("/api/observation-sessions/:sessionId/clarifications", async (req, res) => {
    try {
      const clarification = await storage.createClarification({
        ...req.body,
        sessionId: req.params.sessionId,
      });
      res.json(clarification);
    } catch (error) {
      console.error("Create clarification error:", error);
      res.status(500).json({ error: "Failed to create clarification" });
    }
  });

  // Get clarifications for session
  app.get("/api/observation-sessions/:sessionId/clarifications", async (req, res) => {
    try {
      const clarifications = await storage.getClarificationsBySession(req.params.sessionId);
      res.json(clarifications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch clarifications" });
    }
  });

  // Answer clarification
  app.patch("/api/clarifications/:id", async (req, res) => {
    try {
      const clarification = await storage.updateClarification(req.params.id, {
        ...req.body,
        status: req.body.answer ? "answered" : req.body.status,
        answeredAt: req.body.answer ? new Date() : undefined,
      });
      if (!clarification) {
        res.status(404).json({ error: "Clarification not found" });
        return;
      }
      res.json(clarification);
    } catch (error) {
      res.status(500).json({ error: "Failed to update clarification" });
    }
  });

  // Generate SOP from observation session
  app.post("/api/observation-sessions/:sessionId/generate-sop", async (req, res) => {
    try {
      const session = await storage.getObservationSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: "Observation session not found" });
        return;
      }

      const observations = await storage.getObservationsBySession(req.params.sessionId);
      const clarifications = await storage.getClarificationsBySession(req.params.sessionId);

      // If no observations, try to use meeting content as fallback (transcripts or chat messages)
      let obsData: Array<{ type: string; content: string; app?: string; action?: string }> = [];
      
      if (observations.length > 0) {
        // Use observations
        obsData = observations.map(o => ({
          type: o.type,
          content: o.content,
          app: o.app || undefined,
          action: o.action || undefined,
        }));
      } else if (session.meetingId) {
        // Try meeting transcripts first
        const transcripts = await storage.getTranscriptsByMeeting(session.meetingId);
        if (transcripts.length > 0) {
          // Convert transcripts to observation format
          obsData = transcripts.map(t => ({
            type: "verbal_note",
            content: `${t.speaker}: ${t.text}`,
          }));
          console.log(`Using ${transcripts.length} transcript segments for SOP generation`);
        } else {
          // Fallback to chat messages (which contain screen analysis from EVA)
          const chatMessages = await storage.getChatMessagesByMeeting(session.meetingId);
          const screenAnalysisMessages = chatMessages.filter(
            (m: { role: string; context: string | null }) => m.role === "ai" && m.context === "Screen Analysis"
          );
          
          if (screenAnalysisMessages.length > 0) {
            obsData = screenAnalysisMessages.map((m: { content: string }) => ({
              type: "screen_analysis",
              content: m.content,
            }));
            console.log(`Using ${screenAnalysisMessages.length} screen analysis messages for SOP generation`);
          } else if (chatMessages.length > 0) {
            // Use any AI messages as context
            const aiMessages = chatMessages.filter((m: { role: string }) => m.role === "ai");
            if (aiMessages.length > 0) {
              obsData = aiMessages.map((m: { content: string }) => ({
                type: "ai_analysis",
                content: m.content,
              }));
              console.log(`Using ${aiMessages.length} AI chat messages for SOP generation`);
            }
          }
        }
        
        if (obsData.length === 0) {
          res.status(400).json({ error: "No observations or transcripts to generate SOP from. Please ensure the meeting has content before generating an SOP." });
          return;
        }
      } else {
        res.status(400).json({ error: "No observations to generate SOP from" });
        return;
      }

      const clarData = clarifications.map(c => ({
        question: c.question,
        answer: c.answer || undefined,
      }));

      // Fetch conversation context from Meeting Assistant (chat messages and notes)
      let conversationContext: { role: string; content: string; speaker?: string }[] = [];
      
      if (session.meetingId) {
        // Get chat messages from Meeting Assistant
        const chatMessages = await storage.getChatMessagesByMeeting(session.meetingId);
        
        // Get meeting notes
        const notes = await storage.getMeetingNotes(session.meetingId);
        
        // Combine chat messages (conversations) 
        const chatContext = chatMessages.map((msg: { role: string; content: string }) => ({
          role: msg.role,
          content: msg.content,
          speaker: msg.role === 'user' ? 'User' : 'EVA Assistant',
        }));
        
        // Add notes as context (these contain key points discussed)
        const notesContext = notes.map((note: { content: string }) => ({
          role: 'note',
          content: note.content,
          speaker: 'Meeting Notes',
        }));
        
        conversationContext = [...chatContext, ...notesContext];
        
        if (conversationContext.length > 0) {
          console.log(`Including ${chatContext.length} chat messages and ${notesContext.length} notes as conversation context for SOP generation`);
        }
      }

      // Generate the decision-based SOP with conversation context
      const sopData = await generateDecisionBasedSOP(
        obsData,
        clarData,
        session.title || "Untitled SOP",
        conversationContext
      );

      // Create the SOP in the database
      const sop = await storage.createSop({
        sessionId: session.id,
        title: session.title || "Untitled SOP",
        status: "draft",
        version: "1",
        goal: sopData.goal,
        whenToUse: sopData.whenToUse,
        whoPerforms: sopData.whoPerforms,
        toolsRequired: sopData.toolsRequired,
        mainFlow: sopData.mainFlow,
        decisionPoints: sopData.decisionPoints,
        exceptions: sopData.exceptions,
        qualityCheck: sopData.qualityCheck,
        lowConfidenceSections: sopData.lowConfidenceSections,
        assumptions: sopData.assumptions,
      });

      // Update session status to completed
      await storage.updateObservationSession(session.id, {
        status: "completed",
      });

      res.json(sop);
    } catch (error) {
      console.error("Generate SOP error:", error);
      res.status(500).json({ error: "Failed to generate SOP" });
    }
  });

  // SOP CRUD
  app.post("/api/sops", async (req, res) => {
    try {
      const sop = await storage.createSop(req.body);
      res.json(sop);
    } catch (error) {
      console.error("Create SOP error:", error);
      res.status(500).json({ error: "Failed to create SOP" });
    }
  });

  app.get("/api/sops", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const sops = await storage.listSops(status);
      res.json(sops);
    } catch (error) {
      res.status(500).json({ error: "Failed to list SOPs" });
    }
  });

  app.get("/api/sops/:id", async (req, res) => {
    try {
      const sop = await storage.getSop(req.params.id);
      if (!sop) {
        res.status(404).json({ error: "SOP not found" });
        return;
      }
      res.json(sop);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch SOP" });
    }
  });

  app.patch("/api/sops/:id", async (req, res) => {
    try {
      const sop = await storage.updateSop(req.params.id, req.body);
      if (!sop) {
        res.status(404).json({ error: "SOP not found" });
        return;
      }
      res.json(sop);
    } catch (error) {
      res.status(500).json({ error: "Failed to update SOP" });
    }
  });

  // SOP version history
  app.get("/api/sops/:id/versions", async (req, res) => {
    try {
      const versions = await storage.getSopVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch SOP versions" });
    }
  });

  app.post("/api/sops/:id/versions", async (req, res) => {
    try {
      const version = await storage.createSopVersion({
        ...req.body,
        sopId: req.params.id,
      });
      res.json(version);
    } catch (error) {
      console.error("Create SOP version error:", error);
      res.status(500).json({ error: "Failed to create SOP version" });
    }
  });

  // Get SOPs by meeting ID
  app.get("/api/meetings/:meetingId/sops", async (req, res) => {
    try {
      const sops = await storage.getSopsByMeeting(req.params.meetingId);
      res.json(sops);
    } catch (error) {
      console.error("Get SOPs by meeting error:", error);
      res.status(500).json({ error: "Failed to fetch SOPs" });
    }
  });

  // ===============================================
  // EVA Meeting Assistant API Routes
  // ===============================================

  // Get meeting agenda
  app.get("/api/eva/meetings/:meetingId/agenda", async (req, res) => {
    try {
      const agenda = await storage.getMeetingAgenda(req.params.meetingId);
      res.json(agenda || { meetingId: req.params.meetingId, items: [] });
    } catch (error) {
      console.error("Get meeting agenda error:", error);
      res.status(500).json({ error: "Failed to fetch agenda" });
    }
  });

  // Create/Update meeting agenda (supports rich text content)
  const agendaContentSchema = z.object({
    content: z.string().optional(),
    items: z.array(z.object({
      id: z.string(),
      title: z.string(),
      covered: z.boolean().default(false),
      order: z.number(),
    })).optional(),
  });

  app.post("/api/eva/meetings/:meetingId/agenda", async (req, res) => {
    try {
      const { content, items } = agendaContentSchema.parse(req.body);
      const existing = await storage.getMeetingAgenda(req.params.meetingId);
      
      if (existing) {
        const updatedItems = items !== undefined ? items : (existing.items as any[]);
        const updated = await storage.updateMeetingAgenda(req.params.meetingId, updatedItems, content);
        res.json(updated);
      } else {
        const created = await storage.createMeetingAgenda({
          meetingId: req.params.meetingId,
          items: items || [],
          content,
        });
        res.json(created);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("Update meeting agenda error:", error);
        res.status(500).json({ error: "Failed to update agenda" });
      }
    }
  });

  // Get meeting notes
  app.get("/api/eva/meetings/:meetingId/notes", async (req, res) => {
    try {
      const notes = await storage.getMeetingNotes(req.params.meetingId);
      res.json(notes);
    } catch (error) {
      console.error("Get meeting notes error:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create meeting note
  app.post("/api/eva/meetings/:meetingId/notes", async (req, res) => {
    try {
      const noteData = insertMeetingNoteSchema.parse({
        ...req.body,
        meetingId: req.params.meetingId,
      });
      const note = await storage.createMeetingNote(noteData);
      res.json(note);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("Create meeting note error:", error);
        res.status(500).json({ error: "Failed to create note" });
      }
    }
  });

  // Delete meeting note
  app.delete("/api/eva/notes/:noteId", async (req, res) => {
    try {
      const deleted = await storage.deleteMeetingNote(req.params.noteId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Delete meeting note error:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Get meeting files
  app.get("/api/eva/meetings/:meetingId/files", async (req, res) => {
    try {
      const files = await storage.getMeetingFiles(req.params.meetingId);
      res.json(files);
    } catch (error) {
      console.error("Get meeting files error:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Upload meeting file (text content extraction)
  app.post("/api/eva/meetings/:meetingId/files", async (req, res) => {
    try {
      const fileData = insertMeetingFileSchema.parse({
        ...req.body,
        meetingId: req.params.meetingId,
      });
      const file = await storage.createMeetingFile(fileData);
      res.json(file);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        console.error("Upload meeting file error:", error);
        res.status(500).json({ error: "Failed to upload file" });
      }
    }
  });

  // Delete meeting file
  app.delete("/api/eva/files/:fileId", async (req, res) => {
    try {
      const deleted = await storage.deleteMeetingFile(req.params.fileId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Delete meeting file error:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Get meeting summary
  app.get("/api/eva/meetings/:meetingId/summary", async (req, res) => {
    try {
      const summary = await storage.getMeetingSummary(req.params.meetingId);
      res.json(summary || null);
    } catch (error) {
      console.error("Get meeting summary error:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // Generate meeting summary
  app.post("/api/eva/meetings/:meetingId/summary", async (req, res) => {
    try {
      const meetingId = req.params.meetingId;
      const meeting = await storage.getMeeting(meetingId);
      
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }

      // Get all meeting data for context
      const agenda = await storage.getMeetingAgenda(meetingId);
      const notes = await storage.getMeetingNotes(meetingId);
      const transcripts = await storage.getTranscriptsByMeeting(meetingId);
      const chatMessages = await storage.getChatMessagesByMeeting(meetingId);

      // Build context for summary generation
      let context = `Meeting: ${meeting.title}\n\n`;
      
      if (agenda && Array.isArray(agenda.items)) {
        context += "Agenda Items:\n";
        (agenda.items as any[]).forEach((item: any, i: number) => {
          context += `${i + 1}. ${item.title} - ${item.covered ? "Covered" : "Not covered"}\n`;
        });
        context += "\n";
      }

      if (notes.length > 0) {
        context += "Meeting Notes:\n";
        notes.forEach(note => {
          context += `- ${note.content}${note.isImportant ? " [IMPORTANT]" : ""}\n`;
        });
        context += "\n";
      }

      if (transcripts.length > 0) {
        context += "Discussion Transcript:\n";
        transcripts.forEach(t => {
          context += `${t.speaker}: ${t.text}\n`;
        });
        context += "\n";
      }

      // Generate summary using Gemini
      const summaryPrompt = `Based on the following meeting information, generate a comprehensive meeting summary.

${context}

Please provide:
1. Purpose - A brief statement of the meeting's main objective
2. Key Topics - List the main topics discussed
3. Decisions Made - List any decisions that were made
4. Open Questions - List any unresolved questions or items
5. Missed Agenda Items - List any agenda items that were not covered
6. Full Summary - A concise paragraph summarizing the entire meeting

Format the response as JSON with these fields:
{
  "purpose": "...",
  "keyTopics": ["...", "..."],
  "decisions": ["...", "..."],
  "openQuestions": ["...", "..."],
  "missedAgendaItems": ["...", "..."],
  "fullSummary": "..."
}`;

      const geminiResponse = await analyzeChat(summaryPrompt, "", false);
      
      let summaryData;
      try {
        // Try to parse the JSON from the response
        const jsonMatch = geminiResponse.message.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          summaryData = JSON.parse(jsonMatch[0]);
        } else {
          summaryData = {
            purpose: "Meeting summary generated",
            keyTopics: [],
            decisions: [],
            openQuestions: [],
            missedAgendaItems: [],
            fullSummary: geminiResponse.message,
          };
        }
      } catch (e) {
        summaryData = {
          purpose: "Meeting summary",
          keyTopics: [],
          decisions: [],
          openQuestions: [],
          missedAgendaItems: [],
          fullSummary: geminiResponse.message,
        };
      }

      // Check if summary already exists
      const existingSummary = await storage.getMeetingSummary(meetingId);
      
      if (existingSummary) {
        const updated = await storage.updateMeetingSummary(meetingId, summaryData);
        res.json(updated);
      } else {
        const created = await storage.createMeetingSummary({
          meetingId,
          ...summaryData,
        });
        res.json(created);
      }
    } catch (error: any) {
      console.error("Generate meeting summary error:", error);
      res.status(500).json({ error: error.message || "Failed to generate summary" });
    }
  });

  // ElevenLabs Text-to-Speech
  app.post("/api/eva/tts", async (req, res) => {
    try {
      const { text, voiceId } = req.body;
      if (!text) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const audioBuffer = await textToSpeech(text, voiceId);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length,
      });
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("TTS error:", error);
      res.status(500).json({ error: error.message || "Failed to generate speech" });
    }
  });

  // Stream TTS
  app.post("/api/eva/tts/stream", async (req, res) => {
    try {
      const { text, voiceId } = req.body;
      if (!text) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const stream = await textToSpeechStream(text, voiceId);
      res.set({
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      });
      
      const reader = stream.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      pump();
    } catch (error: any) {
      console.error("TTS stream error:", error);
      res.status(500).json({ error: error.message || "Failed to stream speech" });
    }
  });

  // Get available voices
  app.get("/api/eva/voices", async (req, res) => {
    try {
      const voices = await getVoices();
      res.json(voices);
    } catch (error: any) {
      console.error("Get voices error:", error);
      res.status(500).json({ error: error.message || "Failed to get voices" });
    }
  });

  // ElevenLabs Conversational AI - get signed URL for WebSocket connection
  app.get("/api/elevenlabs/signed-url", async (req, res) => {
    try {
      const agentId = process.env.ELEVENLABS_AGENT_ID;
      
      if (!agentId) {
        res.status(400).json({ 
          error: 'ElevenLabs Agent ID not configured',
          hint: 'Set ELEVENLABS_AGENT_ID environment variable'
        });
        return;
      }

      const { getConversationalAgentSignedUrl } = await import('./elevenlabs');
      const signedUrl = await getConversationalAgentSignedUrl(agentId);
      res.json({ signedUrl });
    } catch (error: any) {
      console.error("Failed to get signed URL:", error);
      res.status(500).json({ error: error.message || "Failed to get signed URL" });
    }
  });

  // Speech-to-Text endpoint using ElevenLabs (with increased body limit for audio)
  app.post("/api/eva/stt", express.json({ limit: '10mb' }), async (req, res) => {
    try {
      const { audio, language = 'en', mimeType = 'audio/webm' } = req.body;
      if (!audio) {
        res.status(400).json({ error: "Audio data is required" });
        return;
      }

      // Decode base64 audio
      const audioBuffer = Buffer.from(audio, 'base64');
      const { speechToText } = await import('./elevenlabs');
      const result = await speechToText(audioBuffer, language, mimeType);
      res.json(result);
    } catch (error: any) {
      console.error("STT error:", error);
      res.status(500).json({ error: error.message || "Failed to transcribe speech" });
    }
  });

  // Ask EVA - AI chat endpoint
  app.post("/api/eva/ask", async (req, res) => {
    try {
      const { meetingId, question, context, sopContent } = req.body;
      if (!question) {
        res.status(400).json({ error: "Question is required" });
        return;
      }

      // Get meeting context
      const meeting = meetingId ? await storage.getMeeting(meetingId) : null;
      const agenda = meetingId ? await storage.getMeetingAgenda(meetingId) : null;
      const notes = meetingId ? await storage.getMeetingNotes(meetingId) : [];
      const files = meetingId ? await storage.getMeetingFiles(meetingId) : [];
      const transcripts = meetingId ? await storage.getTranscriptsByMeeting(meetingId) : [];
      const scrumActionItemsList = meetingId ? await storage.getScrumActionItemsByMeeting(meetingId) : [];
      const currentScrumSummary = meetingId ? await storage.getMeetingSummary(meetingId) : undefined;
      const scrumSummaries = (meetingId && meeting?.createdBy)
        ? await storage.getPreviousScrumSummaries(meetingId, meeting.createdBy, 5)
        : [];

      // Build context for AI
      let fullContext = "";
      
      if (meeting) {
        fullContext += `Meeting: ${meeting.title}\n`;
        fullContext += `Status: ${meeting.status}\n\n`;
      }
      
      if (agenda && Array.isArray(agenda.items)) {
        fullContext += "Agenda Items:\n";
        (agenda.items as any[]).forEach((item: any, i: number) => {
          fullContext += `${i + 1}. ${item.title} (${item.covered ? "Covered" : "Not covered"})\n`;
        });
        fullContext += "\n";
      }
      
      if (notes.length > 0) {
        fullContext += "Notes:\n";
        notes.forEach(note => {
          fullContext += `- ${note.content}${note.speaker ? ` (${note.speaker})` : ""}\n`;
        });
        fullContext += "\n";
      }

      if (files.length > 0) {
        fullContext += "Uploaded Documents:\n";
        files.forEach(file => {
          fullContext += `- ${file.originalName}\n`;
          if (file.content) {
            fullContext += `  Content: ${file.content.substring(0, 500)}...\n`;
          }
        });
        fullContext += "\n";
      }

      if (transcripts.length > 0) {
        fullContext += "Recent Transcript:\n";
        const recentTranscripts = transcripts.slice(-20);
        recentTranscripts.forEach(t => {
          fullContext += `${t.speaker}: ${t.text}\n`;
        });
        fullContext += "\n";
      }

      const allScrumSummaries = currentScrumSummary
        ? [currentScrumSummary, ...scrumSummaries.filter(s => s.id !== currentScrumSummary.id)]
        : scrumSummaries;

      if (scrumActionItemsList.length > 0 || allScrumSummaries.length > 0) {
        fullContext += "=== SCRUM BOARD DATA ===\n\n";

        const safeDate = (val: any): string => {
          if (!val) return "unknown";
          const d = new Date(val);
          return isNaN(d.getTime()) ? "unknown" : d.toLocaleDateString();
        };

        const allActionItems: typeof scrumActionItemsList = [...scrumActionItemsList];
        for (const s of allScrumSummaries) {
          if (s.meetingId && s.meetingId !== meetingId) {
            const items = await storage.getScrumActionItemsByMeeting(s.meetingId);
            allActionItems.push(...items);
          }
        }
        const seenIds = new Set<string>();
        const uniqueActionItems = allActionItems.filter(a => {
          if (seenIds.has(a.id)) return false;
          seenIds.add(a.id);
          return true;
        });
        const openItems = uniqueActionItems.filter(a => a.status !== "done");
        const doneItems = uniqueActionItems.filter(a => a.status === "done");

        const carryOverBlockers: Array<{ description: string; owner: string; severity: string; status: string; firstSeen: string | null; meetingTitle: string }> = [];
        const personStatusMap: Record<string, { name: string; lastWorkingOn: string[]; lastCompleted: string[]; currentBlockers: string[]; lastSeen: string | null; meetingTitle: string }> = {};
        const discussionHistory: Array<{ date: string | null; meetingTitle: string; summary: string }> = [];

        for (const s of allScrumSummaries) {
          const scrumData = s.scrumData as any;
          const mtg = s.meetingId ? await storage.getMeeting(s.meetingId) : null;
          const meetingTitle = mtg?.title || "Standup";
          const dateStr = s.createdAt ? new Date(s.createdAt).toISOString() : null;

          if (s.fullSummary) {
            discussionHistory.push({ date: dateStr, meetingTitle, summary: s.fullSummary });
          }

          if (scrumData?.blockers?.length > 0) {
            for (const b of scrumData.blockers) {
              if (b.status === "active") {
                const existing = carryOverBlockers.find(
                  eb => eb.description.toLowerCase() === b.description.toLowerCase() && eb.owner === b.owner
                );
                if (existing) {
                  if (dateStr && (!existing.firstSeen || new Date(dateStr) < new Date(existing.firstSeen))) {
                    existing.firstSeen = dateStr;
                  }
                } else {
                  carryOverBlockers.push({
                    description: b.description,
                    owner: b.owner,
                    severity: b.severity || "medium",
                    status: b.status,
                    firstSeen: dateStr,
                    meetingTitle,
                  });
                }
              }
            }
          }

          if (scrumData?.participants?.length > 0) {
            for (const p of scrumData.participants) {
              if (!personStatusMap[p.name]) {
                personStatusMap[p.name] = {
                  name: p.name,
                  lastWorkingOn: p.today || [],
                  lastCompleted: p.yesterday || [],
                  currentBlockers: p.blockers || [],
                  lastSeen: dateStr,
                  meetingTitle,
                };
              }
            }
          }
        }

        if (allScrumSummaries.length > 0) {
          fullContext += `Total Standups: ${allScrumSummaries.length} | Last Standup: ${safeDate(allScrumSummaries[0]?.createdAt)}\n\n`;
        }

        if (carryOverBlockers.length > 0) {
          fullContext += `CARRY-OVER BLOCKERS (${carryOverBlockers.length} active):\n`;
          carryOverBlockers.forEach(b => {
            const firstSeenStr = b.firstSeen ? `, first seen: ${safeDate(b.firstSeen)}` : "";
            fullContext += `- [${b.severity.toUpperCase()}] ${b.description} (Owner: ${b.owner}, from: ${b.meetingTitle}${firstSeenStr})\n`;
          });
          fullContext += "\n";
        }

        if (openItems.length > 0) {
          fullContext += `ACTION ITEMS - OPEN/IN PROGRESS (${openItems.length}):\n`;
          openItems.forEach(item => {
            const dueStr = item.dueDate ? ` Due: ${safeDate(item.dueDate)}` : "";
            fullContext += `- [${item.status.toUpperCase()}] ${item.title}${item.assignee ? ` (Assigned: ${item.assignee})` : ""}${item.priority ? ` Priority: ${item.priority}` : ""}${dueStr}${item.notes ? ` - ${item.notes}` : ""}\n`;
          });
          fullContext += "\n";
        }

        if (doneItems.length > 0) {
          fullContext += `COMPLETED ITEMS (${doneItems.length}):\n`;
          doneItems.forEach(item => {
            fullContext += `- [DONE] ${item.title}${item.assignee ? ` (${item.assignee})` : ""}\n`;
          });
          fullContext += "\n";
        }

        const teamMembers = Object.values(personStatusMap);
        if (teamMembers.length > 0) {
          fullContext += `TEAM STATUS (${teamMembers.length} members):\n`;
          teamMembers.forEach(m => {
            fullContext += `  ${m.name} (last seen: ${safeDate(m.lastSeen)}, meeting: ${m.meetingTitle}):\n`;
            if (m.lastWorkingOn.length) fullContext += `    Working on: ${m.lastWorkingOn.join("; ")}\n`;
            if (m.lastCompleted.length) fullContext += `    Completed: ${m.lastCompleted.join("; ")}\n`;
            if (m.currentBlockers.length) fullContext += `    Blockers: ${m.currentBlockers.join("; ")}\n`;
          });
          fullContext += "\n";
        }

        if (discussionHistory.length > 0) {
          fullContext += `DISCUSSION HISTORY (${discussionHistory.length} sessions):\n`;
          discussionHistory.forEach(d => {
            fullContext += `\n--- ${d.meetingTitle} (${safeDate(d.date)}) ---\n${d.summary}\n`;
          });
          fullContext += "\n";
        }

        fullContext += "=== END SCRUM BOARD DATA ===\n\n";
        fullContext += "Note: You have direct access to the scrum board data above. You can answer questions about action items, blockers, team status, and standup history without needing to see the screen.\n\n";
      }

      if (context) {
        fullContext += `Additional Context: ${context}\n`;
      }

      // Include current SOP document if available
      if (sopContent && sopContent.trim() && !sopContent.includes("Waiting for screen observations")) {
        fullContext += "\n=== CURRENT SOP DOCUMENT (Generated from Screen Observer) ===\n";
        fullContext += sopContent;
        fullContext += "\n=== END SOP DOCUMENT ===\n\n";
        fullContext += "Note: The user may ask questions about this SOP document. You have full access to its content.\n";
      }

      // Use Gemini to generate response
      const geminiResponse = await analyzeChat(question, fullContext, false);
      const responseText = geminiResponse.message;
      
      // Store the chat message
      if (meetingId) {
        await storage.createChatMessage({
          meetingId,
          role: "user",
          content: question,
        });
        await storage.createChatMessage({
          meetingId,
          role: "ai",
          content: responseText,
        });
      }

      res.json({ response: responseText, context: fullContext.substring(0, 500) });
    } catch (error: any) {
      console.error("Ask EVA error:", error);
      res.status(500).json({ error: error.message || "Failed to get response" });
    }
  });

  // EVA Settings
  app.get("/api/eva/settings/:userId", async (req, res) => {
    try {
      const settings = await storage.getEvaSettings(req.params.userId);
      res.json(settings || {
        voiceEnabled: true,
        voiceId: "Rachel",
        wakeWordEnabled: true,
        autoSummary: true,
      });
    } catch (error) {
      console.error("Get EVA settings error:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/eva/settings/:userId", async (req, res) => {
    try {
      const existing = await storage.getEvaSettings(req.params.userId);
      
      if (existing) {
        const updated = await storage.updateEvaSettings(req.params.userId, req.body);
        res.json(updated);
      } else {
        const created = await storage.createEvaSettings({
          userId: req.params.userId,
          ...req.body,
        });
        res.json(created);
      }
    } catch (error) {
      console.error("Update EVA settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ============================================================
  // Scrum Master API Routes
  // ============================================================

  app.get("/api/scrum-master/sessions/:meetingId", async (req: Request, res: Response) => {
    try {
      const session = await storage.getScrumMasterSessionByMeeting(req.params.meetingId);
      if (!session) {
        return res.status(404).json({ error: "No active scrum master session" });
      }
      res.json(session);
    } catch (error) {
      console.error("Get scrum master session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.get("/api/scrum-master/sessions/:meetingId/interventions", async (req: Request, res: Response) => {
    try {
      const session = await storage.getScrumMasterSessionByMeeting(req.params.meetingId);
      if (!session) {
        return res.json([]);
      }
      const interventions = await storage.getScrumMasterInterventionsBySession(session.id);
      res.json(interventions);
    } catch (error) {
      console.error("Get interventions error:", error);
      res.status(500).json({ error: "Failed to get interventions" });
    }
  });

  app.get("/api/scrum-master/sessions/:meetingId/blockers", async (req: Request, res: Response) => {
    try {
      const blockers = await storage.getScrumMasterBlockersByMeeting(req.params.meetingId);
      res.json(blockers);
    } catch (error) {
      console.error("Get blockers error:", error);
      res.status(500).json({ error: "Failed to get blockers" });
    }
  });

  app.get("/api/scrum-master/sessions/:meetingId/actions", async (req: Request, res: Response) => {
    try {
      const actions = await storage.getScrumMasterActionsByMeeting(req.params.meetingId);
      res.json(actions);
    } catch (error) {
      console.error("Get actions error:", error);
      res.status(500).json({ error: "Failed to get actions" });
    }
  });

  const updateBlockerSchema = z.object({
    status: z.enum(["open", "resolved", "escalated", "wont_fix"]).optional(),
    severity: z.enum(["critical", "high", "medium", "noise"]).optional(),
    owner: z.string().min(1).optional(),
    resolution: z.string().optional(),
  });

  app.patch("/api/scrum-master/blockers/:id", async (req: Request, res: Response) => {
    try {
      const parsed = updateBlockerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const updated = await storage.updateScrumMasterBlocker(req.params.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Blocker not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update blocker error:", error);
      res.status(500).json({ error: "Failed to update blocker" });
    }
  });

  const updateActionSchema = z.object({
    status: z.enum(["open", "done", "overdue", "cancelled"]).optional(),
    owner: z.string().min(1).optional(),
    deadline: z.string().optional(),
    description: z.string().min(1).optional(),
  });

  app.patch("/api/scrum-master/actions/:id", async (req: Request, res: Response) => {
    try {
      const parsed = updateActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const updated = await storage.updateScrumMasterAction(req.params.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Action not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update action error:", error);
      res.status(500).json({ error: "Failed to update action" });
    }
  });

  app.get("/api/scrum-master/history", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const sessions = await storage.getScrumMasterSessionsByCreator(userId, 20);
      res.json(sessions);
    } catch (error) {
      console.error("Get session history error:", error);
      res.status(500).json({ error: "Failed to get history" });
    }
  });

  return httpServer;
}

// Process transcription in background
async function processTranscription(
  transcriptionId: string,
  downloadUrl: string,
  roomName?: string,
  meetingId?: string
): Promise<void> {
  try {
    console.log(`Downloading transcription from: ${downloadUrl}`);
    
    // Download the transcription file
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download transcription: ${response.status}`);
    }
    
    const rawTranscript = await response.text();
    console.log(`Downloaded transcription: ${rawTranscript.length} characters`);

    // Parse the transcription (JaaS transcriptions are typically in SRT or VTT format)
    const parsedTranscript = parseTranscription(rawTranscript);

    // Get meeting title for context
    let meetingTitle = roomName || "Meeting";
    
    // Get the transcription agent's prompt if available
    let customPrompt: string | undefined;
    if (meetingId) {
      const meeting = await storage.getMeeting(meetingId);
      if (meeting?.selectedAgents && meeting.selectedAgents.length > 0) {
        const agentsWithPrompts = await storage.listAgentsWithPrompts();
        const transcriptionAgent = agentsWithPrompts.find(
          a => a.type === "transcription" && meeting.selectedAgents?.includes(a.id)
        );
        if (transcriptionAgent?.prompt?.content) {
          customPrompt = transcriptionAgent.prompt.content;
        }
      }
    }
    
    // Analyze with Gemini using custom prompt if available
    const analysis = await analyzeTranscription(rawTranscript, meetingTitle, customPrompt);
    
    console.log(`Transcription analyzed: ${analysis.actionItems.length} action items found`);

    // Update the transcription record with all data
    await storage.updateMeetingTranscription(transcriptionId, {
      rawTranscript,
      parsedTranscript,
      aiSummary: analysis.summary,
      actionItems: analysis.actionItems,
    });

    console.log(`Transcription ${transcriptionId} processed successfully`);
  } catch (error) {
    console.error(`Error processing transcription ${transcriptionId}:`, error);
  }
}

// Parse SRT/VTT transcription format
function parseTranscription(rawText: string): { speaker: string; text: string; timestamp: string }[] {
  const segments: { speaker: string; text: string; timestamp: string }[] = [];
  
  // Try to parse as SRT format (common for JaaS)
  const srtRegex = /(\d+)\s*\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\s*\n([\s\S]*?)(?=\n\n|\n*$)/g;
  let match;
  
  while ((match = srtRegex.exec(rawText)) !== null) {
    const text = match[4].trim();
    const timestamp = match[2];
    
    // Try to extract speaker from text (format: "Speaker: text")
    const speakerMatch = text.match(/^([^:]+):\s*(.*)$/);
    if (speakerMatch) {
      segments.push({
        speaker: speakerMatch[1].trim(),
        text: speakerMatch[2].trim(),
        timestamp,
      });
    } else {
      segments.push({
        speaker: "Unknown",
        text,
        timestamp,
      });
    }
  }

  // If no SRT matches, try VTT or plain text
  if (segments.length === 0) {
    const lines = rawText.split("\n").filter(l => l.trim() && !l.startsWith("WEBVTT") && !l.match(/^\d{2}:\d{2}/));
    for (const line of lines) {
      if (line.trim()) {
        segments.push({
          speaker: "Participant",
          text: line.trim(),
          timestamp: "",
        });
      }
    }
  }

  return segments;
}

// Helper function to format time as MM:SS from a Date object
function formatTimestamp(date: Date, startTime?: Date): string {
  if (startTime) {
    const diffMs = date.getTime() - startTime.getTime();
    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Helper function to attempt fallback to live transcripts when video transcription fails
async function attemptLiveTranscriptFallback(
  recordingId: string,
  meetingId: string,
  meetingTitle: string
): Promise<boolean> {
  const liveTranscripts = await storage.getTranscriptsByMeeting(meetingId);
  
  // Filter to non-empty, final segments only
  const validSegments = liveTranscripts.filter(s => s.text && s.text.trim().length > 0);
  
  if (validSegments.length === 0) {
    console.log(`No valid live transcript segments found for meeting ${meetingId}`);
    return false;
  }
  
  console.log(`Found ${validSegments.length} valid live transcript segments for fallback`);
  
  // Format live transcripts into text for AI analysis
  const transcriptText = validSegments
    .map(segment => `${segment.speaker}: ${segment.text}`)
    .join('\n');
  
  // Generate summary from live transcripts
  const analysis = await analyzeTranscription(transcriptText, meetingTitle);
  
  if (!analysis.summary || analysis.summary === "Error analyzing transcription.") {
    console.log(`Failed to generate summary from live transcripts`);
    return false;
  }
  
  console.log(`Successfully generated summary from live transcripts`);
  
  // Also generate SOP document from the transcripts
  console.log(`Generating SOP document from live transcripts...`);
  const sopContent = await generateSOPFromTranscript(transcriptText, meetingTitle);
  
  if (sopContent) {
    console.log(`Successfully generated SOP document (${sopContent.length} chars)`);
  } else {
    console.log(`No SOP content generated`);
  }
  
  // Generate flowchart from the SOP content
  let flowchartCode: string | undefined;
  if (sopContent) {
    console.log(`Generating flowchart from SOP content...`);
    flowchartCode = await generateMermaidFlowchart(sopContent);
    if (flowchartCode) {
      console.log(`Successfully generated flowchart (${flowchartCode.length} chars)`);
    }
  }
  
  // Get the earliest timestamp as reference for relative timestamps
  const startTime = validSegments.length > 0 ? new Date(validSegments[0].createdAt) : undefined;
  
  // Format segments to match expected structure: { speaker, timestamp: "MM:SS", text }
  const parsedSegments = validSegments.map(s => ({
    speaker: s.speaker,
    timestamp: formatTimestamp(new Date(s.createdAt), startTime),
    text: s.text
  }));
  
  // Update the recording with the analysis, SOP, and flowchart
  await storage.updateRecording(recordingId, {
    summary: analysis.summary,
    sopContent: sopContent || undefined,
    flowchartCode: flowchartCode || undefined,
  });
  
  // Store the analysis in meeting_transcriptions table
  await storage.createMeetingTranscription({
    meetingId,
    sessionId: recordingId,
    fqn: `recording-${recordingId}`,
    rawTranscript: transcriptText,
    parsedTranscript: parsedSegments,
    aiSummary: analysis.summary,
    actionItems: analysis.actionItems,
  });
  
  console.log(`Recording ${recordingId} processed successfully using live transcript fallback`);
  return true;
}

// Process recording transcription using AI
async function processRecordingTranscription(
  recordingId: string,
  videoUrl: string,
  meetingId: string,
  meetingTitle: string
): Promise<void> {
  try {
    console.log(`Starting AI transcription for recording ${recordingId}`);
    console.log(`Video URL: ${videoUrl.substring(0, 100)}...`);
    
    // Clear existing AI transcriptions for THIS RECORDING only (scoped idempotency)
    // Uses recordingId as sessionId to only delete transcripts for this specific recording
    const deletedTranscriptions = await storage.deleteTranscriptionBySessionId(recordingId);
    console.log(`Cleared ${deletedTranscriptions} existing AI transcription for recording ${recordingId}`);
    
    // Transcribe the recording using Gemini
    const transcription = await transcribeRecording(videoUrl, meetingTitle);
    
    if (!transcription.fullTranscript && transcription.segments.length === 0) {
      console.log(`Video transcription returned empty for recording ${recordingId}, attempting fallback to live transcripts...`);
      
      // Attempt fallback to live transcripts
      const fallbackSucceeded = await attemptLiveTranscriptFallback(recordingId, meetingId, meetingTitle);
      
      if (!fallbackSucceeded) {
        console.error(`No fallback transcripts available for recording ${recordingId}`);
        await storage.updateRecording(recordingId, {
          summary: "Transcription failed - no audio detected or unable to process video.",
        });
      }
      return;
    }
    
    console.log(`Transcription complete: ${transcription.segments.length} segments found`);
    console.log(`Summary: ${transcription.summary.substring(0, 100)}...`);
    
    // Generate SOP document from the transcript
    console.log(`Generating SOP document from transcript...`);
    const sopContent = await generateSOPFromTranscript(transcription.fullTranscript, meetingTitle);
    
    if (sopContent) {
      console.log(`Successfully generated SOP document (${sopContent.length} chars)`);
    } else {
      console.log(`No SOP content generated`);
    }
    
    // Generate flowchart from the SOP content
    let flowchartCode: string | undefined;
    if (sopContent) {
      console.log(`Generating flowchart from SOP content...`);
      flowchartCode = await generateMermaidFlowchart(sopContent);
      if (flowchartCode) {
        console.log(`Successfully generated flowchart (${flowchartCode.length} chars)`);
      }
    }
    
    // Update the recording with the transcription data, SOP, and flowchart
    await storage.updateRecording(recordingId, {
      summary: transcription.summary,
      sopContent: sopContent || undefined,
      flowchartCode: flowchartCode || undefined,
    });

    // Store transcript in the meeting_transcriptions table
    // Note: We do NOT add to transcript_segments to avoid mixing with live browser transcripts
    await storage.createMeetingTranscription({
      meetingId,
      sessionId: recordingId,
      fqn: `recording-${recordingId}`,
      rawTranscript: transcription.fullTranscript,
      parsedTranscript: transcription.segments,
      aiSummary: transcription.summary,
      actionItems: transcription.actionItems,
    });

    console.log(`Recording ${recordingId} transcription processed successfully`);
  } catch (error) {
    console.error(`Error processing recording transcription ${recordingId}:`, error);
    
    // Attempt fallback to live transcripts on error
    try {
      console.log(`Attempting fallback to live transcripts after video transcription error...`);
      const fallbackSucceeded = await attemptLiveTranscriptFallback(recordingId, meetingId, meetingTitle);
      
      if (!fallbackSucceeded) {
        await storage.updateRecording(recordingId, {
          summary: "Transcription failed - an error occurred during processing.",
        });
      }
    } catch (fallbackError) {
      console.error(`Fallback also failed for recording ${recordingId}:`, fallbackError);
      try {
        await storage.updateRecording(recordingId, {
          summary: "Transcription failed - an error occurred during processing.",
        });
      } catch (updateError) {
        console.error(`Failed to update recording with error status:`, updateError);
      }
    }
  }
}
