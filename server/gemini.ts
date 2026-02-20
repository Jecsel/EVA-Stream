import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const DEFAULT_SYSTEM_PROMPT = `You are EVA, an AI Meeting Assistant embedded in a live video conference.

Your primary role is to help participants understand, track, and reflect on the meeting.
You are NOT a general chatbot and NOT a passive transcriber.

You must follow these rules strictly:

GENERAL BEHAVIOR
- Be concise, clear, and practical.
- Use simple, everyday language.
- Avoid filler, hype, or long explanations unless explicitly requested.
- Prefer short, structured answers.
- If information is uncertain or missing, say so plainly.

MEETING CONTEXT AWARENESS
You have access to:
- Live meeting conversation (audio-to-text)
- The meeting agenda
- Uploaded documents or files
- Explicit notes saved during the meeting

You must always ground your responses in:
1. The agenda
2. What has actually been discussed
3. Uploaded documents
4. Saved notes

Never hallucinate details that were not discussed or provided.

VOICE INTERACTION
You may be activated by:
- Voice command: "Hey EVA"
- Direct user message

When responding by voice:
- Be calm and professional.
- Do not interrupt ongoing discussion.
- Keep spoken responses brief unless the user asks for detail.

NOTES HANDLING
- Do NOT take notes automatically.
- Only create notes when explicitly instructed using phrases like:
  "take note of this"
  "add this to notes"
  "mark this as important"

When taking a note:
- Capture the core idea only.
- Include timestamp and speaker if available.
- Do not rewrite or summarize unless asked.

MEETING QUESTIONS YOU SHOULD HANDLE WELL
You are expected to answer questions such as:
- "What is this meeting about?"
- "What are we trying to decide today?"
- "What have we discussed so far?"
- "What do we need to discuss again?"
- "Did we miss anything important?"
- "Which agenda items were not covered?"
- "Were there any unresolved questions?"

AGENDA AWARENESS
- Treat the agenda as the meeting's source of truth.
- Track which agenda items were discussed, partially discussed, or not discussed.
- Clearly identify gaps between the agenda and the conversation when asked.

DOCUMENT AWARENESS
When documents are uploaded:
- Read and understand their content.
- Connect discussion points to relevant document sections.
- Identify important document topics that were not discussed if asked.
- Never invent document content.

SUMMARY GENERATION
At the end of the meeting, generate a meeting summary that includes:
- Meeting purpose
- Key topics discussed
- Decisions made
- Open or unresolved items
- Agenda items not covered

Keep summaries clean, neutral, and factual.
No opinions. No speculation.

FAIL-SAFE BEHAVIOR
- If a question cannot be answered based on available data, say:
  "That wasn't discussed in the meeting."
- If a request is unclear, ask one short clarification question.
- Never guess.`;

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

Respond based on your role as EVA, the meeting assistant. Ground your response in the meeting context provided.`;

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
  title: string,
  conversationContext?: { role: string; content: string; speaker?: string }[]
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

    // Format conversation context from Meeting Assistant
    const conversationText = conversationContext && conversationContext.length > 0
      ? conversationContext.map(c => {
          const speaker = c.speaker || (c.role === 'user' ? 'User' : 'AI');
          return `${speaker}: ${c.content}`;
        }).join("\n")
      : '';

    const prompt = `Generate a structured, decision-based SOP by combining SCREEN OBSERVATIONS (what was done visually) with MEETING CONVERSATION (why it was done and explanations).

SOP Title: ${title}

=== SCREEN OBSERVATIONS (Visual Actions) ===
${observationsText || 'No screen observations captured'}

${conversationText ? `=== MEETING CONVERSATION (Context & Explanations) ===
${conversationText}` : ''}

${clarificationsText ? `=== CLARIFICATIONS ===
${clarificationsText}` : ''}

${unansweredQuestions.length > 0 ? `Unanswered questions (note as assumptions):\n${unansweredQuestions.join("\n")}` : ''}

