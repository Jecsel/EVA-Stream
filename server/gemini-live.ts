import { GoogleGenAI, Modality } from "@google/genai";
import { WebSocket as WS } from "ws";
import { storage } from "./storage";
import { generateMermaidFlowchart } from "./gemini";

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

interface ScreenObservation {
  timestamp: number;
  description: string;
  type: "ui" | "code" | "document" | "diagram" | "presentation" | "other";
  source: "screen" | "transcript";
}

interface TranscriptEntry {
  timestamp: number;
  speaker: string;
  text: string;
}

interface LiveSession {
  isActive: boolean;
  sessionId: string;
  lastActivity: number;
  isTranscribing?: boolean;
  lastResponse?: string;
  lastResponseTime?: number;
  lastImageHash?: string;
  framesSinceResponse?: number;
  lastForceCheck?: number;
  // SOP generation state
  observations: ScreenObservation[];
  currentSop: string;
  lastSopGeneration?: number;
  lastSopObservationIndex: number; // Index of last observation used for SOP
  sopVersion: number;
  // CRO generation state
  currentCro: string;
  lastCroGeneration?: number;
  lastCroObservationIndex: number;
  croVersion: number;
  // Transcript-based observations
  transcriptBuffer: TranscriptEntry[];
  lastTranscriptProcess?: number;
}

const activeSessions = new Map<string, LiveSession>();

// Better hash function for detecting image changes - samples more densely
function computeImageHash(base64Data: string): string {
  // Sample more densely - every 100th character for better change detection
  let hash1 = 0, hash2 = 0;
  const step = 100;
  
  for (let i = 0; i < base64Data.length; i += step) {
    const char = base64Data.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1 + char) | 0;
  }
  
  // Second pass from end for more variation
  for (let i = base64Data.length - 1; i >= 0; i -= step) {
    const char = base64Data.charCodeAt(i);
    hash2 = ((hash2 << 5) - hash2 + char) | 0;
  }
  
  // Also include length in hash
  return `${hash1.toString(16)}-${hash2.toString(16)}-${base64Data.length}`;
}

