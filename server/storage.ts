import { 
  type User, 
  type InsertUser,
  type UpdateUser,
  type Meeting,
  type InsertMeeting,
  type Recording,
  type InsertRecording,
  type ChatMessage,
  type InsertChatMessage,
  type TranscriptSegment,
  type InsertTranscriptSegment,
  type WebhookEvent,
  type InsertWebhookEvent,
  type MeetingTranscription,
  type InsertMeetingTranscription,
  type Prompt,
  type InsertPrompt,
  type UpdatePrompt,
  type PromptVersion,
  type InsertPromptVersion,
  type Agent,
  type InsertAgent,
  type UpdateAgent,
  type ObservationSession,
  type InsertObservationSession,
  type Observation,
  type InsertObservation,
  type Clarification,
  type InsertClarification,
  type Sop,
  type InsertSop,
  type UpdateSop,
  type SopVersion,
  type InsertSopVersion,
  type MeetingAgenda,
  type InsertMeetingAgenda,
  type MeetingNote,
  type InsertMeetingNote,
  type MeetingFile,
  type InsertMeetingFile,
  type MeetingSummary,
  type InsertMeetingSummary,
  type EvaSettings,
  type InsertEvaSettings,
  type ApiKey,
  type InsertApiKey,
  users,
  meetings,
  recordings,
  chatMessages,
  transcriptSegments,
  webhookEvents,
  meetingTranscriptions,
  prompts,
  promptVersions,
  agents,
  observationSessions,
  observations,
  clarifications,
  sops,
  sopVersions,
  meetingAgendas,
  meetingNotes,
  meetingFiles,
  meetingSummaries,
  evaSettings,
  apiKeys
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, ilike, or, and, gte } from "drizzle-orm";

