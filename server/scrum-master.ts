import { GoogleGenAI } from "@google/genai";
import type { ScrumMasterConfig, SpeakerTiming, ScrumMasterPostMeetingSummary, ScrumMeetingRecord } from "@shared/schema";
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

export async function generateScrumMeetingRecord(meetingId: string, options?: { transcript?: string; forceRegenerate?: boolean }): Promise<ScrumMeetingRecord | null> {
  try {
    if (!options?.forceRegenerate) {
      const existingRecord = await storage.getScrumMeetingRecordByMeeting(meetingId);
      if (existingRecord) return existingRecord;
    }

    const meeting = await storage.getMeeting(meetingId);
    if (!meeting) return null;

    const session = activeSessions.get(meetingId);
    const dbSession = await storage.getScrumMasterSessionByMeeting(meetingId);
    const scrumSummary = await storage.getMeetingSummary(meetingId);

    const blockers = dbSession 
      ? await storage.getScrumMasterBlockersBySession(dbSession.id)
      : await storage.getScrumMasterBlockersByMeeting(meetingId);
    const actions = dbSession
      ? await storage.getScrumMasterActionsBySession(dbSession.id)
      : await storage.getScrumMasterActionsByMeeting(meetingId);
    const actionItems = await storage.getScrumActionItemsByMeeting(meetingId);
    const previousRecord = await storage.getPreviousScrumMeetingRecord(meetingId);

    const fullTranscript = options?.transcript || session?.fullTranscript.join("\n") || "";
    const participants = session 
      ? Array.from(session.speakers.keys()) 
      : (scrumSummary?.scrumData as any)?.participants?.map((p: any) => p.name) || [];
    
    const meetingDuration = session 
      ? `${Math.round((Date.now() - session.meetingStartTime) / 60000)} minutes`
      : "N/A";

    const carriedOverItems: any[] = [];
    if (previousRecord) {
      const prevActions = previousRecord.actionItems as any[];
      if (prevActions && prevActions.length > 0) {
        for (const a of prevActions) {
          if (a.status !== "done" && a.status !== "completed") {
            carriedOverItems.push({
              item: a.action || a.description || a.item,
              owner: a.owner,
              status: a.status || "open",
              notes: "Carried over from previous meeting",
            });
          }
        }
      }
      const prevBlockers = previousRecord.blockers as any[];
      if (prevBlockers && prevBlockers.length > 0) {
        for (const b of prevBlockers) {
          if (b.status !== "resolved") {
            carriedOverItems.push({
              item: b.blocker || b.description || b.item,
              owner: b.owner,
              status: b.status || "active",
              notes: "Unresolved blocker from previous meeting",
            });
          }
        }
      }

      if (carriedOverItems.length === 0 && meeting.previousMeetingId) {
        try {
          const prevActionItems = await storage.getScrumActionItemsByMeeting(meeting.previousMeetingId);
          for (const a of prevActionItems) {
            if (a.status !== "done" && a.status !== "completed") {
              carriedOverItems.push({
                item: a.description || a.title,
                owner: a.assignee,
                status: a.status || "open",
                notes: "Carried over from previous meeting (action items table)",
              });
            }
          }
        } catch (e) {}
      }
    }

    const scrumData = scrumSummary?.scrumData as any;
    const teamUpdatesContext = scrumData?.participants
      ? JSON.stringify(scrumData.participants)
      : participants.length > 0 ? `Participants: ${participants.join(", ")}` : "No participant data";

    const prompt = `You are generating a structured Daily Scrum Meeting Record document. Analyze the meeting data and produce a complete JSON response.

Meeting Title: ${meeting.title}
Date: ${meeting.scheduledDate ? new Date(meeting.scheduledDate).toLocaleDateString() : new Date().toLocaleDateString()}
Sprint Goal: ${session?.sprintGoal || dbSession?.sprintGoal || "Not set"}
Duration: ${meetingDuration}
Participants: ${participants.join(", ") || "Unknown"}

${fullTranscript.length > 100 ? `Transcript (last 6000 chars):\n${fullTranscript.substring(Math.max(0, fullTranscript.length - 6000))}` : ""}

Team Updates Data: ${teamUpdatesContext}

Known Blockers: ${JSON.stringify(blockers.map(b => ({ description: b.description, severity: b.severity, owner: b.owner, status: b.status })))}

Known Action Items: ${JSON.stringify(actions.map(a => ({ description: a.description, owner: a.owner, deadline: a.deadline, status: a.status })))}

Carried-Over Items from Previous Meeting: ${JSON.stringify(carriedOverItems)}

Generate a JSON response with these exact fields:
{
  "teamName": "team name if detectable, otherwise 'Development Team'",
  "sprintName": "sprint/iteration name if mentioned, otherwise 'Current Sprint'",
  "participants": ["list of participant names"],
  "absentMembers": ["anyone who was expected but absent, empty array if unknown"],
  "carriedOverItems": [{"item": "description", "owner": "who", "status": "open|in_progress|done", "notes": "any notes"}],
  "teamUpdates": [{"memberName": "name", "completed": ["items completed"], "inProgress": ["items in progress"], "blocked": ["blockers"]}],
  "blockers": [{"blocker": "description", "owner": "who", "impact": "high|medium|low", "status": "active|resolved|escalated"}],
  "decisionsMade": ["decision 1", "decision 2"],
  "actionItems": [{"action": "what", "owner": "who", "dueDate": "when or TBD"}],
  "risks": ["risk 1", "risk 2"],
  "notesForNextMeeting": {"followUps": ["follow up items"], "openQuestions": ["open questions"]}
}

Respond ONLY with valid JSON.`;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: prompt,
    });

    const responseText = result.text?.trim() || "{}";
    const cleaned = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleaned);

    const meetingDate = meeting.scheduledDate || new Date();
    const meetingTime = meeting.scheduledDate 
      ? new Date(meeting.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let documentMarkdown = `# Daily Scrum – Meeting Record\n\n`;
    documentMarkdown += `## 1. Meeting Details\n\n`;
    documentMarkdown += `| Field | Value |\n|-------|-------|\n`;
    documentMarkdown += `| **Team** | ${data.teamName || "Development Team"} |\n`;
    documentMarkdown += `| **Date** | ${new Date(meetingDate).toLocaleDateString()} |\n`;
    documentMarkdown += `| **Time** | ${meetingTime} |\n`;
    documentMarkdown += `| **Sprint / Iteration** | ${data.sprintName || session?.sprintGoal || "Current Sprint"} |\n`;
    documentMarkdown += `| **Participants** | ${(data.participants || participants).join(", ") || "N/A"} |\n`;
    documentMarkdown += `| **Absent** | ${(data.absentMembers || []).join(", ") || "None"} |\n`;

    documentMarkdown += `\n## 2. Carried-Over Items (From Previous Meeting)\n\n`;
    const coItems = data.carriedOverItems || carriedOverItems;
    if (coItems.length > 0) {
      documentMarkdown += `| Item | Owner | Status | Notes |\n|------|-------|--------|-------|\n`;
      for (const item of coItems) {
        documentMarkdown += `| ${item.item} | ${item.owner || "—"} | ${item.status || "open"} | ${item.notes || "—"} |\n`;
      }
    } else {
      documentMarkdown += `_No items carried over from the previous meeting._\n`;
    }

    documentMarkdown += `\n## 3. Team Updates\n\n`;
    const updates = data.teamUpdates || [];
    if (updates.length > 0) {
      for (const member of updates) {
        documentMarkdown += `### ${member.memberName}\n\n`;
        documentMarkdown += `- **Completed:** ${(member.completed || []).join("; ") || "None reported"}\n`;
        documentMarkdown += `- **In Progress:** ${(member.inProgress || []).join("; ") || "None reported"}\n`;
        documentMarkdown += `- **Blocked:** ${(member.blocked || []).join("; ") || "None"}\n\n`;
      }
    } else {
      documentMarkdown += `_No individual updates recorded._\n`;
    }

    documentMarkdown += `\n## 4. Blockers\n\n`;
    const blockerList = data.blockers || [];
    if (blockerList.length > 0) {
      documentMarkdown += `| Blocker | Owner | Impact | Status |\n|---------|-------|--------|--------|\n`;
      for (const b of blockerList) {
        documentMarkdown += `| ${b.blocker} | ${b.owner || "—"} | ${b.impact || "medium"} | ${b.status || "active"} |\n`;
      }
    } else {
      documentMarkdown += `_No blockers reported._\n`;
    }

    documentMarkdown += `\n## 5. Decisions Made\n\n`;
    const decisions = data.decisionsMade || [];
    if (decisions.length > 0) {
      decisions.forEach((d: string, i: number) => {
        documentMarkdown += `${i + 1}. ${d}\n`;
      });
    } else {
      documentMarkdown += `_No decisions recorded._\n`;
    }

    documentMarkdown += `\n## 6. Action Items\n\n`;
    const aiActions = data.actionItems || [];
    if (aiActions.length > 0) {
      documentMarkdown += `| Action | Owner | Due Date |\n|--------|-------|----------|\n`;
      for (const a of aiActions) {
        documentMarkdown += `| ${a.action} | ${a.owner || "—"} | ${a.dueDate || "TBD"} |\n`;
      }
    } else {
      documentMarkdown += `_No action items recorded._\n`;
    }

    documentMarkdown += `\n## 7. Risks / Concerns\n\n`;
    const risks = data.risks || [];
    if (risks.length > 0) {
      risks.forEach((r: string, i: number) => {
        documentMarkdown += `${i + 1}. ${r}\n`;
      });
    } else {
      documentMarkdown += `_No risks identified._\n`;
    }

    documentMarkdown += `\n## 8. Notes for Next Meeting\n\n`;
    const notes = data.notesForNextMeeting || {};
    documentMarkdown += `### Follow-ups\n\n`;
    if (notes.followUps?.length > 0) {
      notes.followUps.forEach((f: string) => {
        documentMarkdown += `- ${f}\n`;
      });
    } else {
      documentMarkdown += `_No follow-ups._\n`;
    }
    documentMarkdown += `\n### Open Questions\n\n`;
    if (notes.openQuestions?.length > 0) {
      notes.openQuestions.forEach((q: string) => {
        documentMarkdown += `- ${q}\n`;
      });
    } else {
      documentMarkdown += `_No open questions._\n`;
    }

    const record = await storage.createScrumMeetingRecord({
      meetingId,
      sessionId: dbSession?.id || null,
      previousRecordId: previousRecord?.id || null,
      meetingSeriesId: meeting.meetingSeriesId || null,
      teamName: data.teamName || "Development Team",
      sprintName: data.sprintName || null,
      participants: data.participants || participants,
      absentMembers: data.absentMembers || [],
      carriedOverItems: coItems,
      teamUpdates: data.teamUpdates || [],
      blockers: data.blockers || [],
      decisionsMade: data.decisionsMade || [],
      actionItems: data.actionItems || [],
      risks: data.risks || [],
      notesForNextMeeting: data.notesForNextMeeting || { followUps: [], openQuestions: [] },
      documentMarkdown,
      meetingDate: new Date(meetingDate),
      meetingDuration,
    });

    return record;
  } catch (error) {
    console.error("Failed to generate scrum meeting record:", error);
    return null;
  }
}
