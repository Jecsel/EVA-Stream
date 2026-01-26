import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const DEFAULT_SYSTEM_PROMPT = `You are EVA Ops Memory, an AI assistant that captures how work is actually done. Your role is to:

1. Observe and understand user intent, not just clicks and actions
2. Identify decision points, exceptions, and conditional logic in processes
3. Generate structured, decision-based SOPs that capture real workflows
4. Ask clarifying questions when intent or conditions are unclear

When responding:
- Focus on INTENT and DECISIONS, not just step-by-step actions
- Always identify IF/THEN conditions and branch points
- Note exceptions and edge cases mentioned
- Be concise and professional

If generating an SOP, use this decision-based structure:
## Goal:
[What this process achieves]

## When to Use:
[Trigger conditions for this SOP]

## Who Performs:
[Roles responsible]

## Tools Required:
[List of applications/tools needed]

## Main Flow:
1. [First step]
2. [Second step]
...

## Decision Points:
- If [condition X] → do [action Y]
- If [condition Z] → escalate to [person/role]

## Exceptions:
- [Edge case A]: [how to handle]
- [Edge case B]: [how to handle]

## Quality Check:
[How to verify this was done correctly]

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

export async function generateSOPFromTranscript(
  transcriptText: string,
  meetingTitle?: string
): Promise<string> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return "";
    }

    const prompt = `Based on the following meeting transcript, generate a decision-based SOP (Standard Operating Procedure) document.

Meeting Title: ${meetingTitle || "Meeting"}

Transcript:
${transcriptText.slice(0, 30000)}

Generate a well-formatted SOP document in Markdown format using this DECISION-BASED structure:

## Goal:
[What this process aims to achieve - infer from discussion]

## When to Use:
[Trigger conditions or situations when this SOP applies]

## Who Performs:
[Roles responsible - identify from participants/mentions]

## Tools Required:
[Applications, systems, or tools mentioned]

## Main Flow:
1. [First step with action verb]
2. [Second step]
... [Keep to 5-10 key steps maximum]

## Decision Points:
[CRITICAL: Extract all IF/THEN conditions mentioned]
- If [condition X] → do [action Y]
- If [condition Z] → escalate to [person/role]
- If [scenario] → [alternative action]

## Exceptions:
[Edge cases, what-ifs, unusual situations mentioned]
- [Exception case]: [how to handle]

## Quality Check:
[How to verify this was done correctly - success criteria mentioned]

IMPORTANT:
- Focus on DECISIONS and CONDITIONS, not just linear steps
- If no decision points were discussed, note "Decision points not captured - clarification needed"
- Identify any unclear areas that need human clarification
- This is a DRAFT SOP that needs human review`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "";
  } catch (error) {
    console.error("Gemini SOP from transcript error:", error);
    return "";
  }
}

export interface ClarificationQuestion {
  question: string;
  category: string;
}

export async function generateClarificationQuestions(
  observations: { type: string; content: string; action?: string }[],
  existingClarifications: string[]
): Promise<ClarificationQuestion[]> {
  try {
    if (!process.env.GEMINI_API_KEY || observations.length === 0) {
      return [];
    }

    const observationsText = observations
      .map(o => `[${o.type}] ${o.content}${o.action ? ` (Action: ${o.action})` : ''}`)
      .join("\n");

    const existingText = existingClarifications.length > 0
      ? `\nAlready asked questions:\n${existingClarifications.map(q => `- ${q}`).join("\n")}`
      : "";

    const prompt = `You are EVA Ops Memory analyzing workflow observations. Generate 1-3 clarification questions that would help create a more accurate SOP.

Observations:
${observationsText}
${existingText}

Generate questions that:
1. Clarify whether steps are mandatory or optional
2. Identify what happens in exception cases
3. Determine who approves or escalates decisions
4. Understand conditions that trigger different paths

DO NOT repeat questions already asked.

Respond in JSON format:
{
  "questions": [
    {"question": "Is this step mandatory or optional?", "category": "mandatory_optional"},
    {"question": "What happens if the client doesn't respond?", "category": "exception"},
    {"question": "Who approves this decision?", "category": "approval"}
  ]
}

Categories: mandatory_optional, condition, approval, exception, tool`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed.questions) ? parsed.questions : [];
    }

    return [];
  } catch (error) {
    console.error("Gemini clarification generation error:", error);
    return [];
  }
}

export interface DecisionBasedSOP {
  goal: string;
  whenToUse: string;
  whoPerforms: string;
  toolsRequired: string[];
  mainFlow: { step: number; action: string; details?: string }[];
  decisionPoints: { condition: string; action: string }[];
  exceptions: { case: string; handling: string }[];
  qualityCheck: string;
  lowConfidenceSections: string[];
  assumptions: string[];
}

export async function generateDecisionBasedSOP(
  observations: { type: string; content: string; app?: string; action?: string }[],
  clarifications: { question: string; answer?: string }[],
  title: string
): Promise<DecisionBasedSOP> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return getEmptySOP();
    }

    const observationsText = observations
      .map(o => `[${o.type}]${o.app ? ` App: ${o.app}` : ''} ${o.content}`)
      .join("\n");

    const clarificationsText = clarifications
      .filter(c => c.answer)
      .map(c => `Q: ${c.question}\nA: ${c.answer}`)
      .join("\n\n");

    const unansweredQuestions = clarifications
      .filter(c => !c.answer)
      .map(c => c.question);

    const prompt = `Generate a structured, decision-based SOP from these observations and clarifications.

