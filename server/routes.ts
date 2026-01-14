import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMeetingSchema, insertRecordingSchema, insertChatMessageSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { analyzeChat } from "./gemini";

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

  return httpServer;
}
