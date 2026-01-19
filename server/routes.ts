import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMeetingSchema, insertRecordingSchema, insertChatMessageSchema, insertTranscriptSegmentSchema, insertUserSchema, updateUserSchema, insertPromptSchema, updatePromptSchema, insertAgentSchema, updateAgentSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { analyzeChat, analyzeTranscription, generateMermaidFlowchart } from "./gemini";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

// API Key authentication middleware for external API
function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = process.env.EXTERNAL_API_KEY;
  
  // If no API key is configured, allow all requests (development mode)
  if (!apiKey) {
    next();
    return;
  }
  
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use 'Bearer <API_KEY>'" });
    return;
  }
  
  const providedKey = authHeader.substring(7);
  if (providedKey !== apiKey) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }
  
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
  
  // External API - Create meeting endpoint for other systems
  const externalCreateMeetingSchema = z.object({
    title: z.string().optional(),
    scheduledDate: z.string().datetime().optional(),
  });

  app.post("/api/external/create-meeting", validateApiKey, async (req, res) => {
    try {
      const validated = externalCreateMeetingSchema.parse(req.body);
      
      const roomId = generateRoomId();
      const title = validated.title || `Meeting ${roomId}`;
      
      // Create the meeting
      const meeting = await storage.createMeeting({
        title,
        roomId,
        status: validated.scheduledDate ? "scheduled" : "live",
        scheduledDate: validated.scheduledDate ? new Date(validated.scheduledDate) : new Date(),
      });
      
      // Build the full meeting link
      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
      const meetingLink = `${protocol}://${host}/meeting/${roomId}`;
      
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
      
      // Auto-create meeting if it doesn't exist (for ad-hoc meetings)
      if (!meeting) {
        meeting = await storage.createMeeting({
          title: `Meeting ${req.params.roomId}`,
          roomId: req.params.roomId,
          status: "live",
          scheduledDate: new Date(),
        });
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
      const validated = insertTranscriptSegmentSchema.parse({
        ...req.body,
        meetingId: req.params.meetingId,
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

      // Save user message
      await storage.createChatMessage({
        meetingId,
        role: "user",
        content: message,
      });

      // Get AI response from Gemini
      const aiResponse = await analyzeChat(message, meetingContext, isScreenSharing);

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
      const { sopContent } = req.body;
      
      if (!sopContent || typeof sopContent !== 'string') {
        res.status(400).json({ error: "sopContent is required" });
        return;
      }

      const mermaidCode = await generateMermaidFlowchart(sopContent);
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

      // Get all chat messages for summary
      const messages = await storage.getChatMessagesByMeeting(meetingId);
      
      // Generate simple summary (no AI call to keep it fast)
      let summary = "Meeting ended (auto-saved).";
      if (messages.length > 0) {
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
      const { sopContent, duration } = req.body;

      // Get meeting
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }

      // Get all chat messages for summary
      const messages = await storage.getChatMessagesByMeeting(meetingId);
      
      // Generate AI summary of the meeting
      let summary = "Meeting ended without discussion.";
      if (messages.length > 0) {
        const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join("\n");
        const summaryResponse = await analyzeChat(
          `Summarize this meeting in 2-3 sentences. Focus on key decisions and action items:\n\n${chatHistory.slice(0, 4000)}`,
          `Meeting: ${meeting.title}`,
          false
        );
        summary = summaryResponse.message;
      }

      // Update meeting status to completed
      await storage.updateMeeting(meetingId, { status: "completed" });

      // Create recording
      const recording = await storage.createRecording({
        meetingId,
        title: meeting.title,
        duration: duration || "00:00",
        summary,
        sopContent: sopContent || null,
      });

      res.json({ recording, summary });
    } catch (error) {
      console.error("End meeting error:", error);
      res.status(500).json({ error: "Failed to end meeting" });
    }
  });

  // JaaS JWT Token Generation
  app.post("/api/jaas/token", async (req, res) => {
    try {
      const { roomName, userName, userEmail, userAvatar } = req.body;

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
              moderator: "true",
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

      res.json({ token, appId });
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
      const roomName = fqn?.split("/")[1];

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
            const meeting = await storage.getMeetingByRoomId(roomName);
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
          console.log(`Recording uploaded, URL: ${data?.preAuthenticatedLink}`);
          
          // Find associated meeting and update recording with video URL
          if (roomName && data?.preAuthenticatedLink) {
            const meeting = await storage.getMeetingByRoomId(roomName);
            if (meeting) {
              // Find existing recording for this meeting
              const recordings = await storage.getRecordingsByMeeting(meeting.id);
              const existingRecording = recordings[0];
              
              if (existingRecording) {
                // Update existing recording with video URL
                await storage.updateRecording(existingRecording.id, {
                  videoUrl: data.preAuthenticatedLink
                });
                console.log(`Updated recording ${existingRecording.id} with video URL`);
              } else {
                // Create new recording with video URL
                await storage.createRecording({
                  meetingId: meeting.id,
                  title: meeting.title,
                  duration: "Unknown",
                  videoUrl: data.preAuthenticatedLink,
                });
                console.log(`Created new recording for meeting ${meeting.id} with video URL`);
              }
            }
          }
          break;
        }

        case "TRANSCRIPTION_UPLOADED": {
          console.log(`Transcription uploaded, downloading from: ${data?.preAuthenticatedLink}`);
          
          // Find associated meeting
          let meetingId: string | null = null;
          if (roomName) {
            const meeting = await storage.getMeetingByRoomId(roomName);
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
              roomName
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

  return httpServer;
}

// Process transcription in background
async function processTranscription(
  transcriptionId: string,
  downloadUrl: string,
  roomName?: string
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
    
    // Analyze with Gemini
    const analysis = await analyzeTranscription(rawTranscript, meetingTitle);
    
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
