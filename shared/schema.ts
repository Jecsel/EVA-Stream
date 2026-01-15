import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (basic user management)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