export type AgentWithPrompt = Agent & { prompt?: Prompt | null };

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithId(id: string, user: InsertUser): Promise<User>;
  updateUser(id: string, user: UpdateUser): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  listUsers(search?: string): Promise<User[]>;

  // Prompts
  getPrompt(id: string): Promise<Prompt | undefined>;
  createPrompt(prompt: InsertPrompt): Promise<Prompt>;
  updatePrompt(id: string, prompt: UpdatePrompt): Promise<Prompt | undefined>;
  deletePrompt(id: string): Promise<boolean>;
  listPrompts(type?: string): Promise<Prompt[]>;
  getActivePromptByType(type: string): Promise<Prompt | undefined>;

  // Prompt Versions
  createPromptVersion(version: InsertPromptVersion): Promise<PromptVersion>;
  getPromptVersions(promptId: string): Promise<PromptVersion[]>;
  getPromptVersion(id: string): Promise<PromptVersion | undefined>;
  getLatestVersionNumber(promptId: string): Promise<number>;

  // Meetings
  getMeeting(id: string): Promise<Meeting | undefined>;
  getMeetingByRoomId(roomId: string): Promise<Meeting | undefined>;
  getMeetingByRoomIdCaseInsensitive(roomId: string): Promise<Meeting | undefined>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: string, meeting: Partial<InsertMeeting>): Promise<Meeting | undefined>;
  listMeetings(): Promise<Meeting[]>;
  listUpcomingMeetings(): Promise<Meeting[]>;
  listPastMeetings(limit?: number): Promise<Meeting[]>;

  // Recordings
  getRecording(id: string): Promise<Recording | undefined>;
  getRecordingByShareToken(token: string): Promise<Recording | undefined>;
  createRecording(recording: InsertRecording): Promise<Recording>;
  listRecordings(limit?: number): Promise<Recording[]>;
  getRecordingsByMeeting(meetingId: string): Promise<Recording[]>;
  updateRecording(id: string, recording: Partial<InsertRecording>): Promise<Recording | undefined>;
  deleteRecording(id: string): Promise<boolean>;

  // Chat Messages
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessagesByMeeting(meetingId: string): Promise<ChatMessage[]>;

  // Transcript Segments
  createTranscriptSegment(segment: InsertTranscriptSegment): Promise<TranscriptSegment>;
  getTranscriptsByMeeting(meetingId: string): Promise<TranscriptSegment[]>;
  deleteTranscriptsByMeeting(meetingId: string): Promise<number>;

  // Webhook Events (idempotency)
  getWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<WebhookEvent | undefined>;
  createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent>;

  // Meeting Transcriptions
  createMeetingTranscription(transcription: InsertMeetingTranscription): Promise<MeetingTranscription>;
  getTranscriptionBySessionId(sessionId: string): Promise<MeetingTranscription | undefined>;
  updateMeetingTranscription(id: string, data: Partial<InsertMeetingTranscription>): Promise<MeetingTranscription | undefined>;
  getTranscriptionsByMeetingId(meetingId: string): Promise<MeetingTranscription[]>;
  deleteTranscriptionsByMeeting(meetingId: string): Promise<number>;
  deleteTranscriptionBySessionId(sessionId: string): Promise<number>;

  // Agents
  getAgent(id: string): Promise<Agent | undefined>;
  getAgentByName(name: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, agent: UpdateAgent): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  listAgents(search?: string, type?: string): Promise<Agent[]>;
  listAgentsWithPrompts(search?: string, type?: string): Promise<AgentWithPrompt[]>;

  // Observation Sessions
  createObservationSession(session: InsertObservationSession): Promise<ObservationSession>;
  getObservationSession(id: string): Promise<ObservationSession | undefined>;
  updateObservationSession(id: string, data: Partial<InsertObservationSession>): Promise<ObservationSession | undefined>;
  listObservationSessions(meetingId?: string): Promise<ObservationSession[]>;

  // Observations
  createObservation(observation: InsertObservation): Promise<Observation>;
  getObservationsBySession(sessionId: string): Promise<Observation[]>;

  // Clarifications
  createClarification(clarification: InsertClarification): Promise<Clarification>;
  getClarificationsBySession(sessionId: string): Promise<Clarification[]>;
  updateClarification(id: string, data: Partial<InsertClarification>): Promise<Clarification | undefined>;

  // SOPs
  createSop(sop: InsertSop): Promise<Sop>;
  getSop(id: string): Promise<Sop | undefined>;
  updateSop(id: string, data: UpdateSop): Promise<Sop | undefined>;
  listSops(status?: string): Promise<Sop[]>;
  getSopsBySession(sessionId: string): Promise<Sop[]>;
  getSopsByMeeting(meetingId: string): Promise<Sop[]>;

  // SOP Versions
  createSopVersion(version: InsertSopVersion): Promise<SopVersion>;
  getSopVersions(sopId: string): Promise<SopVersion[]>;

  // EVA - Meeting Agendas
  getMeetingAgenda(meetingId: string): Promise<MeetingAgenda | undefined>;
  createMeetingAgenda(agenda: InsertMeetingAgenda): Promise<MeetingAgenda>;
  updateMeetingAgenda(meetingId: string, items: any[], content?: string): Promise<MeetingAgenda | undefined>;

  // EVA - Meeting Notes
  getMeetingNotes(meetingId: string): Promise<MeetingNote[]>;
  createMeetingNote(note: InsertMeetingNote): Promise<MeetingNote>;
  deleteMeetingNote(id: string): Promise<boolean>;

  // EVA - Meeting Files
  getMeetingFiles(meetingId: string): Promise<MeetingFile[]>;
  getMeetingFile(id: string): Promise<MeetingFile | undefined>;
  createMeetingFile(file: InsertMeetingFile): Promise<MeetingFile>;
  deleteMeetingFile(id: string): Promise<boolean>;

  // EVA - Meeting Summaries
  getMeetingSummary(meetingId: string): Promise<MeetingSummary | undefined>;
  createMeetingSummary(summary: InsertMeetingSummary): Promise<MeetingSummary>;
  updateMeetingSummary(meetingId: string, data: Partial<InsertMeetingSummary>): Promise<MeetingSummary | undefined>;

  // EVA - Settings
  getEvaSettings(userId: string): Promise<EvaSettings | undefined>;
  createEvaSettings(settings: InsertEvaSettings): Promise<EvaSettings>;
  updateEvaSettings(userId: string, data: Partial<InsertEvaSettings>): Promise<EvaSettings | undefined>;

  // API Keys
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  getApiKeyByKey(key: string): Promise<ApiKey | undefined>;
  listApiKeys(): Promise<ApiKey[]>;
  revokeApiKey(id: string): Promise<boolean>;
  updateApiKeyLastUsed(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createUserWithId(id: string, insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({ ...insertUser, id }).returning();
    return user;
  }

  async updateUser(id: string, updateData: UpdateUser): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async listUsers(search?: string): Promise<User[]> {
    if (search) {
      return db
        .select()
        .from(users)
        .where(
          or(
            ilike(users.username, `%${search}%`),
            ilike(users.email, `%${search}%`)
          )
        )
        .orderBy(desc(users.createdAt));
    }
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Prompts
  async getPrompt(id: string): Promise<Prompt | undefined> {
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
    return prompt;
  }

  async createPrompt(insertPrompt: InsertPrompt): Promise<Prompt> {
    const [prompt] = await db.insert(prompts).values(insertPrompt).returning();
    return prompt;
  }

  async updatePrompt(id: string, updateData: UpdatePrompt): Promise<Prompt | undefined> {
    const [prompt] = await db
      .update(prompts)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(prompts.id, id))
      .returning();
    return prompt;
  }

  async deletePrompt(id: string): Promise<boolean> {
    const result = await db.delete(prompts).where(eq(prompts.id, id)).returning();
    return result.length > 0;
  }

  async listPrompts(type?: string): Promise<Prompt[]> {
    if (type) {
      return db
        .select()
        .from(prompts)
        .where(eq(prompts.type, type))
        .orderBy(desc(prompts.createdAt));
    }
    return db.select().from(prompts).orderBy(desc(prompts.createdAt));
  }

  async getActivePromptByType(type: string): Promise<Prompt | undefined> {
    const [prompt] = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.type, type), eq(prompts.isActive, true)))
      .limit(1);
    return prompt;
  }

  // Prompt Versions
  async createPromptVersion(insertVersion: InsertPromptVersion): Promise<PromptVersion> {
    const [version] = await db.insert(promptVersions).values(insertVersion).returning();
    return version;
  }

  async getPromptVersions(promptId: string): Promise<PromptVersion[]> {
    return db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.promptId, promptId))
      .orderBy(desc(promptVersions.createdAt));
  }

  async getPromptVersion(id: string): Promise<PromptVersion | undefined> {
    const [version] = await db.select().from(promptVersions).where(eq(promptVersions.id, id));
    return version;
  }

  async getLatestVersionNumber(promptId: string): Promise<number> {
    const versions = await db
      .select({ version: promptVersions.version })
      .from(promptVersions)
      .where(eq(promptVersions.promptId, promptId))
      .orderBy(desc(promptVersions.createdAt))
      .limit(1);
    
    if (versions.length === 0) return 0;
    return parseInt(versions[0].version, 10) || 0;
  }

  // Meetings
  async getMeeting(id: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
    return meeting;
  }

  async getMeetingByRoomId(roomId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.roomId, roomId));
    return meeting;
  }

  async getMeetingByRoomIdCaseInsensitive(roomId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(ilike(meetings.roomId, roomId));
    return meeting;
  }

  async createMeeting(insertMeeting: InsertMeeting): Promise<Meeting> {
    const [meeting] = await db.insert(meetings).values(insertMeeting).returning();
    return meeting;
  }

  async updateMeeting(id: string, updateData: Partial<InsertMeeting>): Promise<Meeting | undefined> {
    const [meeting] = await db
      .update(meetings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(meetings.id, id))
      .returning();
    return meeting;
  }

  async listMeetings(): Promise<Meeting[]> {
    return db
      .select()
      .from(meetings)
      .orderBy(desc(meetings.scheduledDate));
  }

  async listUpcomingMeetings(): Promise<Meeting[]> {
    const now = new Date();
    return db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.status, "scheduled"),
          gte(meetings.scheduledDate, now)
        )
      )
      .orderBy(meetings.scheduledDate);
  }

  async listPastMeetings(limit: number = 10): Promise<Meeting[]> {
    return db
      .select()
      .from(meetings)
      .where(eq(meetings.status, "completed"))
      .orderBy(desc(meetings.updatedAt))
      .limit(limit);
  }

  // Recordings
  async getRecording(id: string): Promise<Recording | undefined> {
    const [recording] = await db.select().from(recordings).where(eq(recordings.id, id));
    return recording;
  }

  async getRecordingByShareToken(token: string): Promise<Recording | undefined> {
    const [recording] = await db.select().from(recordings).where(eq(recordings.shareToken, token));
    return recording;
  }

  async createRecording(insertRecording: InsertRecording): Promise<Recording> {
    const [recording] = await db.insert(recordings).values(insertRecording).returning();
    return recording;
  }

  async listRecordings(limit: number = 10): Promise<Recording[]> {
    return db
      .select()
      .from(recordings)
      .orderBy(desc(recordings.recordedAt))
      .limit(limit);
  }

  async getRecordingsByMeeting(meetingId: string): Promise<Recording[]> {
    return db
      .select()
      .from(recordings)
      .where(eq(recordings.meetingId, meetingId))
      .orderBy(desc(recordings.recordedAt));
  }

  async updateRecording(id: string, updateData: Partial<InsertRecording>): Promise<Recording | undefined> {
    const [recording] = await db
      .update(recordings)
      .set(updateData)
      .where(eq(recordings.id, id))
      .returning();
    return recording;
  }

  async deleteRecording(id: string): Promise<boolean> {
    const result = await db.delete(recordings).where(eq(recordings.id, id)).returning();
    return result.length > 0;
  }

  // Chat Messages
  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db.insert(chatMessages).values(insertMessage).returning();
    return message;
  }

  async getChatMessagesByMeeting(meetingId: string): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.meetingId, meetingId))
      .orderBy(chatMessages.createdAt);
  }

  // Transcript Segments
  async createTranscriptSegment(insertSegment: InsertTranscriptSegment): Promise<TranscriptSegment> {
    const [segment] = await db.insert(transcriptSegments).values(insertSegment).returning();
    return segment;
  }

  async getTranscriptsByMeeting(meetingId: string): Promise<TranscriptSegment[]> {
    return db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, meetingId))
      .orderBy(transcriptSegments.createdAt);
  }

  async deleteTranscriptsByMeeting(meetingId: string): Promise<number> {
    const result = await db.delete(transcriptSegments).where(eq(transcriptSegments.meetingId, meetingId)).returning();
    return result.length;
  }

  // Webhook Events
  async getWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<WebhookEvent | undefined> {
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.idempotencyKey, idempotencyKey));
    return event;
  }

  async createWebhookEvent(insertEvent: InsertWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db.insert(webhookEvents).values(insertEvent).returning();
    return event;
  }

  // Meeting Transcriptions
  async createMeetingTranscription(insertTranscription: InsertMeetingTranscription): Promise<MeetingTranscription> {
    const [transcription] = await db.insert(meetingTranscriptions).values(insertTranscription).returning();
    return transcription;
  }

  async getTranscriptionBySessionId(sessionId: string): Promise<MeetingTranscription | undefined> {
    const [transcription] = await db.select().from(meetingTranscriptions).where(eq(meetingTranscriptions.sessionId, sessionId));
    return transcription;
  }

  async updateMeetingTranscription(id: string, data: Partial<InsertMeetingTranscription>): Promise<MeetingTranscription | undefined> {
    const [transcription] = await db
      .update(meetingTranscriptions)
      .set(data)
      .where(eq(meetingTranscriptions.id, id))
      .returning();
    return transcription;
  }

  async getTranscriptionsByMeetingId(meetingId: string): Promise<MeetingTranscription[]> {
    return db
      .select()
      .from(meetingTranscriptions)
      .where(eq(meetingTranscriptions.meetingId, meetingId))
      .orderBy(desc(meetingTranscriptions.createdAt));
  }

  async deleteTranscriptionsByMeeting(meetingId: string): Promise<number> {
    const result = await db.delete(meetingTranscriptions).where(eq(meetingTranscriptions.meetingId, meetingId)).returning();
    return result.length;
  }

  async deleteTranscriptionBySessionId(sessionId: string): Promise<number> {
    const result = await db.delete(meetingTranscriptions).where(eq(meetingTranscriptions.sessionId, sessionId)).returning();
    return result.length;
  }

  // Agents
  async getAgent(id: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async getAgentByName(name: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.name, name));
    return agent;
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const [agent] = await db.insert(agents).values(insertAgent).returning();
    return agent;
  }

  async updateAgent(id: string, updateData: UpdateAgent): Promise<Agent | undefined> {
    const [agent] = await db
      .update(agents)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    return agent;
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = await db.delete(agents).where(eq(agents.id, id)).returning();
    return result.length > 0;
  }

  async listAgents(search?: string, type?: string): Promise<Agent[]> {
    let query = db.select().from(agents);
    
    if (search && type) {
      return db
        .select()
        .from(agents)
        .where(
          and(
            or(
              ilike(agents.name, `%${search}%`),
              ilike(agents.description, `%${search}%`)
            ),
            eq(agents.type, type)
          )
        )
        .orderBy(desc(agents.createdAt));
    } else if (search) {
      return db
        .select()
        .from(agents)
        .where(
          or(
            ilike(agents.name, `%${search}%`),
            ilike(agents.description, `%${search}%`)
          )
        )
        .orderBy(desc(agents.createdAt));
    } else if (type) {
      return db
        .select()
        .from(agents)
        .where(eq(agents.type, type))
        .orderBy(desc(agents.createdAt));
    }
    
    return db.select().from(agents).orderBy(desc(agents.createdAt));
  }

  async listAgentsWithPrompts(search?: string, type?: string): Promise<AgentWithPrompt[]> {
    const agentsList = await this.listAgents(search, type);
    
    const agentsWithPrompts: AgentWithPrompt[] = await Promise.all(
      agentsList.map(async (agent) => {
        let prompt: Prompt | null = null;
        if (agent.promptId) {
          const foundPrompt = await this.getPrompt(agent.promptId);
          prompt = foundPrompt || null;
        }
        return { ...agent, prompt };
      })
    );
    
    return agentsWithPrompts;
  }

  // Observation Sessions
  async createObservationSession(insertSession: InsertObservationSession): Promise<ObservationSession> {
    const [session] = await db.insert(observationSessions).values(insertSession).returning();
    return session;
  }

  async getObservationSession(id: string): Promise<ObservationSession | undefined> {
    const [session] = await db.select().from(observationSessions).where(eq(observationSessions.id, id));
    return session;
  }

  async updateObservationSession(id: string, data: Partial<InsertObservationSession>): Promise<ObservationSession | undefined> {
    const [session] = await db
      .update(observationSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(observationSessions.id, id))
      .returning();
    return session;
  }

  async listObservationSessions(meetingId?: string): Promise<ObservationSession[]> {
    if (meetingId) {
      return db
        .select()
        .from(observationSessions)
        .where(eq(observationSessions.meetingId, meetingId))
        .orderBy(desc(observationSessions.createdAt));
    }
    return db.select().from(observationSessions).orderBy(desc(observationSessions.createdAt));
  }

  // Observations
  async createObservation(insertObs: InsertObservation): Promise<Observation> {
    const [obs] = await db.insert(observations).values(insertObs).returning();
    return obs;
  }

  async getObservationsBySession(sessionId: string): Promise<Observation[]> {
    return db
      .select()
      .from(observations)
      .where(eq(observations.sessionId, sessionId))
      .orderBy(observations.createdAt);
  }

  // Clarifications
  async createClarification(insertClarification: InsertClarification): Promise<Clarification> {
    const [clarification] = await db.insert(clarifications).values(insertClarification).returning();
    return clarification;
  }

  async getClarificationsBySession(sessionId: string): Promise<Clarification[]> {
    return db
      .select()
      .from(clarifications)
      .where(eq(clarifications.sessionId, sessionId))
      .orderBy(clarifications.createdAt);
  }

  async updateClarification(id: string, data: Partial<InsertClarification>): Promise<Clarification | undefined> {
    const [clarification] = await db
      .update(clarifications)
      .set(data)
      .where(eq(clarifications.id, id))
      .returning();
    return clarification;
  }

  // SOPs
  async createSop(insertSop: InsertSop): Promise<Sop> {
    const [sop] = await db.insert(sops).values(insertSop).returning();
    return sop;
  }

  async getSop(id: string): Promise<Sop | undefined> {
    const [sop] = await db.select().from(sops).where(eq(sops.id, id));
    return sop;
  }

  async updateSop(id: string, data: UpdateSop): Promise<Sop | undefined> {
    const [sop] = await db
      .update(sops)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sops.id, id))
      .returning();
    return sop;
  }

  async listSops(status?: string): Promise<Sop[]> {
    if (status) {
      return db
        .select()
        .from(sops)
        .where(eq(sops.status, status))
        .orderBy(desc(sops.createdAt));
    }
    return db.select().from(sops).orderBy(desc(sops.createdAt));
  }

  async getSopsBySession(sessionId: string): Promise<Sop[]> {
    return db
      .select()
      .from(sops)
      .where(eq(sops.sessionId, sessionId))
      .orderBy(desc(sops.createdAt));
  }

  async getSopsByMeeting(meetingId: string): Promise<Sop[]> {
    return db
      .select()
      .from(sops)
      .where(eq(sops.meetingId, meetingId))
      .orderBy(desc(sops.createdAt));
  }

  // SOP Versions
  async createSopVersion(insertVersion: InsertSopVersion): Promise<SopVersion> {
    const [version] = await db.insert(sopVersions).values(insertVersion).returning();
    return version;
  }

  async getSopVersions(sopId: string): Promise<SopVersion[]> {
    return db
      .select()
      .from(sopVersions)
      .where(eq(sopVersions.sopId, sopId))
      .orderBy(desc(sopVersions.createdAt));
  }

  // EVA - Meeting Agendas
  async getMeetingAgenda(meetingId: string): Promise<MeetingAgenda | undefined> {
    const [agenda] = await db
      .select()
      .from(meetingAgendas)
      .where(eq(meetingAgendas.meetingId, meetingId));
    return agenda;
  }

  async createMeetingAgenda(agenda: InsertMeetingAgenda): Promise<MeetingAgenda> {
    const [result] = await db.insert(meetingAgendas).values(agenda).returning();
    return result;
  }

  async updateMeetingAgenda(meetingId: string, items: any[], content?: string): Promise<MeetingAgenda | undefined> {
    const [result] = await db
      .update(meetingAgendas)
      .set({ items, content, updatedAt: new Date() })
      .where(eq(meetingAgendas.meetingId, meetingId))
      .returning();
    return result;
  }

  // EVA - Meeting Notes
  async getMeetingNotes(meetingId: string): Promise<MeetingNote[]> {
    return db
      .select()
      .from(meetingNotes)
      .where(eq(meetingNotes.meetingId, meetingId))
      .orderBy(desc(meetingNotes.createdAt));
  }

  async createMeetingNote(note: InsertMeetingNote): Promise<MeetingNote> {
    const [result] = await db.insert(meetingNotes).values(note).returning();
    return result;
  }

  async deleteMeetingNote(id: string): Promise<boolean> {
    const result = await db.delete(meetingNotes).where(eq(meetingNotes.id, id)).returning();
    return result.length > 0;
  }

  // EVA - Meeting Files
  async getMeetingFiles(meetingId: string): Promise<MeetingFile[]> {
    return db
      .select()
      .from(meetingFiles)
      .where(eq(meetingFiles.meetingId, meetingId))
      .orderBy(desc(meetingFiles.uploadedAt));
  }

  async getMeetingFile(id: string): Promise<MeetingFile | undefined> {
    const [file] = await db.select().from(meetingFiles).where(eq(meetingFiles.id, id));
    return file;
  }

  async createMeetingFile(file: InsertMeetingFile): Promise<MeetingFile> {
    const [result] = await db.insert(meetingFiles).values(file).returning();
    return result;
  }

  async deleteMeetingFile(id: string): Promise<boolean> {
    const result = await db.delete(meetingFiles).where(eq(meetingFiles.id, id)).returning();
    return result.length > 0;
  }

  // EVA - Meeting Summaries
  async getMeetingSummary(meetingId: string): Promise<MeetingSummary | undefined> {
    const [summary] = await db
      .select()
      .from(meetingSummaries)
      .where(eq(meetingSummaries.meetingId, meetingId));
    return summary;
  }

  async createMeetingSummary(summary: InsertMeetingSummary): Promise<MeetingSummary> {
    const [result] = await db.insert(meetingSummaries).values(summary).returning();
    return result;
  }

  async updateMeetingSummary(meetingId: string, data: Partial<InsertMeetingSummary>): Promise<MeetingSummary | undefined> {
    const [result] = await db
      .update(meetingSummaries)
      .set(data)
      .where(eq(meetingSummaries.meetingId, meetingId))
      .returning();
    return result;
  }

  // EVA - Settings
  async getEvaSettings(userId: string): Promise<EvaSettings | undefined> {
    const [settings] = await db
      .select()
      .from(evaSettings)
      .where(eq(evaSettings.userId, userId));
    return settings;
  }

  async createEvaSettings(settings: InsertEvaSettings): Promise<EvaSettings> {
    const [result] = await db.insert(evaSettings).values(settings).returning();
    return result;
  }

  async updateEvaSettings(userId: string, data: Partial<InsertEvaSettings>): Promise<EvaSettings | undefined> {
    const [result] = await db
      .update(evaSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(evaSettings.userId, userId))
      .returning();
    return result;
  }

  // API Keys
  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const [result] = await db.insert(apiKeys).values(apiKey).returning();
    return result;
  }

  async getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
    const [result] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.key, key), eq(apiKeys.isActive, true)));
    return result;
  }

  async listApiKeys(): Promise<ApiKey[]> {
    return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const [result] = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, id))
      .returning();
    return !!result;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, id));
  }
}

export const storage = new DatabaseStorage();
