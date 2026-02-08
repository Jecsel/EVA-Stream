import { GoogleGenAI } from "@google/genai";
import type { ScrumMasterConfig, SpeakerTiming, ScrumMasterPostMeetingSummary } from "@shared/schema";
import { storage } from "./storage";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface TranscriptChunk {
  text: string;
  speaker: string;
  timestamp: number;
  isFinal: boolean;
}

interface ActiveSession {
  sessionId: string;
  meetingId: string;
  config: ScrumMasterConfig;
  speakers: Map<string, SpeakerTiming>;
  currentSpeaker: string | null;
  transcriptBuffer: TranscriptChunk[];
  fullTranscript: string[];
  interventionQueue: Array<{
    type: string;
    severity: string;
    message: string;
    speaker?: string;
    context?: string;
  }>;
  lastAnalysisTime: number;
  analysisInterval: number; // ms between AI analysis calls
  sprintGoal: string | null;
  detectedBlockers: Map<string, { count: number; description: string }>;
  parkedTopics: string[];
  meetingStartTime: number;
}

const activeSessions = new Map<string, ActiveSession>();

export function getActiveSession(meetingId: string): ActiveSession | undefined {
  return activeSessions.get(meetingId);
}

export async function startScrumMasterSession(
  meetingId: string,
  config: Partial<ScrumMasterConfig> = {}
): Promise<string> {
  const fullConfig: ScrumMasterConfig = {
    mode: config.mode || "enforcer",
    interruptions: config.interruptions ?? true,
    timeboxing: config.timeboxing || "strict",
    escalation: config.escalation || "auto",
    timeboxPerSpeaker: config.timeboxPerSpeaker || 90,
    warnAt: config.warnAt || 75,
  };

  let sessionId: string;
  try {
    const session = await storage.createScrumMasterSession({
      meetingId,
      meetingType: "standup",
      mode: fullConfig.mode,
      timeboxPerSpeaker: String(fullConfig.timeboxPerSpeaker),
      status: "active",
    });
    sessionId = session.id;
  } catch (error) {
    console.warn(`Could not persist scrum session to DB for meeting ${meetingId}, running in-memory only:`, (error as Error).message);
    sessionId = `mem-${Date.now()}`;
  }

  const activeSession: ActiveSession = {
    sessionId,
    meetingId,
    config: fullConfig,
    speakers: new Map(),
    currentSpeaker: null,
    transcriptBuffer: [],
    fullTranscript: [],
    interventionQueue: [],
    lastAnalysisTime: Date.now(),
    analysisInterval: 15000, // analyze every 15 seconds
    sprintGoal: null,
    detectedBlockers: new Map(),
    parkedTopics: [],
    meetingStartTime: Date.now(),
  };

  activeSessions.set(meetingId, activeSession);
  return sessionId;
}

export function stopScrumMasterSession(meetingId: string): void {
  activeSessions.delete(meetingId);
}

export async function updateScrumMasterConfig(
  meetingId: string,
  config: Partial<ScrumMasterConfig>
): Promise<ScrumMasterConfig | null> {
  const session = activeSessions.get(meetingId);
  if (!session) return null;

  Object.assign(session.config, config);

  if (!session.sessionId.startsWith("mem-")) {
    try {
      await storage.updateScrumMasterSession(session.sessionId, {
        mode: session.config.mode,
        timeboxPerSpeaker: String(session.config.timeboxPerSpeaker),
      });
    } catch (error) {
      console.warn(`Could not persist config update for session ${session.sessionId}:`, (error as Error).message);
    }
  }

  return session.config;
}

export async function setSprintGoal(meetingId: string, goal: string): Promise<void> {
  const session = activeSessions.get(meetingId);
  if (session) {
    session.sprintGoal = goal;
    if (!session.sessionId.startsWith("mem-")) {
      try {
        await storage.updateScrumMasterSession(session.sessionId, {
          sprintGoal: goal,
        });
      } catch (error) {
        console.warn(`Could not persist sprint goal for session ${session.sessionId}:`, (error as Error).message);
      }
    }
  }
}