SOP Title: ${title}

Observations:
${observationsText}

${clarificationsText ? `Clarifications:\n${clarificationsText}` : ''}

${unansweredQuestions.length > 0 ? `Unanswered questions (note as assumptions):\n${unansweredQuestions.join("\n")}` : ''}

Generate a structured SOP in JSON format:
{
  "goal": "What this process achieves",
  "whenToUse": "Trigger conditions",
  "whoPerforms": "Role responsible",
  "toolsRequired": ["Tool 1", "Tool 2"],
  "mainFlow": [
    {"step": 1, "action": "First action", "details": "Optional details"}
  ],
  "decisionPoints": [
    {"condition": "If X happens", "action": "Do Y"}
  ],
  "exceptions": [
    {"case": "Exception case", "handling": "How to handle"}
  ],
  "qualityCheck": "How to verify correctness",
  "lowConfidenceSections": ["Section 1 - reason for low confidence"],
  "assumptions": ["Assumption made due to missing info"]
}

CRITICAL:
- Decision points are REQUIRED - extract all IF/THEN logic
- If no decisions found, flag in lowConfidenceSections
- List any assumptions you made
- Keep mainFlow to 5-10 steps max`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        goal: parsed.goal || "",
        whenToUse: parsed.whenToUse || "",
        whoPerforms: parsed.whoPerforms || "",
        toolsRequired: Array.isArray(parsed.toolsRequired) ? parsed.toolsRequired : [],
        mainFlow: Array.isArray(parsed.mainFlow) ? parsed.mainFlow : [],
        decisionPoints: Array.isArray(parsed.decisionPoints) ? parsed.decisionPoints : [],
        exceptions: Array.isArray(parsed.exceptions) ? parsed.exceptions : [],
        qualityCheck: parsed.qualityCheck || "",
        lowConfidenceSections: Array.isArray(parsed.lowConfidenceSections) ? parsed.lowConfidenceSections : [],
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      };
    }

    return getEmptySOP();
  } catch (error) {
    console.error("Gemini decision-based SOP error:", error);
    return getEmptySOP();
  }
}

function getEmptySOP(): DecisionBasedSOP {
  return {
    goal: "",
    whenToUse: "",
    whoPerforms: "",
    toolsRequired: [],
    mainFlow: [],
    decisionPoints: [],
    exceptions: [],
    qualityCheck: "",
    lowConfidenceSections: ["Unable to generate - insufficient observations"],
    assumptions: [],
  };
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

const DEFAULT_NOTETAKER_PROMPT = `You are a meeting NoteTaker assistant. Analyze the transcript segments provided and generate concise meeting notes.

Your notes should include:
1. Key discussion points - Main topics being discussed
2. Decisions made - Any conclusions or agreements reached
3. Action items - Tasks assigned or next steps mentioned
4. Important quotes or statements

Keep notes organized, clear, and actionable. Format using Markdown with appropriate headers and bullet points.`;

export interface MeetingNote {
  content: string;
  keyPoints: string[];
  actionItems: string[];
}

export async function generateMeetingNotes(
  transcripts: { speaker: string; text: string; timestamp?: Date }[],
  existingNotes: string,
  customSystemPrompt?: string
): Promise<MeetingNote> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        content: existingNotes || "Notes will appear here once transcription begins.",
        keyPoints: [],
        actionItems: [],
      };
    }

    if (transcripts.length === 0) {
      return {
        content: existingNotes || "Waiting for meeting discussion...",
        keyPoints: [],
        actionItems: [],
      };
    }

    const transcriptText = transcripts
      .map(t => `${t.speaker}: ${t.text}`)
      .join("\n")
      .slice(0, 4000); // Cap transcript text to avoid overly large prompts

    const systemPrompt = customSystemPrompt || DEFAULT_NOTETAKER_PROMPT;

    const prompt = `${systemPrompt}

${existingNotes ? `Previous Notes:\n${existingNotes}\n\n` : ""}New Transcript Segments:
${transcriptText}

Generate updated meeting notes incorporating the new transcript segments. Include:
1. Updated key discussion points
2. Any new decisions or action items
3. Notable quotes or statements

Respond in the following JSON format:
{
  "content": "Full updated notes in Markdown format",
  "keyPoints": ["key point 1", "key point 2", ...],
  "actionItems": ["action 1", "action 2", ...]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "";
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          content: parsed.content || existingNotes,
          keyPoints: parsed.keyPoints || [],
          actionItems: parsed.actionItems || [],
        };
      }
    } catch (parseError) {
      console.error("Failed to parse NoteTaker response as JSON, using raw text:", parseError);
      return {
        content: text,
        keyPoints: [],
        actionItems: [],
      };
    }

    return {
      content: text || existingNotes,
      keyPoints: [],
      actionItems: [],
    };
  } catch (error) {
    console.error("Gemini NoteTaker error:", error);
    return {
      content: existingNotes || "Error generating notes.",
      keyPoints: [],
      actionItems: [],
    };
  }
}
