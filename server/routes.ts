import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMeetingSchema, insertRecordingSchema, insertChatMessageSchema, insertTranscriptSegmentSchema, insertUserSchema, updateUserSchema, insertPromptSchema, updatePromptSchema, insertAgentSchema, updateAgentSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { analyzeChat, analyzeTranscription, generateMermaidFlowchart, transcribeRecording, generateMeetingNotes } from "./gemini";
import { getAuthUrl, getTokensFromCode, createCalendarEvent, getUserInfo, validateOAuthState } from "./google-calendar";
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
        // Get default agents to pre-select them
        const allAgents = await storage.listAgents();
        const defaultAgentIds = allAgents
          .filter(agent => agent.isDefault)
          .map(agent => agent.id);
        
        meeting = await storage.createMeeting({
          title: `Meeting ${req.params.roomId}`,
          roomId: req.params.roomId,
          status: "live",
          scheduledDate: new Date(),
          selectedAgents: defaultAgentIds.length > 0 ? defaultAgentIds : null,
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
      
      // Check if NoteTaker agent is enabled for this meeting (only for final segments)
      if (validated.isFinal && validated.text && validated.text.trim().length > 0) {
        processNoteTakerAsync(meetingId).catch(err => 
          console.error("NoteTaker processing error:", err)
        );
      }
      
      res.json(segment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).message });
      } else {
        res.status(500).json({ error: "Failed to create transcript segment" });
      }
    }
  });
  
  // NoteTaker debounce - only process every 15 seconds per meeting
  const noteTakerDebounce = new Map<string, NodeJS.Timeout>();
  const noteTakerLastProcess = new Map<string, number>();
  const NOTETAKER_DEBOUNCE_MS = 15000; // 15 seconds
  
  // NoteTaker processing function (runs asynchronously with debounce)
  async function processNoteTakerAsync(meetingId: string) {
    // Clear any existing debounce timer for this meeting
    const existingTimer = noteTakerDebounce.get(meetingId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Check if we processed recently - if so, schedule for later
    const lastProcess = noteTakerLastProcess.get(meetingId) || 0;
    const timeSinceLastProcess = Date.now() - lastProcess;
    
    if (timeSinceLastProcess < NOTETAKER_DEBOUNCE_MS) {
      // Schedule to run after remaining debounce time
      const timer = setTimeout(() => {
        noteTakerDebounce.delete(meetingId);
        executeNoteTaker(meetingId).catch(err => 
          console.error("NoteTaker execution error:", err)
        );
      }, NOTETAKER_DEBOUNCE_MS - timeSinceLastProcess);
      noteTakerDebounce.set(meetingId, timer);
      return;
    }
    
    // Process immediately
    await executeNoteTaker(meetingId);
  }
  
  async function executeNoteTaker(meetingId: string) {
    noteTakerLastProcess.set(meetingId, Date.now());
    
    const meeting = await storage.getMeeting(meetingId);
    if (!meeting?.selectedAgents || meeting.selectedAgents.length === 0) {
      return;
    }
    
    // Check if NoteTaker (type: "assistant") is enabled
    const agentsWithPrompts = await storage.listAgentsWithPrompts();
    const noteTakerAgent = agentsWithPrompts.find(
      a => a.type === "assistant" && meeting.selectedAgents?.includes(a.id)
    );
    
    if (!noteTakerAgent) {
      return;
    }
    
    // Get recent transcripts (last 10 for context)
    const transcripts = await storage.getTranscriptsByMeeting(meetingId);
    const recentTranscripts = transcripts
      .filter(t => t.isFinal && t.text.trim().length > 0)
      .slice(-10)
      .map(t => ({
        speaker: t.speaker,
        text: t.text,
        timestamp: t.createdAt,
      }));
    
    if (recentTranscripts.length === 0) {
      return;
    }
    
    // Get existing notes (last AI message with notes context)
    const existingMessages = await storage.getChatMessagesByMeeting(meetingId);
    const existingNotesMsg = existingMessages
      .filter(m => m.role === "ai" && m.context === "NoteTaker")
      .pop();
    const existingNotes = existingNotesMsg?.content || "";
    
    // Generate notes using NoteTaker
    const customPrompt = noteTakerAgent.prompt?.content;
    const notes = await generateMeetingNotes(recentTranscripts, existingNotes, customPrompt);
    
    if (notes.content && notes.content !== existingNotes) {
      // Save the notes as an AI message
      await storage.createChatMessage({
        meetingId,
        role: "ai",
        content: notes.content,
        context: "NoteTaker",
      });
      console.log(`NoteTaker generated notes for meeting ${meetingId}`);
    }
  }

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

      // Get the SOP agent's prompt if one is selected for this meeting
      let customPrompt: string | undefined;
      if (meeting?.selectedAgents && meeting.selectedAgents.length > 0) {
        const agentsWithPrompts = await storage.listAgentsWithPrompts();
        const sopAgent = agentsWithPrompts.find(
          a => a.type === "sop" && meeting.selectedAgents?.includes(a.id)
        );
        if (sopAgent?.prompt?.content) {
          customPrompt = sopAgent.prompt.content;
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
      const { sopContent, duration } = req.body;

      // Get meeting
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        res.status(404).json({ error: "Meeting not found" });
        return;
      }

      // Get all chat messages and transcript segments for summary
      const messages = await storage.getChatMessagesByMeeting(meetingId);
      const transcriptSegments = await storage.getTranscriptsByMeeting(meetingId);
      
      // Generate AI summary of the meeting
      let summary = "Meeting ended without discussion.";
      
      // First try to use transcript segments (local speech-to-text)
      if (transcriptSegments.length > 0) {
        const transcriptText = transcriptSegments
          .filter(t => t.isFinal && t.text.trim().length > 0)
          .map(t => `${t.speaker}: ${t.text}`)
          .join("\n");
        
        if (transcriptText.length > 10) {
          const summaryResponse = await analyzeChat(
            `Summarize this meeting in 2-3 sentences. Focus on key decisions and action items:\n\n${transcriptText.slice(0, 4000)}`,
            `Meeting: ${meeting.title}`,
            false
          );
          summary = summaryResponse.message;
        }
      }
      // Fall back to chat messages if no transcript
      else if (messages.length > 0) {
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
    userId: z.string().optional(),
    userEmail: z.string().email().optional(),
    eventType: z.enum(["event", "task"]).optional().default("event"),
    isAllDay: z.boolean().optional().default(false),
    recurrence: z.enum(["none", "daily", "weekly", "monthly", "annually", "weekdays", "custom"]).optional().default("none"),
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
        eventType: validated.eventType,
        isAllDay: validated.isAllDay,
        recurrence: validated.recurrence,
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
  
  // Get the earliest timestamp as reference for relative timestamps
  const startTime = validSegments.length > 0 ? new Date(validSegments[0].createdAt) : undefined;
  
  // Format segments to match expected structure: { speaker, timestamp: "MM:SS", text }
  const parsedSegments = validSegments.map(s => ({
    speaker: s.speaker,
    timestamp: formatTimestamp(new Date(s.createdAt), startTime),
    text: s.text
  }));
  
  // Update the recording with the analysis
  await storage.updateRecording(recordingId, {
    summary: analysis.summary,
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
    
    // Update the recording with the transcription data
    await storage.updateRecording(recordingId, {
      summary: transcription.summary,
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