export function processTranscriptChunk(
  meetingId: string,
  chunk: TranscriptChunk
): Array<{ type: string; severity: string; message: string; speaker?: string; context?: string }> {
  const session = activeSessions.get(meetingId);
  if (!session) return [];

  // Buffer transcript in all modes
  session.transcriptBuffer.push(chunk);
  if (chunk.isFinal) {
    session.fullTranscript.push(`${chunk.speaker}: ${chunk.text}`);
  }

  // Track speaker timing in all modes
  if (chunk.speaker && chunk.speaker !== session.currentSpeaker) {
    if (session.currentSpeaker) {
      const prev = session.speakers.get(session.currentSpeaker);
      if (prev) {
        prev.elapsed = (Date.now() - prev.startTime) / 1000;
      }
    }

    session.currentSpeaker = chunk.speaker;
    if (!session.speakers.has(chunk.speaker)) {
      session.speakers.set(chunk.speaker, {
        name: chunk.speaker,
        startTime: Date.now(),
        elapsed: 0,
        warned: false,
        interrupted: false,
        coveredYesterday: false,
        coveredToday: false,
        coveredBlockers: false,
      });
    } else {
      const existing = session.speakers.get(chunk.speaker)!;
      existing.startTime = Date.now();
      existing.warned = false;
      existing.interrupted = false;
    }
  }

  if (session.config.mode === "observer") {
    if (chunk.isFinal && chunk.text.trim().length > 2) {
      return [{
        type: "transcript_logged",
        severity: "info",
        message: chunk.text.trim(),
        speaker: chunk.speaker,
        context: "Observer mode — logged for review",
      }];
    }
    return [];
  }

  const interventions: Array<{ type: string; severity: string; message: string; speaker?: string; context?: string }> = [];

  // Check timebox for current speaker
  if (session.currentSpeaker) {
    const speaker = session.speakers.get(session.currentSpeaker);
    if (speaker) {
      const elapsed = (Date.now() - speaker.startTime) / 1000;
      speaker.elapsed = elapsed;

      if (elapsed >= session.config.warnAt && !speaker.warned) {
        speaker.warned = true;
        interventions.push({
          type: "time_warning",
          severity: "warning",
          message: `⏱ ${speaker.name}, ${Math.round(session.config.timeboxPerSpeaker - elapsed)}s remaining. Please wrap up.`,
          speaker: speaker.name,
          context: `Speaker at ${Math.round(elapsed)}s of ${session.config.timeboxPerSpeaker}s timebox`,
        });
      }

      if (elapsed >= session.config.timeboxPerSpeaker && !speaker.interrupted) {
        speaker.interrupted = true;
        const msg = session.config.mode === "hardcore"
          ? `⏱ Time. ${speaker.name}, you're done. Next.`
          : `⏱ Time's up, ${speaker.name}. Let's move on.`;
        interventions.push({
          type: "interrupt",
          severity: "critical",
          message: msg,
          speaker: speaker.name,
          context: `Speaker exceeded ${session.config.timeboxPerSpeaker}s timebox`,
        });
      }
    }
  }

  // Quick text-based pattern detection (no AI needed)
  if (chunk.isFinal && chunk.text.length > 10) {
    const textLower = chunk.text.toLowerCase();

    // Detect blocker keywords
    const blockerKeywords = ["blocked", "blocking", "blocker", "can't proceed", "waiting on", "depends on", "stuck", "impediment"];
    if (blockerKeywords.some(kw => textLower.includes(kw))) {
      interventions.push({
        type: "blocker_detected",
        severity: "warning",
        message: `🚧 Potential blocker detected from ${chunk.speaker}. Classifying...`,
        speaker: chunk.speaker,
        context: chunk.text,
      });
    }

    // Detect scope creep / off-topic
    if (session.sprintGoal) {
      const offTopicIndicators = ["maybe we should", "what if we", "we could also", "new feature", "nice to have", "wouldn't it be cool"];
      if (offTopicIndicators.some(phrase => textLower.includes(phrase))) {
        interventions.push({
          type: "scope_creep",
          severity: "warning",
          message: `⚠️ This doesn't align with the sprint goal. Defer?`,
          speaker: chunk.speaker,
          context: `Sprint goal: "${session.sprintGoal}" | Statement: "${chunk.text.substring(0, 100)}"`,
        });
      }
    }
  }

  for (const intervention of interventions) {
    session.interventionQueue.push(intervention);
    if (!session.sessionId.startsWith("mem-")) {
      storage.createScrumMasterIntervention({
        sessionId: session.sessionId,
        type: intervention.type,
        severity: intervention.severity,
        message: intervention.message,
        speaker: intervention.speaker || null,
        context: intervention.context || null,
      }).catch(err => console.error("Failed to save intervention:", err));
    }
  }

  return interventions;
}

