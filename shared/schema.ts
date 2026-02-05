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
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleEmail: text("google_email"),
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

// Prompt Versions table (for version history and rollback)
export const promptVersions = pgTable("prompt_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promptId: varchar("prompt_id").notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  version: text("version").notNull(), // e.g., "1", "2", "3"
  name: text("name").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPromptVersionSchema = createInsertSchema(promptVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertPromptVersion = z.infer<typeof insertPromptVersionSchema>;
export type PromptVersion = typeof promptVersions.$inferSelect;

// Meetings table
export const meetings = pgTable("meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  roomId: text("room_id").notNull().unique(),
  scheduledDate: timestamp("scheduled_date"),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("scheduled"), // scheduled, live, completed, cancelled
  selectedAgents: text("selected_agents").array(), // array of agent IDs selected for this meeting
  attendeeEmails: text("attendee_emails").array(), // array of attendee email addresses
  calendarEventId: text("calendar_event_id"), // Google Calendar event ID
  eventType: text("event_type").notNull().default("event"), // event or task
  isAllDay: boolean("is_all_day").notNull().default(false), // whether this is an all-day event
  recurrence: text("recurrence").default("none"), // none, daily, weekly, monthly, annually, weekdays, custom
  recurrenceEndDate: timestamp("recurrence_end_date"), // when the recurrence ends
  createdBy: text("created_by"), // Firebase UID of the meeting creator (moderator)
  moderatorCode: text("moderator_code"), // Secret code for moderator access without login
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
  flowchartCode: text("flowchart_code"),
  videoUrl: text("video_url"),
  shareToken: text("share_token").unique(), // Unique token for public SOP sharing
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

// AI Agents table (for managing AI agent configurations)
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // sop, flowchart, analysis, transcription, etc.
  description: text("description"),
  capabilities: text("capabilities").array(),
  icon: text("icon"), // lucide icon name
  promptId: varchar("prompt_id").references(() => prompts.id, { onDelete: 'set null' }),
  status: text("status").notNull().default("active"), // active, inactive
  isDefault: boolean("is_default").notNull().default(false), // whether agent is selected by default in meetings
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAgentSchema = insertAgentSchema.partial();

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type UpdateAgent = z.infer<typeof updateAgentSchema>;
export type Agent = typeof agents.$inferSelect;

// EVA Ops Memory - Observation Sessions (3-phase workflow: observe -> structure -> instruct)
export const observationSessions = pgTable("observation_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").references(() => meetings.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  phase: text("phase").notNull().default("observe"), // observe, structure, instruct
  status: text("status").notNull().default("active"), // active, paused, completed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertObservationSessionSchema = createInsertSchema(observationSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertObservationSession = z.infer<typeof insertObservationSessionSchema>;
export type ObservationSession = typeof observationSessions.$inferSelect;

// EVA Ops Memory - Observations (captured during observe phase)
export const observations = pgTable("observations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => observationSessions.id, { onDelete: 'cascade' }),
  type: text("type").notNull(), // tool_used, intent, decision, action, exception, verbal_note
  app: text("app"), // e.g., Salesforce, Chrome, Excel
  page: text("page"), // e.g., Lead Detail, Dashboard
  action: text("action"), // e.g., Status Change, Click, Input
  fromValue: text("from_value"), // for state changes
  toValue: text("to_value"), // for state changes
  reason: text("reason"), // why this happened (inferred or stated)
  content: text("content").notNull(), // full description
  isRepeated: boolean("is_repeated").default(false), // detected as repeated pattern
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertObservationSchema = createInsertSchema(observations).omit({
  id: true,
  createdAt: true,
});

export type InsertObservation = z.infer<typeof insertObservationSchema>;
export type Observation = typeof observations.$inferSelect;

// EVA Ops Memory - Clarifications (smart questions EVA needs answered)
export const clarifications = pgTable("clarifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => observationSessions.id, { onDelete: 'cascade' }),
  question: text("question").notNull(),
  category: text("category").notNull(), // mandatory_optional, condition, approval, exception, tool
  status: text("status").notNull().default("pending"), // pending, answered, skipped
  answer: text("answer"),
  answeredAt: timestamp("answered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClarificationSchema = createInsertSchema(clarifications).omit({
  id: true,
  createdAt: true,
});

export type InsertClarification = z.infer<typeof insertClarificationSchema>;
export type Clarification = typeof clarifications.$inferSelect;

// EVA Ops Memory - SOPs (decision-based structure with approval workflow)
export const sops = pgTable("sops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => observationSessions.id, { onDelete: 'set null' }),
  meetingId: varchar("meeting_id").references(() => meetings.id, { onDelete: 'set null' }),
  title: text("title").notNull(),
  version: text("version").notNull().default("1"),
  status: text("status").notNull().default("draft"), // draft, reviewed, approved
  goal: text("goal"), // what this SOP achieves
  whenToUse: text("when_to_use"), // when to apply this SOP
  whoPerforms: text("who_performs"), // role responsible
  toolsRequired: text("tools_required").array(), // tools needed
  mainFlow: jsonb("main_flow"), // array of step objects
  decisionPoints: jsonb("decision_points"), // array of if/then conditions
  exceptions: jsonb("exceptions"), // edge cases and handling
  qualityCheck: text("quality_check"), // how to verify correctness
  lowConfidenceSections: text("low_confidence_sections").array(), // sections EVA is unsure about
  assumptions: text("assumptions").array(), // what EVA assumed
  mermaidCode: text("mermaid_code"), // flowchart visualization
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSopSchema = createInsertSchema(sops).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSopSchema = insertSopSchema.partial();

export type InsertSop = z.infer<typeof insertSopSchema>;
export type UpdateSop = z.infer<typeof updateSopSchema>;
export type Sop = typeof sops.$inferSelect;

// SOP Versions for change tracking
export const sopVersions = pgTable("sop_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sopId: varchar("sop_id").notNull().references(() => sops.id, { onDelete: 'cascade' }),
  version: text("version").notNull(),
  changeLog: text("change_log").notNull(), // what changed in this version
  fullContent: jsonb("full_content").notNull(), // snapshot of entire SOP at this version
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSopVersionSchema = createInsertSchema(sopVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertSopVersion = z.infer<typeof insertSopVersionSchema>;
export type SopVersion = typeof sopVersions.$inferSelect;

// EVA Meeting Assistant - Meeting Agendas
export const meetingAgendas = pgTable("meeting_agendas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  items: jsonb("items").notNull().default([]), // legacy: array of { id, title, covered: boolean, order: number }
  content: text("content"), // rich text HTML content for agenda
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMeetingAgendaSchema = createInsertSchema(meetingAgendas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMeetingAgenda = z.infer<typeof insertMeetingAgendaSchema>;
export type MeetingAgenda = typeof meetingAgendas.$inferSelect;

// EVA Meeting Assistant - Meeting Notes (explicit user-triggered notes)
export const meetingNotes = pgTable("meeting_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  content: text("content").notNull(),
  speaker: text("speaker"),
  isImportant: boolean("is_important").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMeetingNoteSchema = createInsertSchema(meetingNotes).omit({
  id: true,
  createdAt: true,
});

export type InsertMeetingNote = z.infer<typeof insertMeetingNoteSchema>;
export type MeetingNote = typeof meetingNotes.$inferSelect;

// EVA Meeting Assistant - Meeting Files (uploaded documents)
export const meetingFiles = pgTable("meeting_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: text("size").notNull(),
  content: text("content"), // extracted text content for AI context
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertMeetingFileSchema = createInsertSchema(meetingFiles).omit({
  id: true,
  uploadedAt: true,
});

export type InsertMeetingFile = z.infer<typeof insertMeetingFileSchema>;
export type MeetingFile = typeof meetingFiles.$inferSelect;

// EVA Meeting Assistant - Meeting Summaries
export const meetingSummaries = pgTable("meeting_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: 'cascade' }).unique(),
  purpose: text("purpose"),
  keyTopics: text("key_topics").array(),
  decisions: text("decisions").array(),
  openQuestions: text("open_questions").array(),
  missedAgendaItems: text("missed_agenda_items").array(),
  fullSummary: text("full_summary"),
  audioUrl: text("audio_url"), // ElevenLabs generated audio URL
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMeetingSummarySchema = createInsertSchema(meetingSummaries).omit({
  id: true,
  createdAt: true,
});

export type InsertMeetingSummary = z.infer<typeof insertMeetingSummarySchema>;
export type MeetingSummary = typeof meetingSummaries.$inferSelect;

// EVA Settings (user preferences)
export const evaSettings = pgTable("eva_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  voiceEnabled: boolean("voice_enabled").notNull().default(true),
  voiceId: text("voice_id").default("Rachel"), // ElevenLabs voice ID
  wakeWordEnabled: boolean("wake_word_enabled").notNull().default(true),
  autoSummary: boolean("auto_summary").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEvaSettingsSchema = createInsertSchema(evaSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEvaSettings = z.infer<typeof insertEvaSettingsSchema>;
export type EvaSettings = typeof evaSettings.$inferSelect;

// API Keys table (for external API access)
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(), // First 8 chars for display (e.g., "sk-xxxx...")
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