// Check if two responses are too similar (>70% overlap)
function areResponsesSimilar(response1: string, response2: string): boolean {
  if (!response1 || !response2) return false;
  
  const clean1 = response1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2 = response2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (clean1 === clean2) return true;
  
  // Check word overlap
  const words1 = new Set(response1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(response2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return false;
  
  let overlap = 0;
  Array.from(words1).forEach(word => {
    if (words2.has(word)) overlap++;
  });
  
  const similarity = overlap / Math.max(words1.size, words2.size);
  return similarity > 0.7;
}

// Minimum milliseconds between responses (only when screen unchanged)
const MIN_RESPONSE_INTERVAL_UNCHANGED = 30000; // 30 seconds if screen looks the same
const MIN_RESPONSE_INTERVAL_CHANGED = 5000; // 5 seconds if screen changed significantly
const FORCE_CHECK_INTERVAL = 60000; // Force a check every 60 seconds even if nothing seems changed
const FRAMES_BEFORE_RECHECK = 6; // After 6 frames (~60s at 10s interval), force a re-analysis
const SOP_GENERATION_INTERVAL = 30000; // Generate/update SOP every 30 seconds
const MIN_OBSERVATIONS_FOR_SOP = 2; // Minimum observations before generating SOP

// Helper to create a new session with all required fields
function createSession(meetingId: string): LiveSession {
  return {
    isActive: true,
    sessionId: meetingId,
    lastActivity: Date.now(),
    observations: [],
    currentSop: "",
    lastSopObservationIndex: 0,
    sopVersion: 0,
    currentCro: "",
    lastCroObservationIndex: 0,
    croVersion: 0,
    transcriptBuffer: [],
  };
}

// Detect observation type from screen analysis
function detectObservationType(description: string): ScreenObservation["type"] {
  const lower = description.toLowerCase();
  if (lower.includes("code") || lower.includes("function") || lower.includes("syntax") || lower.includes("programming")) {
    return "code";
  }
  if (lower.includes("diagram") || lower.includes("flowchart") || lower.includes("chart") || lower.includes("graph")) {
    return "diagram";
  }
  if (lower.includes("slide") || lower.includes("presentation") || lower.includes("powerpoint")) {
    return "presentation";
  }
  if (lower.includes("document") || lower.includes("text") || lower.includes("article") || lower.includes("report")) {
    return "document";
  }
  if (lower.includes("ui") || lower.includes("interface") || lower.includes("button") || lower.includes("form") || lower.includes("screen") || lower.includes("dashboard")) {
    return "ui";
  }
  return "other";
}

// Validate if observation contains actionable content (has ACTION: with a verb)
function isValidObservation(description: string): boolean {
  const lower = description.toLowerCase();
  
  // Must contain ACTION: with some content
  const actionMatch = description.match(/ACTION:\s*(.+?)(?=\n|SYSTEM:|DETAILS:|$)/i);
  if (!actionMatch || actionMatch[1].trim().length < 5) {
    return false;
  }
  
  // Check for action verbs
  const actionVerbs = ['click', 'select', 'enter', 'type', 'configure', 'set', 'choose', 'open', 'navigate', 'scroll', 'submit', 'save', 'create', 'add', 'edit', 'delete', 'view', 'expand', 'collapse'];
  const hasActionVerb = actionVerbs.some(verb => lower.includes(verb));
  
  return hasActionVerb;
}

// Default CRO prompt template - Business Discovery & Role Definition Agent
const DEFAULT_CRO_PROMPT = `You are the CRO Agent - a business discovery and role-definition expert.

## YOUR PURPOSE (ONE SENTENCE)
Identify where the business owner is the bottleneck and define the core role objectives needed to remove that bottleneck.

## CRO AGENT FRAMEWORK

Analyze the input using this 5-part framework:

### 1️⃣ Purpose
Why this role exists and what business pain it removes.

### 2️⃣ Context
- Business type & stage
- Owner involvement level
- Current systems & tools
- Risk factors (single point of failure, overload)
- Constraints (time, budget, tech maturity)

### 3️⃣ Agenda
What must improve in order of priority (30 / 90 / 180 days).

### 4️⃣ Responsibilities (NOT SOPs - ongoing duties only)
- Ongoing responsibilities
- Ownership areas
- Decision boundaries

### 5️⃣ Outcomes
- What "working well" looks like
- Measurable impact
- Owner time freed

---

## REQUIRED OUTPUT (Generate ALL 3 Artifacts)

You MUST generate exactly these 3 artifacts:

### ARTIFACT 1: Core Role Objective Document

\`\`\`
## Core Role Objective Document

**Role Title:** [Title]

**Role Purpose:**
[Why this role exists - what business pain it removes]

**Problems It Solves:**
- [Problem 1]
- [Problem 2]

**Responsibilities:**
- [Ongoing responsibility 1]
- [Ongoing responsibility 2]

**Tools Used:**
- [Tool/System 1]
- [Tool/System 2]

**Success Definition:**
[What "working well" looks like with measurable outcomes]
\`\`\`

### ARTIFACT 2: Delegation Candidate List

\`\`\`
## Delegation Candidate List

Tasks the owner should no longer do:

**Administrative Tasks:**
- [Task 1]
- [Task 2]

**Operations Tasks:**
- [Task 1]
- [Task 2]

**Communications Tasks:**
- [Task 1]
- [Task 2]
\`\`\`

### ARTIFACT 3: Process Identification List

\`\`\`
## Process Identification List

⚠️ Process names only - NO steps or details

- Job closeout
- Invoicing & follow-up
- Scheduling & coordination
- Quality control checks
- [Add other identified processes]
\`\`\`

---

## FAIL-SAFE RULES (CRITICAL)

1. **If information is missing:**
   - State it clearly: "⚠️ MISSING INFORMATION: [what's missing]"
   - Do NOT infer or guess
   - Do NOT "fill in gaps"

2. **If a task is vague:**
   - Flag it: "⚠️ UNCLEAR: [task] - needs clarification"
   - Suggest what clarification is needed

3. **Never generate SOPs** - only identify process NAMES, never steps

4. **Trust threshold:** If less than 60% of required context is available, state:
   "⚠️ INSUFFICIENT DATA: Cannot generate reliable CRO. Recommend follow-up interview to clarify: [list missing items]"

---

## WHAT CRO AGENT IS NOT
❌ Not an SOP writer (no process steps)
❌ Not a screen observer
❌ Not a process step generator
❌ Not an implementation agent`;

// Default SOP prompt template (fallback if database prompt not found)
const DEFAULT_SOP_PROMPT = `You are an expert SOP documentation specialist. Generate comprehensive, structured SOPs based on observed screen actions.

## OUTPUT FORMAT

Generate the SOP document using this structure:

### Standard Operating Procedure: [Descriptive Title]

**1. Objective**
Provide a clear statement of what this procedure accomplishes.

**2. Prerequisites**
List what is needed before starting.

**3. Tools/Systems**
List all platforms, applications, or tools used.

**4. Procedure Steps**
Document each step with numbered sub-steps (4.1, 4.2, etc.)

Use clear, imperative language and include specific UI elements.`;

// Generate SOP from accumulated observations and transcript (only new ones since last generation)
async function generateSOP(session: LiveSession): Promise<{ sop: string; newIndex: number } | null> {
  // Get only new observations since last SOP generation
  const newObservations = session.observations.slice(session.lastSopObservationIndex);
  
  // Get transcript content
  const transcriptText = session.transcriptBuffer
    .map(t => `${t.speaker}: ${t.text}`)
    .join("\n");
  
  // Allow generation from transcript alone (3+ entries) OR observations
  const hasEnoughTranscript = transcriptText.length > 50 && session.transcriptBuffer.length >= 3;
  const hasEnoughObservations = newObservations.length >= MIN_OBSERVATIONS_FOR_SOP;
  
  if (!hasEnoughTranscript && !hasEnoughObservations) {
    return null;
  }

  const newObservationsSummary = newObservations.length > 0
    ? newObservations.map((obs, i) => `${i + 1}. [${obs.source.toUpperCase()}] ${obs.description}`).join("\n")
    : "No screen observations available.";

  // Fetch SOP prompt template from database
  let sopPromptTemplate = DEFAULT_SOP_PROMPT;
  try {
    const dbPrompt = await storage.getActivePromptByType("sop");
    if (dbPrompt?.content) {
      sopPromptTemplate = dbPrompt.content;
      console.log("[EVA SOP] Using prompt template from database");
    } else {
      console.log("[EVA SOP] No database prompt found, using default template");
    }
  } catch (error) {
    console.error("[EVA SOP] Failed to fetch prompt from database, using default:", error);
  }

  const prompt = `${sopPromptTemplate}

---

## MEETING TRANSCRIPT:
${transcriptText || "No transcript available."}

## SCREEN OBSERVATIONS:
${newObservationsSummary}

${session.currentSop ? `## EXISTING SOP (integrate new steps into this document):\n${session.currentSop}\n\n` : ""}

Generate the complete SOP document now based on the meeting transcript and any screen observations. Extract procedural steps, workflows, and processes discussed in the meeting. If updating an existing SOP, merge new content into the appropriate sections.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const sopText = response.text || null;
    if (sopText) {
      return { sop: sopText, newIndex: session.observations.length };
    }
    return null;
  } catch (error) {
    console.error("[EVA SOP] Generation failed:", error);
    return null;
  }
}

// Generate CRO from accumulated observations and transcript
async function generateCRO(session: LiveSession): Promise<{ cro: string; newIndex: number } | null> {
  // Get observations since last CRO generation
  const newObservations = session.observations.slice(session.lastCroObservationIndex);
  const transcriptText = session.transcriptBuffer
    .map(t => `${t.speaker}: ${t.text}`)
    .join("\n");
  
  if (newObservations.length < 1 && transcriptText.length < 50) {
    return null;
  }

  const observationsSummary = newObservations.length > 0 
    ? newObservations.map((obs, i) => `${i + 1}. [${obs.source.toUpperCase()}] ${obs.description}`).join("\n")
    : "No screen observations available.";

  // Fetch CRO prompt template from database
  let croPromptTemplate = DEFAULT_CRO_PROMPT;
  try {
    const dbPrompt = await storage.getActivePromptByType("cro");
    if (dbPrompt?.content) {
      croPromptTemplate = dbPrompt.content;
      console.log("[EVA CRO] Using prompt template from database");
    } else {
      console.log("[EVA CRO] No database prompt found, using default template");
    }
  } catch (error) {
    console.error("[EVA CRO] Failed to fetch prompt from database, using default:", error);
  }

  const prompt = `${croPromptTemplate}

---

## INPUT DATA FOR ANALYSIS

### MEETING TRANSCRIPT / INTERVIEW RESPONSES:
${transcriptText || "No transcript available."}

### SCREEN OBSERVATIONS (if any):
${observationsSummary}

${session.currentCro ? `### EXISTING CRO OUTPUT (update and expand these artifacts):\n${session.currentCro}\n\n` : ""}

---

## YOUR TASK

Analyze the transcript/interview content to:
1. Identify where the business owner is currently the bottleneck
2. Define roles that would remove that bottleneck
3. Generate ALL 3 REQUIRED ARTIFACTS (Core Role Objective Document, Delegation Candidate List, Process Identification List)

Focus on:
- What participants say about their role, daily tasks, and pain points
- Where the owner is spending time they shouldn't be
- Tasks that should be delegated
- Processes that exist (names only, NO steps)

REMEMBER: 
- Flag anything unclear with "⚠️"
- Do NOT infer or guess missing information
- Generate process NAMES only, never process steps (that's the SOP Agent's job)`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const croText = response.text || null;
    if (croText) {
      return { cro: croText, newIndex: session.observations.length };
    }
    return null;
  } catch (error) {
    console.error("[EVA CRO] Generation failed:", error);
    return null;
  }
}

// Process transcript entries and extract observations
// Note: Transcript is already added to buffer before calling this function
async function processTranscriptForObservations(session: LiveSession, transcript: string, speaker: string): Promise<ScreenObservation | null> {
  // Keep buffer to last 50 entries to avoid memory issues
  if (session.transcriptBuffer.length > 50) {
    session.transcriptBuffer = session.transcriptBuffer.slice(-50);
  }

  // Check if transcript contains procedural content
  const proceduralKeywords = [
    'step', 'first', 'then', 'next', 'after', 'before', 'process', 'procedure',
    'click', 'select', 'enter', 'configure', 'setup', 'install', 'create',
    'open', 'navigate', 'go to', 'make sure', 'ensure', 'verify', 'check'
  ];
  
  const lower = transcript.toLowerCase();
  const hasProceduralContent = proceduralKeywords.some(kw => lower.includes(kw));
  
  if (!hasProceduralContent) {
    return null;
  }

  // Create observation from transcript
  const observation: ScreenObservation = {
    timestamp: Date.now(),
    description: `TRANSCRIPT: ${speaker} said: "${transcript}"`,
    type: "document",
    source: "transcript",
  };
  
  return observation;
}

export interface GeminiLiveMessage {
  type: "audio" | "video" | "text" | "control" | "audio_transcribe" | "transcript";
  data?: string; // base64 for audio/video, text for messages
  mimeType?: string;
  command?: "start" | "stop" | "ping" | "start_transcription" | "stop_transcription";
  meetingId?: string;
  speaker?: string; // for transcript messages
  enableSop?: boolean; // whether SOP generator is enabled
  enableCro?: boolean; // whether CRO generator is enabled
}

export interface GeminiLiveResponse {
  type: "text" | "audio" | "sop_update" | "sop_status" | "cro_update" | "cro_status" | "error" | "status" | "transcript";
  content: string;
  audioData?: string; // base64 audio
  isFinal?: boolean;
  speaker?: string;
  // CRO-specific fields
  croContent?: string;
  croVersion?: number;
  observationCount?: number;
  sopVersion?: number;
  flowchartCode?: string; // Mermaid flowchart code generated from SOP
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
        activeSessions.set(meetingId, createSession(meetingId));
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
      if (message.command === "start_transcription") {
        const session = activeSessions.get(meetingId);
        if (session) {
          session.isTranscribing = true;
        } else {
          const newSession = createSession(meetingId);
          newSession.isTranscribing = true;
          activeSessions.set(meetingId, newSession);
        }
        return {
          type: "status",
          content: "Live transcription started",
        };
      }
      if (message.command === "stop_transcription") {
        const session = activeSessions.get(meetingId);
        if (session) {
          session.isTranscribing = false;
        }
        return {
          type: "status",
          content: "Live transcription stopped",
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
      console.log(`[EVA] Processing video frame for meeting ${meetingId} (${message.data.length} bytes)`);
      
      // Get or create session
      let session = activeSessions.get(meetingId);
      if (!session) {
        session = createSession(meetingId);
        activeSessions.set(meetingId, session);
      }
      
      const now = Date.now();
      
      // Initialize frame counter if needed
      if (session.framesSinceResponse === undefined) {
        session.framesSinceResponse = 0;
      }
      session.framesSinceResponse++;
      
      // First check if image has changed significantly
      const currentHash = computeImageHash(message.data);
      const imageChanged = session.lastImageHash !== currentHash;
      
      // Check if we should force a re-analysis (periodic check to catch hash misses)
      const timeSinceForceCheck = session.lastForceCheck ? now - session.lastForceCheck : Infinity;
      const shouldForceCheck = session.framesSinceResponse >= FRAMES_BEFORE_RECHECK || 
                               timeSinceForceCheck >= FORCE_CHECK_INTERVAL;
      
      // Apply different rate limits based on whether image changed or force check
      let minInterval = imageChanged ? MIN_RESPONSE_INTERVAL_CHANGED : MIN_RESPONSE_INTERVAL_UNCHANGED;
      
      // If forcing a check, use a shorter interval
      if (shouldForceCheck) {
        minInterval = MIN_RESPONSE_INTERVAL_CHANGED;
        console.log(`[EVA] Forcing periodic re-analysis (frames: ${session.framesSinceResponse}, time: ${Math.round(timeSinceForceCheck/1000)}s)`);
      }
      
      if (session.lastResponseTime && (now - session.lastResponseTime) < minInterval) {
        console.log(`[EVA] Skipping - too soon (${Math.round((now - session.lastResponseTime) / 1000)}s ago, need ${minInterval/1000}s, changed=${imageChanged})`);
        return {
          type: "status",
          content: "observing",
        };
      }
      
      // If image unchanged and not forcing a check, skip processing
      if (!imageChanged && !shouldForceCheck) {
        console.log(`[EVA] Skipping - image unchanged (frames: ${session.framesSinceResponse})`);
        return {
          type: "status",
          content: "observing",
        };
      }
      
      // Build context-aware prompt
      const lastResponseContext = session.lastResponse 
        ? `\n\nIMPORTANT: You recently said: "${session.lastResponse.substring(0, 200)}..."\nDo NOT repeat this information. Only mention NEW observations or skip if nothing new.`
        : "";
      
      const contents = [
        {
          inlineData: {
            data: message.data,
            mimeType: message.mimeType || "image/jpeg",
          },
        },
        `You are EVA, an AI assistant that documents procedures and workflows. Analyze this screen capture and extract PROCEDURAL information.

Focus on ACTIONS and STEPS being demonstrated:
- What action is being performed? (clicking, configuring, entering data, selecting options)
- What tool/system/application is being used?
- What is the sequence of steps visible?
- What inputs, settings, or configurations are shown?

Format your response as:
ACTION: [what is being done]
SYSTEM: [tool/app being used]
DETAILS: [specific settings, values, or configurations visible]

Keep response under 80 words. Focus on WHAT is being done, not how it looks.
If nothing actionable is visible (just video call faces), respond exactly: "[Observing]"${lastResponseContext}`,
      ];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
      });

      const text = response.text || "[Observing]";
      
      // Skip if it's just observing or too similar to last response
      if (text.includes("[Observing]") || text.includes("[Observing meeting]")) {
        session.lastImageHash = currentHash;
        return {
          type: "status",
          content: "observing",
        };
      }
      
      // Only check similarity if responses look too similar AND we have recent context
      // This prevents spamming the same observation but still allows meaningful updates
      if (session.lastResponse && areResponsesSimilar(text, session.lastResponse)) {
        console.log(`[EVA] Response similar to previous - but screen changed, still updating hash`);
        session.lastImageHash = currentHash;
        // Still suppress near-duplicate messages but update the hash
        return {
          type: "status",
          content: "observing",
        };
      }
      
      // Update session with new response
      session.lastResponse = text;
      session.lastResponseTime = now;
      session.lastImageHash = currentHash;
      session.framesSinceResponse = 0; // Reset frame counter
      session.lastForceCheck = now; // Reset force check timer
      
      // Only store valid procedural observations for SOP generation
      const isValid = isValidObservation(text);
      
      if (isValid) {
        const observation: ScreenObservation = {
          timestamp: now,
          description: text,
          type: detectObservationType(text),
          source: "screen",
        };
        session.observations.push(observation);
        console.log(`[EVA SOP] Added valid observation #${session.observations.length}: ${observation.type} (screen)`);
      } else {
        console.log(`[EVA SOP] Skipped non-procedural observation (no valid ACTION found)`);
      }
      
      // Check if we should generate/update SOP
      const timeSinceLastSop = session.lastSopGeneration ? now - session.lastSopGeneration : Infinity;
      const newObservationCount = session.observations.length - session.lastSopObservationIndex;
      const shouldGenerateSop = newObservationCount >= MIN_OBSERVATIONS_FOR_SOP && 
                                 timeSinceLastSop >= SOP_GENERATION_INTERVAL;
      
      if (shouldGenerateSop) {
        console.log(`[EVA SOP] Generating SOP from ${newObservationCount} new observations (total: ${session.observations.length})...`);
        const result = await generateSOP(session);
        
        if (result) {
          session.currentSop = result.sop;
          session.lastSopObservationIndex = result.newIndex;
          session.lastSopGeneration = now;
          session.sopVersion++;
          console.log(`[EVA SOP] Generated SOP v${session.sopVersion}`);
          
          // Generate flowchart from the SOP content
          let flowchartCode: string | undefined;
          try {
            console.log(`[EVA SOP] Generating flowchart from SOP...`);
            flowchartCode = await generateMermaidFlowchart(result.sop);
            if (flowchartCode) {
              console.log(`[EVA SOP] Generated flowchart (${flowchartCode.length} chars)`);
            }
          } catch (flowchartError) {
            console.error(`[EVA SOP] Flowchart generation failed:`, flowchartError);
          }
          
          // Return the SOP update with metadata and flowchart
          return {
            type: "sop_update",
            content: result.sop,
            observationCount: session.observations.length,
            sopVersion: session.sopVersion,
            flowchartCode: flowchartCode,
          };
        }
      }
      
      // Return status with observation count for progress indication
      return {
        type: "sop_status",
        content: text,
        observationCount: session.observations.length,
        sopVersion: session.sopVersion,
      };
    }

    // Process transcript message for SOP/CRO generation
    if (message.type === "transcript" && message.data) {
      const now = Date.now();
      const speaker = message.speaker || "User";
      const transcriptText = message.data;
      
      console.log(`[EVA] Processing transcript: "${transcriptText.substring(0, 50)}..." from ${speaker}`);
      
      // Get or create session
      let session = activeSessions.get(meetingId);
      if (!session) {
        session = createSession(meetingId);
        activeSessions.set(meetingId, session);
      }
      
      // Add to transcript buffer (this is crucial for SOP/CRO generation!)
      session.transcriptBuffer.push({
        text: transcriptText,
        speaker: speaker,
        timestamp: now
      });
      console.log(`[EVA] Transcript buffer now has ${session.transcriptBuffer.length} entries`);
      
      // Process transcript for observations
      const observation = await processTranscriptForObservations(session, transcriptText, speaker);
      if (observation) {
        session.observations.push(observation);
        console.log(`[EVA] Added transcript observation #${session.observations.length}`);
      }
      
      // Check if we should generate SOP from transcript
      const timeSinceLastSop = session.lastSopGeneration ? now - session.lastSopGeneration : Infinity;
      const shouldGenerateSop = message.enableSop !== false && 
                                 session.transcriptBuffer.length >= 3 && 
                                 timeSinceLastSop >= SOP_GENERATION_INTERVAL;
      
      // Check if we should generate CRO from transcript
      const timeSinceLastCro = session.lastCroGeneration ? now - session.lastCroGeneration : Infinity;
      const shouldGenerateCro = message.enableCro === true && 
                                 session.transcriptBuffer.length >= 3 && 
                                 timeSinceLastCro >= SOP_GENERATION_INTERVAL;
      
      let sopResult = null;
      let croResult = null;
      
      if (shouldGenerateSop) {
        console.log(`[EVA SOP] Generating SOP from transcript...`);
        sopResult = await generateSOP(session);
        if (sopResult) {
          session.currentSop = sopResult.sop;
          session.lastSopObservationIndex = sopResult.newIndex;
          session.lastSopGeneration = now;
          session.sopVersion++;
          console.log(`[EVA SOP] Generated SOP v${session.sopVersion} from transcript`);
        }
      }
      
      if (shouldGenerateCro) {
        console.log(`[EVA CRO] Generating CRO from transcript...`);
        croResult = await generateCRO(session);
        if (croResult) {
          session.currentCro = croResult.cro;
          session.lastCroObservationIndex = croResult.newIndex;
          session.lastCroGeneration = now;
          session.croVersion++;
          console.log(`[EVA CRO] Generated CRO v${session.croVersion} from transcript`);
        }
      }
      
      // Return combined update if we have results
      if (sopResult || croResult) {
        let flowchartCode: string | undefined;
        if (sopResult) {
          try {
            flowchartCode = await generateMermaidFlowchart(sopResult.sop);
          } catch (e) {
            console.error(`[EVA] Flowchart generation failed:`, e);
          }
        }
        
        return {
          type: sopResult ? "sop_update" : "cro_update",
          content: sopResult?.sop || "",
          observationCount: session.observations.length,
          sopVersion: session.sopVersion,
          flowchartCode,
          croContent: croResult?.cro,
          croVersion: session.croVersion,
        };
      }
      
      // Return status update
      return {
        type: "status",
        content: `Transcript processed (${session.transcriptBuffer.length} entries)`,
        observationCount: session.observations.length,
        sopVersion: session.sopVersion,
        croVersion: session.croVersion,
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

    // Process audio for transcription
    if (message.type === "audio_transcribe" && message.data) {
      console.log(`[EVA] Processing audio for transcription (${message.data.length} bytes)`);
      
      try {
        // Convert base64url back to standard base64
        let base64Data = message.data.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        while (base64Data.length % 4) {
          base64Data += '=';
        }

        const contents = [
          {
            inlineData: {
              data: base64Data,
              mimeType: message.mimeType || "audio/webm",
            },
          },
          `Transcribe this audio exactly as spoken. Output ONLY the transcribed text with no additional formatting, commentary, or explanations. If the audio is unclear or silent, respond with "[inaudible]".`,
        ];

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents,
        });

        const transcript = response.text || "";
        
        // Skip empty or trivial transcripts
        if (!transcript || transcript.trim() === "" || transcript === "[inaudible]") {
          return {
            type: "status",
            content: "No speech detected",
          };
        }

        return {
          type: "transcript",
          content: transcript.trim(),
          isFinal: true,
          speaker: "User",
        };
      } catch (error) {
        console.error("Audio transcription error:", error);
        return {
          type: "error",
          content: "Failed to transcribe audio",
        };
      }
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
