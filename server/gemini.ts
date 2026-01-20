import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const DEFAULT_SYSTEM_PROMPT = `You are EVA, an AI SOP (Standard Operating Procedure) Assistant integrated into a video meeting platform. Your role is to:

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

export interface GeminiResponse {
  message: string;
  sopUpdate?: string;
}

export async function analyzeChat(
  userMessage: string,
  meetingContext: string,
  isScreenSharing: boolean,
  customSystemPrompt?: string
): Promise<GeminiResponse> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        message: "Gemini API key not configured. Please add your GEMINI_API_KEY to use AI features.",
      };
    }

    const contextInfo = isScreenSharing 
      ? "The user is currently sharing their screen. Consider any visual context they may be referring to."
      : "No screen is currently being shared.";

    const systemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

    const prompt = `${systemPrompt}

Meeting Context: ${meetingContext}
Screen Sharing Status: ${contextInfo}

User Message: ${userMessage}

Please provide a helpful response. If the user is asking to document something or create an SOP entry, include a section starting with "## SOP Update:" followed by the formatted content to add to the SOP document.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "I couldn't generate a response. Please try again.";
    
    // Extract SOP update if present
    let message = text;
    let sopUpdate: string | undefined;
    
    const sopUpdateMatch = text.match(/## SOP Update:([\s\S]*?)(?=\n## |$)/);
    if (sopUpdateMatch) {
      sopUpdate = sopUpdateMatch[1].trim();
      message = text.replace(/## SOP Update:[\s\S]*?(?=\n## |$)/, '').trim();
    }

    return { message, sopUpdate };
  } catch (error) {
    console.error("Gemini API error:", error);
    return {
      message: "I encountered an error processing your request. Please try again.",
    };
  }
}

export async function generateSOPSummary(
  chatHistory: { role: string; content: string }[],
  existingSOP: string
): Promise<string> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return existingSOP;
    }

    const chatContext = chatHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n");

    const prompt = `Based on the following meeting chat history, generate an updated SOP document. 
Keep the existing structure and add any new information discussed.

Existing SOP:
${existingSOP}

Chat History:
${chatContext}

Generate a complete, well-formatted SOP document in Markdown format with clear headings and bullet points.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || existingSOP;
  } catch (error) {
    console.error("Gemini SOP generation error:", error);
    return existingSOP;
  }
}

export interface TranscriptionAnalysis {
  summary: string;
  actionItems: string[];
  keyTopics: string[];
}

const DEFAULT_FLOWCHART_PROMPT = `Convert the following SOP (Standard Operating Procedure) document into a Mermaid.js flowchart diagram.

Rules for the flowchart:
1. Use "graph TD" for top-down flow
2. Start with a circular Start node: Start(("Start Meeting"))
3. End with a circular End node: End(("End"))
4. Use rectangular nodes for main steps: StepN["Step description"]
5. Keep step labels short (max 4-5 words)
6. Extract only the main procedural steps, not every detail
7. Apply these styles:
   - Start node: style Start fill:#1967D2,stroke:none,color:#fff
   - End node: style End fill:#34A853,stroke:none,color:#fff
   - Step nodes: style StepN fill:#292A2D,stroke:#3c4043,color:#E8EAED
8. Connect nodes with arrows: NodeA --> NodeB
9. Maximum 8-10 steps to keep the flowchart readable
10. Return ONLY the Mermaid code, no explanations or markdown code blocks`;

const DEFAULT_TRANSCRIPTION_PROMPT = `Analyze the following meeting transcription and provide:
1. A concise summary (2-3 paragraphs)
2. A list of action items mentioned
3. Key topics discussed

Respond in the following JSON format:
{
  "summary": "...",
  "actionItems": ["action 1", "action 2", ...],
  "keyTopics": ["topic 1", "topic 2", ...]
}`;

export async function generateMermaidFlowchart(
  sopContent: string,
  customPrompt?: string
): Promise<string> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return 'graph TD\n    Start(("Start"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> End';
    }

    const flowchartInstructions = customPrompt || DEFAULT_FLOWCHART_PROMPT;

    const prompt = `${flowchartInstructions}

SOP Content:
${sopContent.slice(0, 8000)}