export async function runPeriodicAnalysis(meetingId: string): Promise<Array<{ type: string; severity: string; message: string; speaker?: string; context?: string }>> {
  const session = activeSessions.get(meetingId);
  if (!session || session.config.mode === "observer") return [];

  const now = Date.now();
  if (now - session.lastAnalysisTime < session.analysisInterval) return [];

  session.lastAnalysisTime = now;

  const recentTranscript = session.transcriptBuffer
    .filter(c => c.isFinal)
    .slice(-20)
    .map(c => `${c.speaker}: ${c.text}`)
    .join("\n");

  if (recentTranscript.length < 50) return [];

  const interventions: Array<{ type: string; severity: string; message: string; speaker?: string; context?: string }> = [];

  try {
    const speakerStates = Array.from(session.speakers.entries()).map(([name, s]) => ({
      name,
      elapsed: Math.round(s.elapsed),
      coveredYesterday: s.coveredYesterday,
      coveredToday: s.coveredToday,
      coveredBlockers: s.coveredBlockers,
    }));

    const prompt = `You are an AI Scrum Master analyzing a live standup meeting transcript. Be direct and concise.

Mode: ${session.config.mode.toUpperCase()}
Sprint Goal: ${session.sprintGoal || "Not set"}
Speaker States: ${JSON.stringify(speakerStates)}

Recent Transcript:
${recentTranscript}

Analyze and respond with a JSON array of interventions needed. Each intervention should have:
- "type": one of "rambling", "structure_enforce", "blocker_detected", "scope_creep", "action_needed", "pattern_alert"
- "severity": one of "info", "warning", "critical"
- "message": short, direct message (max 100 chars). Be blunt.
- "speaker": who this is directed at (or null)
- "context": brief explanation

Detect:
1. RAMBLING: storytelling, defensive explanations, design debates in standup
2. MISSING STRUCTURE: speaker hasn't covered yesterday/today/blockers
3. BLOCKERS: impediments that need classification (critical/medium/noise)
4. SCOPE CREEP: discussion not aligned with sprint goal
5. ACTION ITEMS: commitments without clear owner or deadline

If nothing needs intervention, return an empty array [].
${session.config.mode === "hardcore" ? "Be ruthless. No mercy. Call out everything." : ""}

Respond ONLY with valid JSON array.`;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: prompt,
    });

    const responseText = result.text?.trim() || "[]";
    const cleaned = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.type && item.message) {
          interventions.push({
            type: item.type,
            severity: item.severity || "info",
            message: item.message,
            speaker: item.speaker || undefined,
            context: item.context || undefined,
          });

          // Update speaker structure tracking
          if (item.type === "structure_enforce" && item.speaker) {
            const speaker = session.speakers.get(item.speaker);
            if (speaker) {
              if (item.context?.includes("yesterday")) speaker.coveredYesterday = true;
              if (item.context?.includes("today")) speaker.coveredToday = true;
              if (item.context?.includes("blocker")) speaker.coveredBlockers = true;
            }
          }

          // Track blockers
          if (item.type === "blocker_detected" && item.context) {
            const key = item.context.substring(0, 50);
            const existing = session.detectedBlockers.get(key);
            if (existing) {
              existing.count++;
            } else {
              session.detectedBlockers.set(key, { count: 1, description: item.context });
            }

            if (!session.sessionId.startsWith("mem-")) {
              storage.createScrumMasterBlocker({
                sessionId: session.sessionId,
                meetingId: session.meetingId,
                description: item.context || item.message,
                severity: item.severity === "critical" ? "critical" : item.severity === "warning" ? "medium" : "noise",
                owner: item.speaker || null,
                threatensSprint: item.severity === "critical",
              }).catch(err => console.error("Failed to save blocker:", err));
            }
          }

          if (item.type === "action_needed" && !session.sessionId.startsWith("mem-")) {
            storage.createScrumMasterAction({
              sessionId: session.sessionId,
              meetingId: session.meetingId,
              description: item.message,
              owner: item.speaker || null,
            }).catch(err => console.error("Failed to save action:", err));
          }

          if (!session.sessionId.startsWith("mem-")) {
            storage.createScrumMasterIntervention({
              sessionId: session.sessionId,
              type: item.type,
              severity: item.severity || "info",
              message: item.message,
              speaker: item.speaker || null,
              context: item.context || null,
            }).catch(err => console.error("Failed to save intervention:", err));
          }
        }
      }
    }
  } catch (error) {
    console.error("Scrum master analysis error:", error);
  }

  return interventions;
}