IMPORTANT: 
- Combine insights from BOTH screen observations AND conversation context
- Use screen observations for the "HOW" (specific steps, clicks, actions)
- Use conversation context for the "WHY" (reasoning, decisions, purpose)
- Include verbal explanations and reasoning from the conversation in step details

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
  meetingTitle?: string,
  onStatus?: (status: string) => void
): Promise<RecordingTranscript> {
  const emitStatus = onStatus || (() => {});
  try {
    console.log(`Starting Whisper+Gemini transcription for recording: ${meetingTitle || "Unknown"}`);
    console.log(`Video URL: ${videoUrl.substring(0, 100)}...`);

    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const { spawn } = await import("child_process");

    const tempVideoPath = path.join(os.tmpdir(), `whisper-video-${Date.now()}.mp4`);
    const tempAudioPath = path.join(os.tmpdir(), `whisper-audio-${Date.now()}.wav`);
    const tempChunkDir = path.join(os.tmpdir(), `whisper-chunks-${Date.now()}`);
    const tempFiles = [tempVideoPath, tempAudioPath];

    try {
      // Step 1: Download video
      emitStatus("Downloading video recording...");
      console.log(`[Transcription] Downloading video...`);

      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      }

      const fileStream = fs.createWriteStream(tempVideoPath);
      const reader = videoResponse.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response body reader");
      }
      let bytesWritten = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
        bytesWritten += value.byteLength;
      }
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
        fileStream.end();
      });

      const fileSizeMB = (bytesWritten / (1024 * 1024)).toFixed(1);
      console.log(`[Transcription] Video downloaded: ${fileSizeMB}MB`);
      emitStatus(`Video downloaded (${fileSizeMB}MB). Extracting audio...`);

      // Step 2: Extract audio to WAV using ffmpeg
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
          "-i", tempVideoPath,
          "-vn",
          "-f", "wav",
          "-ar", "16000",
          "-ac", "1",
          "-acodec", "pcm_s16le",
          "-y",
          tempAudioPath,
        ]);
        ffmpeg.stderr.on("data", () => {});
        ffmpeg.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg audio extraction failed with code ${code}`));
        });
        ffmpeg.on("error", reject);
      });

      if (!fs.existsSync(tempAudioPath)) {
        throw new Error("Audio extraction failed - no output file");
      }

      const audioBuffer = fs.readFileSync(tempAudioPath);
      const audioSizeMB = audioBuffer.length / (1024 * 1024);
      console.log(`[Transcription] Audio extracted: ${audioSizeMB.toFixed(1)}MB`);
      emitStatus(`Audio extracted (${audioSizeMB.toFixed(1)}MB). Transcribing with Whisper...`);

      // Step 3: Transcribe with Whisper (chunk if > 24MB)
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
        throw new Error("OpenAI API key not configured. Whisper transcription requires OpenAI credentials.");
      }

      const CHUNK_SIZE_MB = 24;
      let fullWhisperTranscript = "";

      if (audioSizeMB <= CHUNK_SIZE_MB) {
        // Single chunk — send directly
        const { speechToText, ensureCompatibleFormat } = await import('./replit_integrations/audio/client');
        const { buffer: compatBuffer, format: compatFormat } = await ensureCompatibleFormat(audioBuffer);
        fullWhisperTranscript = await speechToText(compatBuffer, compatFormat);
        console.log(`[Transcription] Whisper transcription complete: ${fullWhisperTranscript.length} chars`);
      } else {
        // Split into chunks using ffmpeg
        fs.mkdirSync(tempChunkDir, { recursive: true });
        tempFiles.push(tempChunkDir);

        const chunkDurationSec = Math.floor((CHUNK_SIZE_MB / audioSizeMB) * (audioBuffer.length / (16000 * 2)));
        const safeDuration = Math.max(chunkDurationSec, 120);
        console.log(`[Transcription] Audio too large (${audioSizeMB.toFixed(1)}MB), splitting into ${safeDuration}s chunks...`);
        emitStatus(`Audio too large. Splitting into chunks for transcription...`);

        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn("ffmpeg", [
            "-i", tempAudioPath,
            "-f", "segment",
            "-segment_time", String(safeDuration),
            "-c", "copy",
            "-y",
            path.join(tempChunkDir, "chunk_%03d.wav"),
          ]);
          ffmpeg.stderr.on("data", () => {});
          ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg chunk split failed with code ${code}`));
          });
          ffmpeg.on("error", reject);
        });

        const chunkFiles = fs.readdirSync(tempChunkDir)
          .filter((f: string) => f.endsWith(".wav"))
          .sort();
        console.log(`[Transcription] Split into ${chunkFiles.length} chunks`);

        const { speechToText } = await import('./replit_integrations/audio/client');
        const transcriptParts: string[] = [];

        for (let i = 0; i < chunkFiles.length; i++) {
          emitStatus(`Transcribing chunk ${i + 1}/${chunkFiles.length}...`);
          const chunkBuffer = fs.readFileSync(path.join(tempChunkDir, chunkFiles[i]));
          const chunkText = await speechToText(chunkBuffer, "wav");
          transcriptParts.push(chunkText);
          console.log(`[Transcription] Chunk ${i + 1}/${chunkFiles.length}: ${chunkText.length} chars`);
        }

        fullWhisperTranscript = transcriptParts.join(" ");
        console.log(`[Transcription] Combined Whisper transcript: ${fullWhisperTranscript.length} chars`);
      }

      if (!fullWhisperTranscript || fullWhisperTranscript.trim().length === 0) {
        console.error(`[Transcription] Whisper returned empty transcript`);
        return {
          fullTranscript: "",
          segments: [],
          summary: "Error transcribing recording.",
          actionItems: [],
          keyTopics: [],
        };
      }

      emitStatus("Whisper transcription complete. Analyzing speakers and generating summary...");

      // Step 4: Use Gemini to add speaker labels, timestamps, summary, action items
      if (!process.env.GEMINI_API_KEY) {
        // No Gemini key — return raw Whisper transcript without speaker labels
        return {
          fullTranscript: fullWhisperTranscript,
          segments: [{ speaker: "Speaker", timestamp: "00:00", text: fullWhisperTranscript }],
          summary: "Transcription complete (speaker identification unavailable).",
          actionItems: [],
          keyTopics: [],
        };
      }

      const speakerPrompt = `You are a professional meeting analyst. Below is a raw transcript of a meeting. Your job is to:

1. **Speaker Identification (CRITICAL)**: Analyze the conversation flow and identify ALL distinct speakers. Look for:
   - Conversational turn-taking patterns (questions followed by answers from different people)
   - Different speaking styles, vocabulary, or roles (e.g., presenter vs. questioner)
   - Name mentions (if someone is addressed by name, use that name)
   - Contextual clues about who is speaking
   Label speakers as "Speaker 1", "Speaker 2", etc., or use names if identifiable. Most meetings have 2+ speakers.

2. **Timestamps**: Assign approximate timestamps (MM:SS) based on the flow and length of the conversation.

3. **Summary**: Write a concise 2-3 paragraph summary of the meeting.

4. **Action Items**: List any action items, tasks, or follow-ups mentioned.

5. **Key Topics**: List the main topics discussed.

Meeting Title: ${meetingTitle || "Unknown Meeting"}

Raw Transcript:
${fullWhisperTranscript.slice(0, 100000)}

Respond ONLY with valid JSON in this exact format:
{
  "fullTranscript": "Complete transcription with speaker labels as continuous text",
  "segments": [
    {"speaker": "Speaker 1", "timestamp": "00:00", "text": "What they said..."},
    {"speaker": "Speaker 2", "timestamp": "00:15", "text": "Their response..."}
  ],
  "summary": "Meeting summary...",
  "actionItems": ["Action 1", "Action 2"],
  "keyTopics": ["Topic 1", "Topic 2"]
}`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: speakerPrompt }] }],
      });

      const responseText = geminiResponse.text || "";
      console.log(`[Transcription] Gemini speaker analysis response: ${responseText.substring(0, 200)}...`);
      emitStatus("Parsing transcription results...");

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            fullTranscript: parsed.fullTranscript || fullWhisperTranscript,
            segments: Array.isArray(parsed.segments) ? parsed.segments : [],
            summary: parsed.summary || "No summary generated.",
            actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
            keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
          };
        } catch (parseError) {
          console.error("[Transcription] JSON parse error from Gemini speaker analysis:", parseError);
        }
      }

      // Fallback: return Whisper transcript without speaker labels
      return {
        fullTranscript: fullWhisperTranscript,
        segments: [{ speaker: "Speaker", timestamp: "00:00", text: fullWhisperTranscript }],
        summary: "Transcription complete.",
        actionItems: [],
        keyTopics: [],
      };
    } finally {
      // Clean up all temp files
      for (const f of tempFiles) {
        try {
          if (fs.existsSync(f)) {
            const stat = fs.statSync(f);
            if (stat.isDirectory()) {
              fs.rmSync(f, { recursive: true, force: true });
            } else {
              fs.unlinkSync(f);
            }
          }
        } catch (cleanupErr) {
          console.warn(`[Transcription] Failed to clean up ${f}:`, cleanupErr);
        }
      }
      console.log(`[Transcription] Cleaned up temp files`);
    }
  } catch (error) {
    console.error("Whisper+Gemini transcription error:", error);
    emitStatus("Transcription failed. Check video URL and try again.");
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

// Generate CRO (Core Role Objective) document from chat messages
// This is used as a fallback when real-time CRO generation didn't happen during the meeting
export async function generateCROFromChatMessages(
  chatMessages: Array<{ role: string; content: string }>,
  meetingTitle: string
): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY || chatMessages.length < 3) {
    console.log("[CRO Generation] Insufficient data or no API key");
    return null;
  }

  // Format chat messages as interview transcript
  const transcriptText = chatMessages
    .map(m => `${m.role === 'user' ? 'Business Owner' : 'CRO Agent'}: ${m.content}`)
    .join("\n");

  if (transcriptText.length < 100) {
    console.log("[CRO Generation] Transcript too short");
    return null;
  }

  const prompt = `You are a CRO Agent - a business discovery and role-definition expert.

## YOUR PURPOSE
Identify where the business owner is the bottleneck and define the core role objectives needed to remove that bottleneck.

## REQUIRED OUTPUT
Generate 3 ARTIFACTS in Markdown format:

### 1. Core Role Objective Document
- Role title
- One-sentence purpose
- Problem it solves
- Key responsibilities (3-5 bullet points)
- Tools/systems used
- Success criteria

### 2. Delegation Candidate List
Tasks the owner should delegate, grouped by:
- Administrative tasks
- Operational tasks
- Communication tasks

### 3. Process Identification List
Process NAMES only (no steps - that's the SOP Agent's job):
- List each process that was mentioned or implied
- Mark anything unclear with "⚠️"

---

## INPUT DATA

Meeting: ${meetingTitle}

### Interview Transcript:
${transcriptText}

---

## YOUR TASK
Analyze this CRO interview transcript and generate all 3 artifacts.
Focus on what the interviewee said about their role, pain points, and bottlenecks.
Do NOT infer or guess missing information - flag anything unclear with "⚠️".`;

  try {
    console.log("[CRO Generation] Generating from chat messages...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const croText = response.text;
    if (croText && croText.length > 100) {
      console.log(`[CRO Generation] Successfully generated ${croText.length} chars`);
      return croText;
    }
    return null;
  } catch (error) {
    console.error("[CRO Generation] Failed:", error);
    return null;
  }
}

