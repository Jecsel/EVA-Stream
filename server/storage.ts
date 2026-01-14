import { 
  type User, 
  type InsertUser,
  type Meeting,
  type InsertMeeting,
  type Recording,
  type InsertRecording,
  type ChatMessage,
  type InsertChatMessage,
  users,
  meetings,
  recordings,
  chatMessages
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
}

export const storage = new DatabaseStorage();
