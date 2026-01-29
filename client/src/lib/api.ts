import type { Meeting, Recording, ChatMessage, TranscriptSegment, InsertMeeting, InsertRecording, InsertChatMessage, InsertTranscriptSegment, MeetingTranscription, Agent, ObservationSession, InsertObservationSession, Observation, InsertObservation, Clarification, InsertClarification, Sop, InsertSop } from "@shared/schema";

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

  async transcribeRecording(id: string): Promise<{ success: boolean; message: string; recordingId: string }> {
    const response = await fetch(`${API_BASE}/recordings/${id}/transcribe`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to start transcription");
    return response.json();
  },

  async generateFlowchart(sopContent: string, meetingId?: string): Promise<{ mermaidCode: string }> {
    const response = await fetch(`${API_BASE}/generate-flowchart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sopContent, meetingId }),
    });
    if (!response.ok) throw new Error("Failed to generate flowchart");
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

  async getSopsByMeeting(meetingId: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}/sops`);
    if (!response.ok) throw new Error("Failed to fetch SOPs");
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

  // Google Calendar integration
  async getGoogleAuthUrl(userId: string): Promise<{ authUrl: string }> {
    const response = await fetch(`${API_BASE}/google/auth-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get Google auth URL");
    }
    return response.json();
  },

  async getGoogleStatus(userId: string, userEmail?: string): Promise<{ connected: boolean; email: string | null }> {
    const params = userEmail ? `?email=${encodeURIComponent(userEmail)}` : '';
    const response = await fetch(`${API_BASE}/google/status/${userId}${params}`);
    if (!response.ok) {
      return { connected: false, email: null };
    }
    return response.json();
  },

  async disconnectGoogle(userId: string, userEmail?: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/google/disconnect/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });
    if (!response.ok) {
      throw new Error("Failed to disconnect Google");
    }
    return response.json();
  },

  async scheduleWithCalendar(data: {
    title: string;
    scheduledDate: string;
    endDate?: string;
    attendeeEmails?: string[];
    description?: string;
    agenda?: string;
    files?: Array<{
      filename: string;
      originalName: string;
      mimeType: string;
      size: string;
      content?: string;
    }>;
    userId?: string;
    userEmail?: string;
    eventType?: "event" | "task";
    isAllDay?: boolean;
    recurrence?: "none" | "daily" | "weekly" | "monthly" | "annually" | "weekdays" | "custom";
  }): Promise<{
    success: boolean;
    meeting: Meeting;
    link: string;
    calendarEventCreated: boolean;
  }> {
    const response = await fetch(`${API_BASE}/meetings/schedule-with-calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to schedule meeting");
    }
    return response.json();
  },

  // EVA Ops Memory - Observation Sessions
  async createObservationSession(data: InsertObservationSession): Promise<ObservationSession> {
    const response = await fetch(`${API_BASE}/observation-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create observation session");
    return response.json();
  },

  async getObservationSession(id: string): Promise<ObservationSession> {
    const response = await fetch(`${API_BASE}/observation-sessions/${id}`);
    if (!response.ok) throw new Error("Failed to fetch observation session");
    return response.json();
  },

  async updateObservationSession(id: string, data: Partial<InsertObservationSession>): Promise<ObservationSession> {
    const response = await fetch(`${API_BASE}/observation-sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update observation session");
    return response.json();
  },

  async listObservationSessions(meetingId?: string): Promise<ObservationSession[]> {
    const params = meetingId ? `?meetingId=${meetingId}` : '';
    const response = await fetch(`${API_BASE}/observation-sessions${params}`);
    if (!response.ok) throw new Error("Failed to list observation sessions");
    return response.json();
  },

  // Observations
  async createObservation(sessionId: string, data: Omit<InsertObservation, "sessionId">): Promise<Observation> {
    const response = await fetch(`${API_BASE}/observation-sessions/${sessionId}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create observation");
    return response.json();
  },

  async getObservations(sessionId: string): Promise<Observation[]> {
    const response = await fetch(`${API_BASE}/observation-sessions/${sessionId}/observations`);
    if (!response.ok) throw new Error("Failed to fetch observations");
    return response.json();
  },

  // Clarifications
  async createClarification(sessionId: string, data: Omit<InsertClarification, "sessionId">): Promise<Clarification> {
    const response = await fetch(`${API_BASE}/observation-sessions/${sessionId}/clarifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create clarification");
    return response.json();
  },

  async getClarifications(sessionId: string): Promise<Clarification[]> {
    const response = await fetch(`${API_BASE}/observation-sessions/${sessionId}/clarifications`);
    if (!response.ok) throw new Error("Failed to fetch clarifications");
    return response.json();
  },

  async answerClarification(id: string, answer: string): Promise<Clarification> {
    const response = await fetch(`${API_BASE}/clarifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    if (!response.ok) throw new Error("Failed to answer clarification");
    return response.json();
  },

  // SOPs
  async createSop(data: InsertSop): Promise<Sop> {
    const response = await fetch(`${API_BASE}/sops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create SOP");
    return response.json();
  },

  async getSop(id: string): Promise<Sop> {
    const response = await fetch(`${API_BASE}/sops/${id}`);
    if (!response.ok) throw new Error("Failed to fetch SOP");
    return response.json();
  },

  async listSops(status?: string): Promise<Sop[]> {
    const params = status ? `?status=${status}` : '';
    const response = await fetch(`${API_BASE}/sops${params}`);
    if (!response.ok) throw new Error("Failed to list SOPs");
    return response.json();
  },

  async updateSop(id: string, data: Partial<InsertSop>): Promise<Sop> {
    const response = await fetch(`${API_BASE}/sops/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update SOP");
    return response.json();
  },

  async generateSopFromSession(sessionId: string): Promise<Sop> {
    const response = await fetch(`${API_BASE}/observation-sessions/${sessionId}/generate-sop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to generate SOP" }));
      throw new Error(error.error || "Failed to generate SOP");
    }
    return response.json();
  },
};
