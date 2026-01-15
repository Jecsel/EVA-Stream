import { storage } from "./storage";
import { openai } from "./replit_integrations/audio/client";
import { speechToText } from "./replit_integrations/audio/client";
import type { SopDocument, SopVersion, TranscriptSegment, ChatMessage } from "@shared/schema";

const EVA_SYSTEM_PROMPT = `You are EVA, an AI SOP (Standard Operating Procedure) Assistant integrated into a video meeting platform. Your role is to:

1. Help users document and create SOPs during meetings
2. Analyze discussions and extract key action items
3. Provide context-aware assistance based on the meeting topic
4. Generate clear, structured documentation

When responding:
- Be concise and professional
- Focus on actionable insights
- Structure information clearly with bullet points when appropriate
- If asked to update the SOP, include a section marked with "## SOP Update:" that contains the new content to add

Current meeting context will be provided with each message.`;

const SOP_ANALYSIS_PROMPT = `You are EVA, an AI SOP generator. Analyze the following meeting transcript and current SOP to generate an updated SOP.

Your task:
1. Extract key procedures, steps, and decisions discussed
2. Identify action items and responsibilities
3. Generate a well-structured SOP in markdown format
4. Include a mermaid flowchart if the process has clear sequential steps

Output format:
- Return JSON with "content" (markdown SOP) and "mermaidDiagram" (optional flowchart) and "changeSummary" (brief description of changes)
- The mermaid diagram should use flowchart TD syntax
- Keep the existing SOP structure when adding new information`;

interface SessionState {
  meetingId: string;
  sopDocumentId: string | null;
  transcriptBuffer: string[];
  lastAnalysisTime: number;
  isAnalyzing: boolean;
}

const activeSessions = new Map<string, SessionState>();

export async function initializeSession(meetingId: string): Promise<SessionState> {
  let sopDoc = await storage.getSopDocumentByMeeting(meetingId);
  
  if (!sopDoc) {
    const meeting = await storage.getMeeting(meetingId);
    sopDoc = await storage.createSopDocument({
      meetingId,
      title: meeting?.title ? `SOP: ${meeting.title}` : "Meeting SOP",
      currentVersionId: null
    });
    
    await storage.createSopVersion({
      documentId: sopDoc.id,
      versionNumber: "1",
      content: "# Standard Operating Procedure\n\n*SOP will be generated as the meeting progresses...*\n",
      mermaidDiagram: null,
      changeSummary: "Initial SOP document created",
      createdBy: "EVA"
    });
  }

  const state: SessionState = {
    meetingId,
    sopDocumentId: sopDoc.id,
    transcriptBuffer: [],
    lastAnalysisTime: Date.now(),
    isAnalyzing: false
  };

  activeSessions.set(meetingId, state);
  return state;
}

export function getSession(meetingId: string): SessionState | undefined {
  return activeSessions.get(meetingId);
}

export function endSession(meetingId: string): void {
  activeSessions.delete(meetingId);
}