Generate the Mermaid flowchart code:`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let mermaidCode = response.text || "";
    
    // Clean up the response - remove markdown code blocks if present
    mermaidCode = mermaidCode.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Validate that we have a basic mermaid structure
    if (!mermaidCode.includes('graph') && !mermaidCode.includes('flowchart')) {
      // Fallback to basic structure
      return 'graph TD\n    Start(("Start"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> End';
    }

    return mermaidCode;
  } catch (error) {
    console.error("Gemini Mermaid generation error:", error);
    return 'graph TD\n    Start(("Start"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    Error["Error generating flowchart"]\n    style Error fill:#EA4335,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> Error --> End';
  }
}

export interface RecordingTranscript {
  fullTranscript: string;
  segments: {
    speaker: string;
    timestamp: string;
    text: string;
  }[];
  summary: string;
  actionItems: string[];
  keyTopics: string[];
}

export async function transcribeRecording(
  videoUrl: string,
  meetingTitle?: string
): Promise<RecordingTranscript> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        fullTranscript: "",
        segments: [],
        summary: "Transcription unavailable (no API key configured).",
        actionItems: [],
        keyTopics: [],
      };
    }

    console.log(`Starting AI transcription for recording: ${meetingTitle || "Unknown"}`);
    console.log(`Video URL: ${videoUrl.substring(0, 100)}...`);

    const prompt = `You are a professional transcription service. Transcribe this video/audio recording with the following requirements:

1. **Speaker Identification**: Identify different speakers as "Speaker 1", "Speaker 2", etc. If you can identify names from context, use those instead.
2. **Timestamps**: Provide approximate timestamps in MM:SS format for each speaker change.
3. **Accuracy**: Transcribe speech accurately, including filler words only if significant.
4. **Structure**: Format as a natural conversation with clear speaker labels.

After the transcription, also provide:
- A concise summary (2-3 paragraphs)
- Key action items mentioned
- Main topics discussed

Meeting Title: ${meetingTitle || "Unknown Meeting"}

Respond in the following JSON format:
{
  "fullTranscript": "Complete transcription as continuous text with speaker labels",
  "segments": [
    {"speaker": "Speaker 1", "timestamp": "00:00", "text": "What they said..."},
    {"speaker": "Speaker 2", "timestamp": "00:15", "text": "Their response..."}
  ],
  "summary": "Meeting summary...",
  "actionItems": ["Action 1", "Action 2"],
  "keyTopics": ["Topic 1", "Topic 2"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              fileData: {
                fileUri: videoUrl,
                mimeType: videoUrl.includes(".mp4") ? "video/mp4" : 
                         videoUrl.includes(".webm") ? "video/webm" :
                         videoUrl.includes(".mp3") ? "audio/mpeg" :
                         videoUrl.includes(".wav") ? "audio/wav" :
                         "video/mp4"
              }
            },
            {
              text: prompt
            }
          ]
        }
      ]
    });

    const text = response.text || "";
    console.log(`Received transcription response: ${text.substring(0, 200)}...`);
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          fullTranscript: parsed.fullTranscript || "",
          segments: Array.isArray(parsed.segments) ? parsed.segments : [],
          summary: parsed.summary || "No summary generated.",
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
        };
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
      }
    }

    // Fallback: treat entire response as transcript
    return {
      fullTranscript: text,
      segments: [{ speaker: "Speaker", timestamp: "00:00", text }],
      summary: "Transcription complete.",
      actionItems: [],
      keyTopics: [],
    };
  } catch (error) {
    console.error("Gemini recording transcription error:", error);
    return {
      fullTranscript: "",
      segments: [],
      summary: "Error transcribing recording.",
      actionItems: [],
      keyTopics: [],
    };
  }
}

export async function analyzeTranscription(
  transcriptText: string,
  meetingTitle?: string,
  customPrompt?: string
): Promise<TranscriptionAnalysis> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        summary: "Transcription received but AI analysis unavailable (no API key configured).",
        actionItems: [],
        keyTopics: [],
      };
    }

    const transcriptionInstructions = customPrompt || DEFAULT_TRANSCRIPTION_PROMPT;

    const prompt = `${transcriptionInstructions}

Meeting Title: ${meetingTitle || "Unknown Meeting"}

Transcription:
${transcriptText.slice(0, 30000)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "";
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || "No summary generated.",
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
      };
    }

    return {
      summary: text || "Transcription analysis complete.",
      actionItems: [],
      keyTopics: [],
    };
  } catch (error) {
    console.error("Gemini transcription analysis error:", error);
    return {
      summary: "Error analyzing transcription.",
      actionItems: [],
      keyTopics: [],
    };
  }
}