export async function generatePostMeetingSummary(meetingId: string): Promise<ScrumMasterPostMeetingSummary | null> {
  const session = activeSessions.get(meetingId);
  if (!session) return null;

  const fullTranscript = session.fullTranscript.join("\n");
  if (fullTranscript.length < 100) {
    return {
      bullets: ["Meeting was too short for meaningful summary"],
      actionItems: [],
      blockers: [],
      sprintGoalRisks: [],
      parkedTopics: session.parkedTopics,
      patterns: [],
    };
  }

  try {
    const isMemSession = session.sessionId.startsWith("mem-");
    const blockers = isMemSession ? [] : await storage.getScrumMasterBlockersBySession(session.sessionId);
    const actions = isMemSession ? [] : await storage.getScrumMasterActionsBySession(session.sessionId);

    const prompt = `You are a Scrum Master generating a post-meeting summary. Be brutally concise. No fluff. No motivational talk.

Sprint Goal: ${session.sprintGoal || "Not set"}
Meeting Duration: ${Math.round((Date.now() - session.meetingStartTime) / 60000)} minutes

Full Transcript:
${fullTranscript.substring(0, 8000)}

Known Blockers: ${JSON.stringify(blockers.map(b => ({ description: b.description, severity: b.severity, owner: b.owner })))}
Known Actions: ${JSON.stringify(actions.map(a => ({ description: a.description, owner: a.owner, deadline: a.deadline })))}

Generate a JSON response with:
{
  "bullets": ["max 5 key takeaways, each under 100 chars"],
  "actionItems": [{"description": "what", "owner": "who", "deadline": "when"}],
  "blockers": [{"description": "what", "severity": "critical|medium|noise", "owner": "who"}],
  "sprintGoalRisks": ["risk to sprint goal if any"],
  "parkedTopics": ["topics deferred for async"],
  "patterns": ["recurring issues detected"]
}

Respond ONLY with valid JSON.`;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: prompt,
    });

    const responseText = result.text?.trim() || "{}";
    const cleaned = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const summary: ScrumMasterPostMeetingSummary = JSON.parse(cleaned);

    if (!isMemSession) {
      await storage.updateScrumMasterSession(session.sessionId, {
        status: "completed",
        postMeetingSummary: summary,
      });
    }

    return summary;
  } catch (error) {
    console.error("Failed to generate post-meeting summary:", error);
    return null;
  }
}

export async function detectCrossMeetingPatterns(meetingId: string, createdBy: string): Promise<string[]> {
  try {
    const pastSessions = await storage.getScrumMasterSessionsByCreator(createdBy, 10);
    if (pastSessions.length < 2) return [];

    const pastBlockers = [];
    for (const s of pastSessions.slice(0, 5)) {
      const blockers = await storage.getScrumMasterBlockersBySession(s.id);
      pastBlockers.push(...blockers.map(b => b.description));
    }

    if (pastBlockers.length === 0) return [];

    // Find repeated blockers
    const blockerCounts: Record<string, number> = {};
    for (const b of pastBlockers) {
      const key = b.toLowerCase().substring(0, 80);
      blockerCounts[key] = (blockerCounts[key] || 0) + 1;
    }

    const patterns: string[] = [];
    for (const blocker of Object.keys(blockerCounts)) {
      const count = blockerCounts[blocker];
      if (count >= 2) {
        patterns.push(`This blocker has appeared ${count} times: "${blocker}". This is systemic.`);
      }
    }

    return patterns;
  } catch (error) {
    console.error("Pattern detection error:", error);
    return [];
  }
}

export function getSessionState(meetingId: string) {
  const session = activeSessions.get(meetingId);
  if (!session) return null;

  const speakerTimes: Record<string, { totalSeconds: number; limit: number; warned: boolean }> = {};
  session.speakers.forEach((s, name) => {
    const currentElapsed = name === session.currentSpeaker 
      ? Math.round((Date.now() - s.startTime) / 1000) 
      : 0;
    speakerTimes[name] = {
      totalSeconds: Math.round(s.elapsed) + currentElapsed,
      limit: session.config.timeboxPerSpeaker || 90,
      warned: s.warned,
    };
  });

  return {
    sessionId: session.sessionId,
    config: session.config,
    sprintGoal: session.sprintGoal,
    speakerTimes,
    blockerCount: session.detectedBlockers.size,
    transcriptLength: session.fullTranscript.length,
    meetingDuration: Math.round((Date.now() - session.meetingStartTime) / 60000),
    pendingInterventions: session.interventionQueue.length,
  };
}