const SCRUM_MASTER_SYSTEM_PROMPT = `You are an AI Scrum Master embedded in a live daily standup meeting.

Your primary role is to facilitate the standup, ensure it stays focused, and extract structured updates from each participant.

STANDUP FORMAT:
For each participant, track their answers to the three standup questions:
1. What did you work on yesterday / since last standup?
2. What are you working on today?
3. Are there any blockers or impediments?

BEHAVIOR RULES:
- Keep the standup focused and time-boxed
- Gently redirect off-topic discussions
- Identify and highlight blockers that need immediate attention
- Track action items that emerge from the discussion
- Note any decisions made during the standup
- If someone hasn't given their update, note it
- Be concise and practical in responses

BLOCKER AWARENESS:
- Flag blockers that are cross-team dependencies
- Identify blockers that have persisted across multiple standups
- Suggest escalation for high-severity blockers
- Track blocker resolution

ACTION ITEM TRACKING:
- Extract specific action items with owners
- Note any commitments or deadlines mentioned
- Flag unassigned action items

STANDUP CONTINUITY:
- When previous standup data is provided, compare today's updates against it
- Flag blockers that persist from the previous standup as "carry-over blockers"
- Note which previous action items were completed and which are still open
- Highlight new blockers that appeared since the last standup
- Track whether participants addressed what they planned to work on

FAIL-SAFE BEHAVIOR:
- If you can't determine who said what, note "Speaker unidentified"
- If an update is vague, flag it for clarification
- Never invent information that wasn't discussed`;

