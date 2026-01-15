import { 
  type User, 
  type InsertUser,
  type Meeting,
  type InsertMeeting,
  type Recording,
  type InsertRecording,
  type ChatMessage,
  type InsertChatMessage,
  type TranscriptSegment,
  type InsertTranscriptSegment,
  type SopDocument,
  type InsertSopDocument,
  type SopVersion,
  type InsertSopVersion,
  users,
  meetings,
  recordings,
  chatMessages,
  transcriptSegments,
  sopDocuments,
  sopVersions
} from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Meetings
  getMeeting(id: string): Promise<Meeting | undefined>;
  getMeetingByRoomId(roomId: string): Promise<Meeting | undefined>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: string, meeting: Partial<InsertMeeting>): Promise<Meeting | undefined>;
  listUpcomingMeetings(): Promise<Meeting[]>;
  listPastMeetings(limit?: number): Promise<Meeting[]>;

  // Recordings
  getRecording(id: string): Promise<Recording | undefined>;
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

  // SOP Documents
  getSopDocument(id: string): Promise<SopDocument | undefined>;
  getSopDocumentByMeeting(meetingId: string): Promise<SopDocument | undefined>;
  createSopDocument(document: InsertSopDocument): Promise<SopDocument>;
  updateSopDocument(id: string, update: Partial<InsertSopDocument>): Promise<SopDocument | undefined>;

  // SOP Versions
  getSopVersion(id: string): Promise<SopVersion | undefined>;
  getSopVersionsByDocument(documentId: string): Promise<SopVersion[]>;
  createSopVersion(version: InsertSopVersion): Promise<SopVersion>;
  getLatestSopVersion(documentId: string): Promise<SopVersion | undefined>;
  rollbackToVersion(documentId: string, versionId: string): Promise<SopDocument | undefined>;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
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

  async listUpcomingMeetings(): Promise<Meeting[]> {
    return db
      .select()
      .from(meetings)
      .where(eq(meetings.status, "scheduled"))
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

  // SOP Documents
  async getSopDocument(id: string): Promise<SopDocument | undefined> {
    const [doc] = await db.select().from(sopDocuments).where(eq(sopDocuments.id, id));
    return doc;
  }

  async getSopDocumentByMeeting(meetingId: string): Promise<SopDocument | undefined> {
    const [doc] = await db.select().from(sopDocuments).where(eq(sopDocuments.meetingId, meetingId));
    return doc;
  }

  async createSopDocument(insertDoc: InsertSopDocument): Promise<SopDocument> {
    const [doc] = await db.insert(sopDocuments).values(insertDoc).returning();
    return doc;
  }

  async updateSopDocument(id: string, updateData: Partial<InsertSopDocument>): Promise<SopDocument | undefined> {
    const [doc] = await db
      .update(sopDocuments)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(sopDocuments.id, id))
      .returning();
    return doc;
  }

  // SOP Versions
  async getSopVersion(id: string): Promise<SopVersion | undefined> {
    const [version] = await db.select().from(sopVersions).where(eq(sopVersions.id, id));
    return version;
  }

  async getSopVersionsByDocument(documentId: string): Promise<SopVersion[]> {
    return db
      .select()
      .from(sopVersions)
      .where(eq(sopVersions.documentId, documentId))
      .orderBy(desc(sopVersions.createdAt));
  }

  async createSopVersion(insertVersion: InsertSopVersion): Promise<SopVersion> {
    const [version] = await db.insert(sopVersions).values(insertVersion).returning();
    await db
      .update(sopDocuments)
      .set({ currentVersionId: version.id, updatedAt: new Date() })
      .where(eq(sopDocuments.id, insertVersion.documentId));
    return version;
  }

  async getLatestSopVersion(documentId: string): Promise<SopVersion | undefined> {
    const [version] = await db
      .select()
      .from(sopVersions)
      .where(eq(sopVersions.documentId, documentId))
      .orderBy(desc(sopVersions.createdAt))
      .limit(1);
    return version;
  }

  async rollbackToVersion(documentId: string, versionId: string): Promise<SopDocument | undefined> {
    const targetVersion = await this.getSopVersion(versionId);
    if (!targetVersion || targetVersion.documentId !== documentId) {
      return undefined;
    }
    
    const [doc] = await db
      .update(sopDocuments)
      .set({ currentVersionId: versionId, updatedAt: new Date() })
      .where(eq(sopDocuments.id, documentId))
      .returning();
    
    return doc;
  }
}

export const storage = new DatabaseStorage();
