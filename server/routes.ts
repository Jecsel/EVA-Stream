import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMeetingSchema, insertRecordingSchema, insertChatMessageSchema, insertTranscriptSegmentSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { analyzeChat } from "./gemini";
import { generateJitsiToken, isJaaSConfigured } from "./jitsi";
import * as sessionController from "./sessionController";
import { transcribeAudio } from "./sessionController";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  // Session Management - Initialize AI session for meeting
  app.post("/api/meetings/:meetingId/session/start", async (req, res) => {
    try {
      const session = await sessionController.initializeSession(req.params.meetingId);
      res.json({ success: true, sopDocumentId: session.sopDocumentId });
    } catch (error) {
      console.error("Session start error:", error);
      res.status(500).json({ error: "Failed to start session" });
    }
  });

  app.post("/api/meetings/:meetingId/session/end", async (req, res) => {
    try {
      sessionController.endSession(req.params.meetingId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // OpenAI-powered EVA chat (enhanced)
  app.post("/api/meetings/:meetingId/eva/chat", async (req, res) => {
    try {
      const { message, context } = req.body;
      const response = await sessionController.chat(
        req.params.meetingId,
        message,
        context
      );
      res.json(response);
    } catch (error) {
      console.error("EVA chat error:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Transcription endpoint - processes audio and adds to transcript
  app.post("/api/meetings/:meetingId/transcribe", express.raw({ type: 'audio/*', limit: '10mb' }), async (req, res) => {
    try {
      const audioBuffer = req.body as Buffer;
      const format = (req.query.format as "wav" | "mp3" | "webm") || "wav";
      const speaker = (req.query.speaker as string) || "User";
      
      const transcript = await transcribeAudio(audioBuffer, format);
      const segment = await sessionController.addTranscriptSegment(
        req.params.meetingId,
        transcript,
        speaker
      );
      
      res.json({ transcript, segment });
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  // Manual SOP analysis trigger
  app.post("/api/meetings/:meetingId/sop/analyze", async (req, res) => {
    try {
      const version = await sessionController.analyzeAndUpdateSOP(req.params.meetingId);
      if (!version) {
        res.status(200).json({ message: "No updates needed or analysis in progress" });
        return;
      }
      res.json({ version });
    } catch (error) {
      console.error("SOP analysis error:", error);
      res.status(500).json({ error: "Failed to analyze SOP" });
    }
  });

  // Get SOP document with versions
  app.get("/api/meetings/:meetingId/sop", async (req, res) => {
    try {
      const result = await sessionController.getSopDocument(req.params.meetingId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to get SOP document" });
    }
  });

  // Get SOP version history
  app.get("/api/meetings/:meetingId/sop/versions", async (req, res) => {
    try {
      const doc = await storage.getSopDocumentByMeeting(req.params.meetingId);
      if (!doc) {
        res.json([]);
        return;
      }
      const versions = await storage.getSopVersionsByDocument(doc.id);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get SOP versions" });
    }
  });

  // Rollback SOP to specific version
  app.post("/api/meetings/:meetingId/sop/rollback/:versionId", async (req, res) => {
    try {
      const result = await sessionController.rollbackSop(
        req.params.meetingId,
        req.params.versionId
      );
      if (!result) {
        res.status(404).json({ error: "Version not found or invalid" });
        return;
      }
      res.json({ success: true, document: result });
    } catch (error) {
      console.error("SOP rollback error:", error);
      res.status(500).json({ error: "Failed to rollback SOP" });
    }
  });

  // Jitsi JaaS Token Generation
  app.get("/api/jitsi/status", async (_req, res) => {
    try {
      const configured = isJaaSConfigured();
      res.json({ 
        configured,
        message: configured 
          ? "JaaS is configured and ready" 
          : "JaaS is not configured. Using free Jitsi Meet server."
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check JaaS status" });
    }
  });

  app.post("/api/jitsi/token", async (req, res) => {
    try {
      const { roomName, userName, userEmail, userId, isModerator } = req.body;

      if (!roomName || !userName) {
        res.status(400).json({ error: "roomName and userName are required" });
        return;
      }

      // Check if JaaS is configured
      if (!isJaaSConfigured()) {
        res.status(200).json({ 
          configured: false,
          message: "JaaS not configured. Using free Jitsi Meet server.",
          domain: "meet.jit.si",
          roomName,
        });
        return;
      }

      // Generate JWT token
      const result = generateJitsiToken({
        roomName,
        userName,
        userEmail,
        userId,
        isModerator: isModerator ?? true,
        features: {
          livestreaming: false,
          recording: true,
          transcription: true,
        },
      });

      res.json({
        configured: true,
        token: result.token,
        appId: result.appId,
        roomName: result.roomName,
        domain: result.domain,
      });
    } catch (error) {
      console.error("Jitsi token generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate Jitsi token",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return httpServer;
}