export interface ScrumSummaryResult {
  fullSummary: string;
  scrumData: {
    participants: Array<{
      name: string;
      yesterday: string[];
      today: string[];
      blockers: string[];
    }>;
    blockers: Array<{
      description: string;
      owner: string;
      severity: "low" | "medium" | "high";
      status: "active" | "resolved";
    }>;
    actionItems: Array<{
      title: string;
      assignee: string;
      priority: "low" | "medium" | "high";
      dueDate?: string;
    }>;
    teamMood?: string;
    sprintGoalProgress?: string;
  };
}

export async function generateScrumSummary(
  transcriptText: string,
  meetingTitle: string,
  chatMessages?: Array<{ role: string; content: string }>,
  customSystemPrompt?: string,
  previousStandupContext?: string
): Promise<ScrumSummaryResult | null> {
  if (!process.env.GEMINI_API_KEY) {
    console.log("[Scrum Summary] No API key");
    return null;
  }

  const chatText = chatMessages
    ? chatMessages.map(m => `${m.role}: ${m.content}`).join("\n")
    : "";

  const inputText = transcriptText || chatText;
  if (inputText.length < 20) {
    console.log("[Scrum Summary] Input too short");
    return null;
  }

  const systemPrompt = customSystemPrompt || SCRUM_MASTER_SYSTEM_PROMPT;

  const previousContext = previousStandupContext
    ? `\n### Previous Standup Summary:\n${previousStandupContext}\n`
    : "";

  const prompt = `${systemPrompt}

---

## INPUT DATA

Meeting: ${meetingTitle}
${previousContext}
### Today's Meeting Transcript / Chat:
${inputText.slice(0, 30000)}

---

## YOUR TASK
Analyze this standup meeting and generate a structured JSON summary.
${previousStandupContext ? `\nIMPORTANT - CONTINUITY FROM PREVIOUS STANDUP:
- Compare today's updates against what was discussed in the previous standup
- Flag any blockers from the previous standup that are still unresolved
- Note which action items from the previous standup were completed vs. still open
- Highlight any new blockers that appeared since the last standup
- Include a "carryOverItems" note in the fullSummary if there are unresolved items from yesterday` : ""}

Respond ONLY with valid JSON in this exact format:
{
  "fullSummary": "2-3 sentence overview of the standup",
  "scrumData": {
    "participants": [
      {
        "name": "Person Name",
        "yesterday": ["Task they completed or worked on"],
        "today": ["Task they plan to work on"],
        "blockers": ["Any blockers mentioned, empty array if none"]
      }
    ],
    "blockers": [
      {
        "description": "Description of the blocker",
        "owner": "Person responsible",
        "severity": "low|medium|high",
        "status": "active"
      }
    ],
    "actionItems": [
      {
        "title": "Specific action to take",
        "assignee": "Person responsible",
        "priority": "low|medium|high"
      }
    ],
    "teamMood": "Brief assessment of team energy/morale if discernible, or null",
    "sprintGoalProgress": "Brief assessment of sprint progress if mentioned, or null"
  }
}

IMPORTANT:
- Extract REAL names from the transcript (use speaker labels)
- Only include information that was actually discussed
- If you can't identify a speaker, use "Unidentified"
- Every blocker mentioned by anyone should appear in both their participant.blockers AND the top-level blockers array
- Action items should be specific and actionable, not vague`;

  try {
    console.log("[Scrum Summary] Generating structured standup summary...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ScrumSummaryResult;
      console.log(`[Scrum Summary] Generated with ${parsed.scrumData?.participants?.length || 0} participants`);
      return parsed;
    }

    console.log("[Scrum Summary] Failed to parse JSON response");
    return null;
  } catch (error) {
    console.error("[Scrum Summary] Failed:", error);
    return null;
  }
}

export function getScrumMasterChatPrompt(): string {
  return SCRUM_MASTER_SYSTEM_PROMPT;
}
