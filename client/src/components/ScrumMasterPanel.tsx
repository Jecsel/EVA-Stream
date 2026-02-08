import { useState, useEffect, useRef, useCallback } from "react";
import {
  AlertTriangle, CheckCircle, Clock, Target, Shield,
  Flame, Zap, Eye, Swords, Skull, Play, Square,
  ChevronDown, ChevronUp, User, Calendar,
  MessageSquare, Volume2, VolumeX, Settings2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ScrumMode = "observer" | "enforcer" | "hardcore";

interface Intervention {
  id: string;
  type: string;
  severity: string;
  message: string;
  speaker?: string;
  timestamp: number;
  category?: string;
}

interface Blocker {
  id: string;
  description: string;
  reportedBy: string;
  severity: string;
  status: string;
  createdAt: string;
}

interface ActionItem {
  id: string;
  description: string;
  owner: string;
  deadline?: string;
  status: string;
  createdAt: string;
}

interface SpeakerTime {
  name: string;
  seconds: number;
  limit: number;
}

interface SessionConfig {
  mode: ScrumMode;
  timeboxMinutes: number;
  sprintGoal: string;
  enableSoundAlerts: boolean;
}

export interface TranscriptEvent {
  text: string;
  speaker: string;
  timestamp?: number;
  isFinal?: boolean;
}

interface ScrumMasterPanelProps {
  meetingId: string;
  className?: string;
  latestTranscript?: TranscriptEvent | null;
}

const modeConfig: Record<ScrumMode, { label: string; icon: typeof Eye; color: string; bg: string; description: string }> = {
  observer: { label: "Observer", icon: Eye, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", description: "Watches and logs only" },
  enforcer: { label: "Enforcer", icon: Swords, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", description: "Actively enforces time" },
  hardcore: { label: "Hardcore", icon: Skull, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", description: "Zero tolerance mode" },
};

const severityColors: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  medium: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  low: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  info: "border-blue-500/40 bg-blue-500/10 text-blue-300",
};

const severityIcons: Record<string, typeof Flame> = {
  critical: Flame,
  high: AlertTriangle,
  medium: Zap,
  low: MessageSquare,
  info: Eye,
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function InterventionItem({ intervention }: { intervention: Intervention }) {
  const Icon = severityIcons[intervention.severity] || MessageSquare;
  const colorClass = severityColors[intervention.severity] || severityColors.info;

  return (
    <div
      className={`p-2.5 rounded-lg border ${colorClass} animate-in slide-in-from-right-2 duration-300`}
      data-testid={`intervention-${intervention.id}`}
    >
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed font-medium">{intervention.message}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {intervention.speaker && (
              <span className="text-[9px] opacity-70 flex items-center gap-0.5">
                <User className="w-2.5 h-2.5" /> {intervention.speaker}
              </span>
            )}
            <Badge variant="outline" className="text-[8px] h-3.5 opacity-70">
              {intervention.type.replace(/_/g, " ")}
            </Badge>
            <span className="text-[9px] opacity-50">
              {new Date(intervention.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeakerTimerBar({ speaker }: { speaker: SpeakerTime }) {
  const pct = Math.min((speaker.seconds / (speaker.limit || 120)) * 100, 100);
  const isOvertime = speaker.seconds > speaker.limit;

  return (
    <div className="flex items-center gap-2" data-testid={`speaker-timer-${speaker.name}`}>
      <div className="w-16 truncate text-[10px] text-muted-foreground font-medium">{speaker.name}</div>
      <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isOvertime ? "bg-red-500 animate-pulse" : pct > 75 ? "bg-orange-500" : "bg-indigo-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono w-10 text-right ${isOvertime ? "text-red-400 font-bold" : "text-muted-foreground"}`}>
        {formatDuration(speaker.seconds)}
      </span>
    </div>
  );
}

export function ScrumMasterPanel({ meetingId, className, latestTranscript }: ScrumMasterPanelProps) {
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<SessionConfig>({
    mode: "enforcer",
    timeboxMinutes: 2,
    sprintGoal: "",
    enableSoundAlerts: true,
  });
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [speakerTimes, setSpeakerTimes] = useState<SpeakerTime[]>([]);
  const [activeTab, setActiveTab] = useState<"live" | "blockers" | "actions" | "config">("live");
  const [showConfig, setShowConfig] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sprintGoalInput, setSprintGoalInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const interventionsEndRef = useRef<HTMLDivElement>(null);

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/eva?meetingId=${meetingId}`);

    ws.onopen = () => {
      console.log("Scrum Master connected (via EVA WebSocket)");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Only handle scrum_* prefixed messages
        if (!msg.type || !msg.type.startsWith("scrum_")) return;

        switch (msg.type) {
          case "scrum_session_started":
            setSessionId(msg.sessionId);
            setIsActive(true);
            break;

          case "scrum_session_ended":
            setIsActive(false);
            setSessionId(null);
            break;

          case "scrum_intervention":
            setInterventions(prev => [{
              id: msg.id || `int-${Date.now()}`,
              type: msg.interventionType || msg.type || "unknown",
              severity: msg.severity || "info",
              message: msg.message || "",
              speaker: msg.speaker,
              timestamp: msg.timestamp || Date.now(),
              category: msg.category,
            }, ...prev].slice(0, 50));
            break;

          case "scrum_config_updated":
            if (msg.config) setConfig(prev => ({ ...prev, ...msg.config }));
            break;

          case "scrum_sprint_goal_set":
            setConfig(prev => ({ ...prev, sprintGoal: msg.goal }));
            break;

          case "scrum_state":
            if (msg.speakerTimes) {
              const times: SpeakerTime[] = [];
              for (const [name, data] of Object.entries(msg.speakerTimes as Record<string, any>)) {
                times.push({ name, seconds: data.totalSeconds || 0, limit: data.limit || 120 });
              }
              setSpeakerTimes(times);
            }
            if (msg.interventions) setInterventions(msg.interventions);
            if (msg.blockers) setBlockers(msg.blockers);
            if (msg.actions) setActions(msg.actions);
            break;

          case "scrum_error":
            console.warn("Scrum Master error:", msg.content);
            setInterventions(prev => [{
              id: `err-${Date.now()}`,
              type: "system_error",
              severity: "medium",
              message: msg.content || "An error occurred",
              timestamp: Date.now(),
            }, ...prev].slice(0, 50));
            break;
        }
      } catch (err) {
        console.error("Failed to parse scrum master message:", err);
      }
    };

    ws.onclose = () => {
      console.log("Scrum Master WebSocket closed, reconnecting...");
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  }, [meetingId]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    if (latestTranscript && isActive && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "scrum_transcript",
        text: latestTranscript.text,
        speaker: latestTranscript.speaker,
        timestamp: latestTranscript.timestamp || Date.now(),
        isFinal: latestTranscript.isFinal ?? true,
      }));
    }
  }, [latestTranscript, isActive]);

  useEffect(() => {
    interventionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [interventions.length]);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const startSession = () => {
    sendMessage({
      type: "scrum_start_session",
      config: {
        mode: config.mode,
        timeboxMinutes: config.timeboxMinutes,
        sprintGoal: config.sprintGoal,
      },
    });
  };

  const stopSession = () => {
    sendMessage({ type: "scrum_stop_session" });
  };

  const updateMode = (mode: ScrumMode) => {
    setConfig(prev => ({ ...prev, mode }));
    sendMessage({ type: "scrum_update_config", config: { mode } });
  };

  const submitSprintGoal = () => {
    if (!sprintGoalInput.trim()) return;
    setConfig(prev => ({ ...prev, sprintGoal: sprintGoalInput }));
    sendMessage({ type: "scrum_set_sprint_goal", goal: sprintGoalInput });
    setSprintGoalInput("");
  };

  const currentMode = modeConfig[config.mode];
  const ModeIcon = currentMode.icon;

  const tabs = [
    { id: "live" as const, label: "Live", count: interventions.length },
    { id: "blockers" as const, label: "Blockers", count: blockers.length },
    { id: "actions" as const, label: "Actions", count: actions.length },
    { id: "config" as const, label: "Config", count: null },
  ];

  return (
    <div className={`flex flex-col bg-background/95 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg ${className}`} data-testid="scrum-master-panel">
      <div className="px-3 pt-3 pb-2 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${currentMode.bg}`}>
              <ModeIcon className={`w-4 h-4 ${currentMode.color}`} />
            </div>
            <div>
              <h3 className="text-xs font-bold tracking-tight">Scrum Master</h3>
              <p className="text-[9px] text-muted-foreground">{currentMode.label} Mode</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setConfig(prev => ({ ...prev, enableSoundAlerts: !prev.enableSoundAlerts }))}
              className="p-1.5 rounded-md hover:bg-muted/30 transition-colors"
              data-testid="btn-toggle-sound"
            >
              {config.enableSoundAlerts
                ? <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                : <VolumeX className="w-3.5 h-3.5 text-muted-foreground/50" />
              }
            </button>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-1.5 rounded-md hover:bg-muted/30 transition-colors"
              data-testid="btn-toggle-config"
            >
              <Settings2 className={`w-3.5 h-3.5 ${showConfig ? "text-indigo-400" : "text-muted-foreground"}`} />
            </button>

            {!isActive ? (
              <button
                onClick={startSession}
                className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold rounded-md transition-colors"
                data-testid="btn-start-scrum"
              >
                <Play className="w-3 h-3" /> Start
              </button>
            ) : (
              <button
                onClick={stopSession}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-md transition-colors"
                data-testid="btn-stop-scrum"
              >
                <Square className="w-3 h-3" /> End
              </button>
            )}
          </div>
        </div>

        {isActive && (
          <div className={`flex items-center gap-1.5 p-1.5 rounded-md ${currentMode.bg} mb-2`}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className={`text-[9px] font-semibold ${currentMode.color}`}>
              ACTIVE — {currentMode.description}
            </span>
          </div>
        )}

        {config.sprintGoal && (
          <div className="flex items-start gap-1.5 p-1.5 bg-indigo-500/5 border border-indigo-500/20 rounded-md mb-2">
            <Target className="w-3 h-3 text-indigo-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-indigo-300 leading-relaxed line-clamp-2">{config.sprintGoal}</p>
          </div>
        )}

        {showConfig && (
          <div className="space-y-2 p-2 bg-muted/20 rounded-lg border border-border/30 mb-2">
            <div>
              <label className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 block">Mode</label>
              <div className="grid grid-cols-3 gap-1">
                {(Object.entries(modeConfig) as [ScrumMode, typeof modeConfig.observer][]).map(([mode, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={mode}
                      onClick={() => updateMode(mode)}
                      className={`flex flex-col items-center gap-0.5 p-1.5 rounded-md border transition-colors text-[9px] ${
                        config.mode === mode ? cfg.bg + " font-bold" : "border-border/30 hover:bg-muted/30"
                      }`}
                      data-testid={`btn-mode-${mode}`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${config.mode === mode ? cfg.color : "text-muted-foreground"}`} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 block">
                Timebox (min/person)
              </label>
              <input
                type="number"
                value={config.timeboxMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 2;
                  setConfig(prev => ({ ...prev, timeboxMinutes: val }));
                  sendMessage({ type: "update_config", config: { timeboxMinutes: val } });
                }}
                className="w-full bg-background/60 border border-border/50 rounded-md px-2 py-1 text-xs"
                min={1}
                max={15}
                data-testid="input-timebox"
              />
            </div>

            <div>
              <label className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 block">
                Sprint Goal
              </label>
              <div className="flex gap-1">
                <input
                  value={sprintGoalInput}
                  onChange={(e) => setSprintGoalInput(e.target.value)}
                  placeholder="e.g. Ship user auth by Friday"
                  className="flex-1 bg-background/60 border border-border/50 rounded-md px-2 py-1 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && submitSprintGoal()}
                  data-testid="input-sprint-goal"
                />
                <button
                  onClick={submitSprintGoal}
                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-md"
                  data-testid="btn-set-sprint-goal"
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        )}

        {speakerTimes.length > 0 && (
          <div className="space-y-1 mb-2">
            {speakerTimes.map(s => (
              <SpeakerTimerBar key={s.name} speaker={s} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-1 bg-muted/30 rounded-lg p-0.5">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`text-[9px] font-medium py-1.5 px-1 rounded-md transition-colors flex flex-col items-center gap-0.5 ${
                activeTab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-scrum-master-${id}`}
            >
              <span>{label}</span>
              {count !== null && (
                <span className={`text-[8px] px-1.5 rounded-full ${
                  count > 0 ? "bg-indigo-500/20 text-indigo-400" : "bg-muted/50 text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 max-h-[400px]">
        {activeTab === "live" && (
          <div className="space-y-1.5">
            {interventions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Shield className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {isActive ? "Monitoring... interventions will appear here" : "Start a session to begin monitoring"}
                </p>
              </div>
            ) : (
              <>
                {interventions.map((intervention) => (
                  <InterventionItem key={intervention.id} intervention={intervention} />
                ))}
                <div ref={interventionsEndRef} />
              </>
            )}
          </div>
        )}

        {activeTab === "blockers" && (
          <div className="space-y-1.5">
            {blockers.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-xs text-green-400 font-medium">No blockers detected</p>
              </div>
            ) : (
              blockers.map((blocker) => {
                const sev = severityColors[blocker.severity] || severityColors.medium;
                return (
                  <div key={blocker.id} className={`p-2.5 rounded-lg border ${sev}`} data-testid={`blocker-live-${blocker.id}`}>
                    <p className="text-xs leading-relaxed">{blocker.description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[9px] opacity-70 flex items-center gap-0.5">
                        <User className="w-2.5 h-2.5" /> {blocker.reportedBy}
                      </span>
                      <Badge variant="outline" className="text-[8px] h-3.5">{blocker.severity}</Badge>
                      <Badge variant="outline" className="text-[8px] h-3.5">{blocker.status}</Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "actions" && (
          <div className="space-y-1.5">
            {actions.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-xs text-green-400 font-medium">No action items yet</p>
              </div>
            ) : (
              actions.map((action) => (
                <div key={action.id} className="p-2.5 bg-background/60 rounded-lg border border-border/50" data-testid={`action-live-${action.id}`}>
                  <p className="text-xs leading-relaxed">{action.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                      <User className="w-2.5 h-2.5" /> {action.owner}
                    </span>
                    {action.deadline && (
                      <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" /> {action.deadline}
                      </span>
                    )}
                    <Badge variant="outline" className={`text-[8px] h-3.5 ${
                      action.status === "done" ? "border-green-500/30 text-green-400" :
                      action.status === "overdue" ? "border-red-500/30 text-red-400" :
                      "border-border text-muted-foreground"
                    }`}>
                      {action.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "config" && (
          <div className="space-y-3">
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Mode Descriptions</h4>
              {(Object.entries(modeConfig) as [ScrumMode, typeof modeConfig.observer][]).map(([mode, cfg]) => {
                const Icon = cfg.icon;
                const isSelected = config.mode === mode;
                return (
                  <div
                    key={mode}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border mb-1.5 cursor-pointer transition-colors ${
                      isSelected ? cfg.bg : "border-border/30 hover:bg-muted/20"
                    }`}
                    onClick={() => updateMode(mode)}
                    data-testid={`config-mode-${mode}`}
                  >
                    <Icon className={`w-5 h-5 mt-0.5 ${isSelected ? cfg.color : "text-muted-foreground"}`} />
                    <div>
                      <p className={`text-xs font-bold ${isSelected ? cfg.color : ""}`}>{cfg.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {mode === "observer" && "Silent mode. Logs everything but never interrupts. Post-meeting summary only."}
                        {mode === "enforcer" && "Active enforcement. Warns at 80% timebox, interrupts at 100%. Calls out rambling and scope creep."}
                        {mode === "hardcore" && "Zero tolerance. Hard cuts at timebox. Immediate intervention on any deviation. No mercy."}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Session Info</h4>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <p>Session ID: {sessionId || "Not started"}</p>
                <p>Meeting: {meetingId}</p>
                <p>Interventions: {interventions.length}</p>
                <p>Blockers: {blockers.length}</p>
                <p>Actions: {actions.length}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
