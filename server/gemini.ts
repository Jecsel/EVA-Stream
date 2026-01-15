import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_PROMPT = `You are EVA, an AI SOP (Standard Operating Procedure) Assistant integrated into a video meeting platform. Your role is to:

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
  isScreenSharing: boolean
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

    const prompt = `${SYSTEM_PROMPT}

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

export async function generateMermaidFlowchart(
  sopContent: string
): Promise<string> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return 'graph TD\n    Start(("Start"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> End';
    }

    const prompt = `Convert the following SOP (Standard Operating Procedure) document into a Mermaid.js flowchart diagram.

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
10. Return ONLY the Mermaid code, no explanations or markdown code blocks

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

export async function analyzeTranscription(
  transcriptText: string,
  meetingTitle?: string
): Promise<TranscriptionAnalysis> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        summary: "Transcription received but AI analysis unavailable (no API key configured).",
        actionItems: [],
        keyTopics: [],
      };
    }

    const prompt = `Analyze the following meeting transcription and provide:
1. A concise summary (2-3 paragraphs)
2. A list of action items mentioned
3. Key topics discussed

Meeting Title: ${meetingTitle || "Unknown Meeting"}

Transcription:
${transcriptText.slice(0, 30000)}

Respond in the following JSON format:
{
  "summary": "...",
  "actionItems": ["action 1", "action 2", ...],
  "keyTopics": ["topic 1", "topic 2", ...]
}`;

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
