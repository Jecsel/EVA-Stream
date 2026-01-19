import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (basic user management)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"), // admin, user
  status: text("status").notNull().default("active"), // active, inactive, suspended
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserSchema = insertUserSchema.partial();

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;

// AI Prompts table (for managing system prompts)
export const prompts = pgTable("prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // summary, chat, analysis, sop
  content: text("content").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPromptSchema = createInsertSchema(prompts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePromptSchema = insertPromptSchema.partial();

export type InsertPrompt = z.infer<typeof insertPromptSchema>;
export type UpdatePrompt = z.infer<typeof updatePromptSchema>;
export type Prompt = typeof prompts.$inferSelect;

// Meetings table
export const meetings = pgTable("meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  roomId: text("room_id").notNull().unique(),
  scheduledDate: timestamp("scheduled_date"),
  status: text("status").notNull().default("scheduled"), // scheduled, live, completed, cancelled
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

// Meeting recordings with AI summaries
export const recordings = pgTable("recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  duration: text("duration").notNull(),
  summary: text("summary"),
  sopContent: text("sop_content"),
  videoUrl: text("video_url"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const insertRecordingSchema = createInsertSchema(recordings).omit({
  id: true,
  recordedAt: true,
});

export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Recording = typeof recordings.$inferSelect;

// Chat messages for each meeting
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  role: text("role").notNull(), // user or ai
  content: text("content").notNull(),
  context: text("context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Live transcript segments for real-time speech-to-text
export const transcriptSegments = pgTable("transcript_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  speaker: text("speaker").notNull().default("User"),
  text: text("text").notNull(),
  isFinal: boolean("is_final").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTranscriptSegmentSchema = createInsertSchema(transcriptSegments).omit({
  id: true,
  createdAt: true,
});

export type InsertTranscriptSegment = z.infer<typeof insertTranscriptSegmentSchema>;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;

// JaaS Webhook Events - for idempotency tracking
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  eventType: text("event_type").notNull(),
  sessionId: text("session_id").notNull(),
  fqn: text("fqn").notNull(),
  payload: jsonb("payload"),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  processedAt: true,
});

export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// Full meeting transcriptions from JaaS
export const meetingTranscriptions = pgTable("meeting_transcriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").references(() => meetings.id, { onDelete: 'cascade' }),
  sessionId: text("session_id").notNull(),
  fqn: text("fqn").notNull(),
  rawTranscript: text("raw_transcript"),
  parsedTranscript: jsonb("parsed_transcript"),
  aiSummary: text("ai_summary"),
  actionItems: jsonb("action_items"),
  downloadUrl: text("download_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMeetingTranscriptionSchema = createInsertSchema(meetingTranscriptions).omit({
  id: true,
  createdAt: true,
});

export type InsertMeetingTranscription = z.infer<typeof insertMeetingTranscriptionSchema>;
export type MeetingTranscription = typeof meetingTranscriptions.$inferSelect;
