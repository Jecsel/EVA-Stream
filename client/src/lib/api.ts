import type { Meeting, Recording, ChatMessage, TranscriptSegment, InsertMeeting, InsertRecording, InsertChatMessage, InsertTranscriptSegment, MeetingTranscription, Agent } from "@shared/schema";

const API_BASE = "/api";

export interface AIChatResponse {
  message: string;
  sopUpdate?: string;
  savedMessage: ChatMessage;
}

export const api = {
  // Meetings
  async createMeeting(data: InsertMeeting): Promise<Meeting> {
    const response = await fetch(`${API_BASE}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create meeting");
    return response.json();
  },

  async getMeeting(id: string): Promise<Meeting> {
    const response = await fetch(`${API_BASE}/meetings/${id}`);
    if (!response.ok) throw new Error("Failed to fetch meeting");
    return response.json();
  },

  async getMeetingByRoomId(roomId: string): Promise<Meeting> {
    const response = await fetch(`${API_BASE}/meetings/room/${roomId}`);
    if (!response.ok) throw new Error("Failed to fetch meeting by room ID");
    return response.json();
  },

  async updateMeeting(id: string, data: Partial<InsertMeeting>): Promise<Meeting> {
    const response = await fetch(`${API_BASE}/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update meeting");
    return response.json();
  },

  async getUpcomingMeetings(): Promise<Meeting[]> {
    const response = await fetch(`${API_BASE}/meetings/upcoming`);
    if (!response.ok) throw new Error("Failed to fetch upcoming meetings");
    return response.json();
  },

  async getPastMeetings(limit = 10): Promise<Meeting[]> {
    const response = await fetch(`${API_BASE}/meetings/past?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch past meetings");
    return response.json();
  },

  // Recordings
  async createRecording(data: InsertRecording): Promise<Recording> {
    const response = await fetch(`${API_BASE}/recordings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create recording");
    return response.json();
  },

  async getRecording(id: string): Promise<Recording> {
    const response = await fetch(`${API_BASE}/recordings/${id}`);
    if (!response.ok) throw new Error("Failed to fetch recording");
    return response.json();
  },

  async listRecordings(limit = 10): Promise<Recording[]> {
    const response = await fetch(`${API_BASE}/recordings?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch recordings");
    return response.json();
  },

  async updateRecording(id: string, data: Partial<InsertRecording>): Promise<Recording> {
    const response = await fetch(`${API_BASE}/recordings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update recording");
    return response.json();
  },

  async deleteRecording(id: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/recordings/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete recording");
    return response.json();
  },

  // Chat Messages
  async createChatMessage(meetingId: string, data: Omit<InsertChatMessage, "meetingId">): Promise<ChatMessage> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create chat message");
    return response.json();
  },

  async getChatMessages(meetingId: string): Promise<ChatMessage[]> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/messages`);
    if (!response.ok) throw new Error("Failed to fetch chat messages");
    return response.json();
  },

  // AI Chat - EVA SOP Assistant
  async sendAIChat(meetingId: string, message: string, isScreenSharing: boolean): Promise<AIChatResponse> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, isScreenSharing }),
    });
    if (!response.ok) throw new Error("Failed to send chat message");
    return response.json();
  },

  // End meeting and create recording
  async endMeeting(meetingId: string, sopContent?: string, duration?: string): Promise<{ recording: Recording; summary: string }> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sopContent, duration }),
    });
    if (!response.ok) throw new Error("Failed to end meeting");
    return response.json();
  },

  // Transcript Segments
  async createTranscriptSegment(meetingId: string, data: Omit<InsertTranscriptSegment, "meetingId">): Promise<TranscriptSegment> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/transcripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create transcript segment");
    return response.json();
  },

  async getTranscripts(meetingId: string): Promise<TranscriptSegment[]> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/transcripts`);
    if (!response.ok) throw new Error("Failed to fetch transcripts");
    return response.json();
  },

  async getMeetingTranscriptions(meetingId: string): Promise<MeetingTranscription[]> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/transcriptions`);
    if (!response.ok) throw new Error("Failed to fetch meeting transcriptions");
    return response.json();
  },

  // Generate Mermaid flowchart from SOP content
  async generateFlowchart(sopContent: string, meetingId?: string): Promise<{ mermaidCode: string }> {
    const response = await fetch(`${API_BASE}/generate-flowchart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sopContent, meetingId }),
    });
    if (!response.ok) throw new Error("Failed to generate flowchart");
    return response.json();
  },

  // Agents
  async listAgents(): Promise<Agent[]> {
    const response = await fetch(`${API_BASE}/agents`);
    if (!response.ok) throw new Error("Failed to fetch agents");
    return response.json();
  },

  // Update meeting with selected agents
  async updateMeetingAgents(meetingId: string, selectedAgents: string[]): Promise<Meeting> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedAgents }),
    });
    if (!response.ok) throw new Error("Failed to update meeting agents");
    return response.json();
  },
};
