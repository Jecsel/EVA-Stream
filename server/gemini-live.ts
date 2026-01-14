import { GoogleGenAI, Modality } from "@google/genai";
import { WebSocket as WS } from "ws";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `You are EVA, an AI SOP (Standard Operating Procedure) Assistant participating in a video meeting. 

Your capabilities:
- You can see the shared screen content
- You can hear the conversation
- You help document and create SOPs during meetings
- You provide real-time analysis and suggestions

When you observe something important:
- Point out key information on shared screens
- Suggest SOP entries when processes are discussed
- Answer questions about what you see
- Keep responses concise and actionable

Format SOP updates with "## SOP Update:" prefix when documenting new procedures.`;

interface LiveSession {
  isActive: boolean;
  sessionId: string;
  lastActivity: number;
}

const activeSessions = new Map<string, LiveSession>();

export interface GeminiLiveMessage {
  type: "audio" | "video" | "text" | "control";
  data?: string; // base64 for audio/video, text for messages
  mimeType?: string;
  command?: "start" | "stop" | "ping";
  meetingId?: string;
}

export interface GeminiLiveResponse {
  type: "text" | "audio" | "sop_update" | "error" | "status";
  content: string;
  audioData?: string; // base64 audio
}

export async function processLiveInput(
  meetingId: string,
  message: GeminiLiveMessage
): Promise<GeminiLiveResponse> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        type: "error",
        content: "Gemini API key not configured",
      };
    }

    // Handle control messages
    if (message.type === "control") {
      if (message.command === "start") {
        activeSessions.set(meetingId, {
          isActive: true,
          sessionId: meetingId,
          lastActivity: Date.now(),
        });
        return {
          type: "status",
          content: "EVA is now observing the meeting",
        };
      }
      if (message.command === "stop") {
        activeSessions.delete(meetingId);
        return {
          type: "status",
          content: "EVA has stopped observing",
        };
      }
      if (message.command === "ping") {
        const session = activeSessions.get(meetingId);
        if (session) {
          session.lastActivity = Date.now();
        }
        return {
          type: "status",
          content: "pong",
        };
      }
    }

    // Process video frame (screen capture)
    if (message.type === "video" && message.data) {
      const contents = [
        {
          inlineData: {
            data: message.data,
            mimeType: message.mimeType || "image/jpeg",
          },
        },
        `You are EVA, the AI meeting assistant. Analyze this screen capture from a video meeting.
         
If you see:
- Code: Briefly describe what the code does and any issues you notice
- Documents: Summarize key points
- Diagrams/Charts: Describe what they show
- Presentations: Extract main points
- UI/Design: Comment on the layout and usability

Keep your response under 100 words. Only respond if you see something meaningful.
If it's just a video call interface with no shared content, respond with just: "[Observing meeting]"`,
      ];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
      });

      const text = response.text || "[Observing meeting]";
      
      // Check for SOP update markers
      let sopUpdate: string | undefined;
      const sopMatch = text.match(/## SOP Update:([\s\S]*?)(?=\n## |$)/);
      if (sopMatch) {
        sopUpdate = sopMatch[1].trim();
      }

      if (sopUpdate) {
        return {
          type: "sop_update",
          content: text.replace(/## SOP Update:[\s\S]*?(?=\n## |$)/, "").trim(),
        };
      }

      return {
        type: "text",
        content: text,
      };
    }

    // Process text message
    if (message.type === "text" && message.data) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${SYSTEM_INSTRUCTION}\n\nUser message: ${message.data}`,
      });

      return {
        type: "text",
        content: response.text || "I couldn't process that message.",
      };
    }

    return {
      type: "status",
      content: "Message received",
    };
  } catch (error) {
    console.error("Gemini Live processing error:", error);
    return {
      type: "error",
      content: "Failed to process input",
    };
  }
}

export function isSessionActive(meetingId: string): boolean {
  const session = activeSessions.get(meetingId);
  if (!session) return false;
  
  // Session expires after 10 minutes of inactivity
  const TEN_MINUTES = 10 * 60 * 1000;
  if (Date.now() - session.lastActivity > TEN_MINUTES) {
    activeSessions.delete(meetingId);
    return false;
  }
  
  return session.isActive;
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}