export async function transcribeAudio(audioBuffer: Buffer, format: "wav" | "mp3" | "webm" = "wav"): Promise<string> {
  try {
    const transcript = await speechToText(audioBuffer, format);
    return transcript;
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}

export async function addTranscriptSegment(
  meetingId: string,
  text: string,
  speaker: string = "User"
): Promise<TranscriptSegment> {
  const segment = await storage.createTranscriptSegment({
    meetingId,
    speaker,
    text,
    isFinal: true
  });

  const session = activeSessions.get(meetingId);
  if (session) {
    session.transcriptBuffer.push(`${speaker}: ${text}`);
    
    if (session.transcriptBuffer.length >= 5 && !session.isAnalyzing) {
      const timeSinceLastAnalysis = Date.now() - session.lastAnalysisTime;
      if (timeSinceLastAnalysis > 30000) {
        analyzeAndUpdateSOP(meetingId).catch(console.error);
      }
    }
  }

  return segment;
}

export interface ChatResponse {
  message: string;
  sopUpdate?: string;
}

export async function chat(
  meetingId: string,
  userMessage: string,
  context?: string
): Promise<ChatResponse> {
  try {
    const meeting = await storage.getMeeting(meetingId);
    const recentTranscripts = await storage.getTranscriptsByMeeting(meetingId);
    const transcriptContext = recentTranscripts
      .slice(-10)
      .map(t => `${t.speaker}: ${t.text}`)
      .join("\n");

    const fullContext = `
Meeting: ${meeting?.title || "Unknown"}
Recent Discussion:
${transcriptContext}
${context ? `\nAdditional Context: ${context}` : ""}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: EVA_SYSTEM_PROMPT },
        { role: "user", content: `${fullContext}\n\nUser Message: ${userMessage}` }
      ],
      max_tokens: 1000
    });

    const text = response.choices[0]?.message?.content || "I couldn't generate a response.";
    
    let message = text;
    let sopUpdate: string | undefined;
    
    const sopUpdateMatch = text.match(/## SOP Update:([\s\S]*?)(?=\n## |$)/);
    if (sopUpdateMatch) {
      sopUpdate = sopUpdateMatch[1].trim();
      message = text.replace(/## SOP Update:[\s\S]*?(?=\n## |$)/, '').trim();
    }

    await storage.createChatMessage({
      meetingId,
      role: "user",
      content: userMessage,
      context: context || null
    });

    await storage.createChatMessage({
      meetingId,
      role: "ai",
      content: message,
      context: null
    });

    if (sopUpdate) {
      await appendToSOP(meetingId, sopUpdate, "Chat-based update");
    }

    return { message, sopUpdate };
  } catch (error) {
    console.error("Chat error:", error);
    return { message: "I encountered an error processing your request. Please try again." };
  }
}

export async function analyzeAndUpdateSOP(meetingId: string): Promise<SopVersion | null> {
  const session = activeSessions.get(meetingId);
  if (!session || session.isAnalyzing || !session.sopDocumentId) {
    return null;
  }

  session.isAnalyzing = true;
  session.lastAnalysisTime = Date.now();

  try {
    const transcripts = await storage.getTranscriptsByMeeting(meetingId);
    const currentVersion = await storage.getLatestSopVersion(session.sopDocumentId);
    
    const transcriptText = transcripts
      .map(t => `${t.speaker}: ${t.text}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: SOP_ANALYSIS_PROMPT + "\n\nIMPORTANT: Return your response as valid JSON with keys: content, mermaidDiagram, changeSummary" },
        { 
          role: "user", 
          content: `Current SOP:\n${currentVersion?.content || "Empty"}\n\nTranscript:\n${transcriptText}\n\nRespond with valid JSON only.`
        }
      ],
      max_tokens: 2000
    });

    const resultText = response.choices[0]?.message?.content || "{}";
    let result: { content?: string; mermaidDiagram?: string; changeSummary?: string };
    try {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      result = { content: resultText, changeSummary: "Auto-generated from analysis" };
    }

    if (result.content) {
      const currentVersionNumber = currentVersion?.versionNumber || "0";
      const currentNum = parseInt(currentVersionNumber, 10) || 0;
      const newVersionNumber = String(currentNum + 1);

      const newVersion = await storage.createSopVersion({
        documentId: session.sopDocumentId,
        versionNumber: newVersionNumber,
        content: result.content,
        mermaidDiagram: result.mermaidDiagram || null,
        changeSummary: result.changeSummary || "Automatic update from transcript analysis",
        createdBy: "EVA"
      });

      session.transcriptBuffer = [];
      return newVersion;
    }

    return null;
  } catch (error) {
    console.error("SOP analysis error:", error);
    return null;
  } finally {
    session.isAnalyzing = false;
  }
}

function getNextVersionNumber(currentVersionNumber: string | undefined): string {
  if (!currentVersionNumber) return "1";
  const currentNum = parseInt(currentVersionNumber, 10) || 0;
  return String(currentNum + 1);
}

async function appendToSOP(
  meetingId: string, 
  content: string, 
  changeSummary: string
): Promise<SopVersion | null> {
  const session = activeSessions.get(meetingId);
  if (!session?.sopDocumentId) {
    const sopDoc = await storage.getSopDocumentByMeeting(meetingId);
    if (!sopDoc) return null;
    
    const currentVersion = await storage.getLatestSopVersion(sopDoc.id);
    const newContent = currentVersion 
      ? `${currentVersion.content}\n\n${content}`
      : `# SOP\n\n${content}`;

    return storage.createSopVersion({
      documentId: sopDoc.id,
      versionNumber: getNextVersionNumber(currentVersion?.versionNumber),
      content: newContent,
      mermaidDiagram: currentVersion?.mermaidDiagram || null,
      changeSummary,
      createdBy: "EVA"
    });
  }

  const currentVersion = await storage.getLatestSopVersion(session.sopDocumentId);
  const newContent = currentVersion 
    ? `${currentVersion.content}\n\n${content}`
    : `# SOP\n\n${content}`;

  return storage.createSopVersion({
    documentId: session.sopDocumentId,
    versionNumber: getNextVersionNumber(currentVersion?.versionNumber),
    content: newContent,
    mermaidDiagram: currentVersion?.mermaidDiagram || null,
    changeSummary,
    createdBy: "EVA"
  });
}

export async function getSopDocument(meetingId: string): Promise<{
  document: SopDocument | null;
  currentVersion: SopVersion | null;
  versions: SopVersion[];
}> {
  const doc = await storage.getSopDocumentByMeeting(meetingId);
  if (!doc) {
    return { document: null, currentVersion: null, versions: [] };
  }

  const versions = await storage.getSopVersionsByDocument(doc.id);
  
  let currentVersion: SopVersion | null = null;
  if (doc.currentVersionId) {
    currentVersion = await storage.getSopVersion(doc.currentVersionId) || null;
  }
  if (!currentVersion && versions.length > 0) {
    currentVersion = versions[0];
  }

  return { document: doc, currentVersion, versions };
}

export async function rollbackSop(
  meetingId: string, 
  versionId: string
): Promise<SopDocument | null> {
  const doc = await storage.getSopDocumentByMeeting(meetingId);
  if (!doc) return null;

  const result = await storage.rollbackToVersion(doc.id, versionId);
  return result || null;
}
