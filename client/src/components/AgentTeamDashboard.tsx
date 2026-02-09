import { useState, useEffect, useRef, useCallback } from "react";
import { Brain, FileText, Target, Users, CheckCircle2, Clock, AlertCircle, Loader2, Play, Square, MessageSquare, ChevronDown, ChevronUp, Zap, ArrowRight, GitBranch, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import mermaid from "mermaid";

interface TeamAgentStatus {
  agentType: string;
  status: "idle" | "working" | "completed" | "error";
  currentTask?: string;
  lastActivity?: number;
}

interface AgentTeamTask {
  id: string;
  agentType: string;
  description: string;
  status: string;
  result?: string;
  priority: string;
  assignedBy: string;
  createdAt: string;
  completedAt?: string;
}

interface AgentTeamMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  content: string;
  metadata?: any;
  createdAt: string;
}

interface AgentTeamDashboardProps {
  meetingId: string;
  ws: WebSocket | null;
  isConnected: boolean;
  className?: string;
}

const agentConfig: Record<string, { name: string; icon: typeof Brain; color: string; bgColor: string }> = {
  eva: { name: "EVA", icon: Brain, color: "text-purple-400", bgColor: "bg-purple-500/10 border-purple-500/30" },
  sop: { name: "SOP Generator", icon: FileText, color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30" },
  cro: { name: "CRO Generator", icon: Target, color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/30" },
  scrum: { name: "Scrum Master", icon: Users, color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/30" },
};

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  idle: { icon: Clock, color: "text-slate-400", label: "Idle" },
  working: { icon: Loader2, color: "text-yellow-400", label: "Working" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Done" },
  error: { icon: AlertCircle, color: "text-red-400", label: "Error" },
};

const messageTypeConfig: Record<string, { color: string; icon: typeof ArrowRight }> = {
  delegate_task: { color: "text-blue-400", icon: ArrowRight },
  status_update: { color: "text-yellow-400", icon: Zap },
  task_complete: { color: "text-green-400", icon: CheckCircle2 },
  finding: { color: "text-purple-400", icon: GitBranch },
  alert: { color: "text-red-400", icon: AlertCircle },
  context_share: { color: "text-cyan-400", icon: MessageSquare },
};

const taskStatusIcons: Record<string, string> = {
  pending: "⏳",
  assigned: "📋",
  in_progress: "🔄",
  completed: "✅",
  failed: "❌",
};

export function AgentTeamDashboard({ meetingId, ws, isConnected, className = "" }: AgentTeamDashboardProps) {
  const [isTeamActive, setIsTeamActive] = useState(false);
  const [agents, setAgents] = useState<TeamAgentStatus[]>([]);
  const [tasks, setTasks] = useState<AgentTeamTask[]>([]);
  const [messages, setMessages] = useState<AgentTeamMessage[]>([]);
  const [activeTab, setActiveTab] = useState<"tasks" | "messages" | "flow">("tasks");
  const [coordinatedReport, setCoordinatedReport] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const [flowSvg, setFlowSvg] = useState<string>("");

  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "team_started":
          setIsTeamActive(true);
          setAgents(data.agents || []);
          setCoordinatedReport(null);
          break;

        case "team_stopped":
          setIsTeamActive(false);
          if (data.report) setCoordinatedReport(data.report);
          break;

        case "team_status":
          setIsTeamActive(data.status === "active");
          setAgents(data.agents || []);
          break;

        case "team_task_update":
          if (data.task) {
            setTasks(prev => {
              const exists = prev.findIndex(t => t.id === data.task.id);
              if (exists >= 0) {
                const updated = [...prev];
                updated[exists] = data.task;
                return updated;
              }
              return [data.task, ...prev];
            });
          }
          break;

        case "team_agent_message":
          if (data.message) {
            setMessages(prev => [data.message, ...prev].slice(0, 100));
          }
          break;

        case "team_state":
          setIsTeamActive(data.isActive);
          setAgents(data.agents || []);
          break;

        case "team_tasks":
          if (data.tasks) setTasks(data.tasks);
          break;
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!ws) return;
    ws.addEventListener("message", handleWsMessage);
    return () => ws.removeEventListener("message", handleWsMessage);
  }, [ws, handleWsMessage]);

  useEffect(() => {
    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: "team_get_state" }));
      ws.send(JSON.stringify({ type: "team_get_tasks" }));
    }
  }, [ws, isConnected]);

  const startTeam = () => {
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: "team_start",
        agents: ["eva", "sop", "cro", "scrum"],
      }));
    }
  };

  const stopTeam = () => {
    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: "team_stop" }));
    }
  };

  const activeTasks = tasks.filter(t => t.status === "in_progress" || t.status === "assigned");
  const completedTasks = tasks.filter(t => t.status === "completed");

  const generateFlowDiagram = useCallback(async () => {
    const agentStatuses = agents.reduce((acc, a) => {
      acc[a.agentType] = a.status;
      return acc;
    }, {} as Record<string, string>);

    const evaStyle = agentStatuses.eva === "working" ? "fill:#7c3aed,stroke:#a78bfa,color:#fff" : "fill:#4c1d95,stroke:#6d28d9,color:#e9d5ff";
    const sopStyle = agentStatuses.sop === "working" ? "fill:#2563eb,stroke:#60a5fa,color:#fff" : "fill:#1e3a5f,stroke:#3b82f6,color:#bfdbfe";
    const croStyle = agentStatuses.cro === "working" ? "fill:#059669,stroke:#34d399,color:#fff" : "fill:#064e3b,stroke:#10b981,color:#a7f3d0";
    const scrumStyle = agentStatuses.scrum === "working" ? "fill:#d97706,stroke:#fbbf24,color:#fff" : "fill:#78350f,stroke:#f59e0b,color:#fde68a";

    const taskCount = tasks.length;
    const msgCount = messages.length;
    const activeCount = activeTasks.length;
    const doneCount = completedTasks.length;

    const chart = `graph TD
    INPUT["Meeting Input"]:::inputStyle
    EVA["EVA Team Lead\\n(Orchestrator)"]:::evaNode
    CLASSIFY{"Input Classifier"}:::classifyNode
    SOP["SOP Generator"]:::sopNode
    CRO["CRO Generator"]:::croNode
    SCRUM["Scrum Master"]:::scrumNode
    BUS["Message Bus\\n${msgCount} messages"]:::busNode
    TASKS["Task Manager\\n${activeCount} active / ${doneCount} done"]:::taskNode
    OUTPUT["Coordinated Output"]:::outputNode

    INPUT --> EVA
    EVA --> CLASSIFY
    CLASSIFY -->|"SOP tasks"| SOP
    CLASSIFY -->|"CRO tasks"| CRO
    CLASSIFY -->|"Scrum tasks"| SCRUM
    SOP -->|"findings"| BUS
    CRO -->|"findings"| BUS
    SCRUM -->|"findings"| BUS
    BUS -->|"context sharing"| SOP
    BUS -->|"context sharing"| CRO
    BUS -->|"context sharing"| SCRUM
    SOP -->|"results"| TASKS
    CRO -->|"results"| TASKS
    SCRUM -->|"results"| TASKS
    TASKS --> EVA
    EVA --> OUTPUT

    classDef inputStyle fill:#334155,stroke:#64748b,color:#e2e8f0
    classDef evaNode ${evaStyle}
    classDef classifyNode fill:#1e293b,stroke:#475569,color:#cbd5e1
    classDef sopNode ${sopStyle}
    classDef croNode ${croStyle}
    classDef scrumNode ${scrumStyle}
    classDef busNode fill:#1e293b,stroke:#6366f1,color:#a5b4fc
    classDef taskNode fill:#1e293b,stroke:#8b5cf6,color:#c4b5fd
    classDef outputNode fill:#334155,stroke:#22d3ee,color:#cffafe`;

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "system-ui, sans-serif",
        flowchart: { curve: "basis", padding: 15, nodeSpacing: 30, rankSpacing: 40, htmlLabels: true, useMaxWidth: true },
      });
      await mermaid.parse(chart);
      const id = `agent-flow-${Date.now()}`;
      const { svg } = await mermaid.render(id, chart);
      setFlowSvg(svg);
    } catch (e) {
      console.error("Flow diagram render error:", e);
      setFlowSvg("");
    }
  }, [agents, tasks, messages, activeTasks.length, completedTasks.length]);

  useEffect(() => {
    if (activeTab === "flow") {
      generateFlowDiagram();
    }
  }, [activeTab, generateFlowDiagram]);

  return (
    <div data-testid="agent-team-dashboard" className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">Agent Team</span>
          {isTeamActive && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400 bg-green-500/10">
              ACTIVE
            </Badge>
          )}
        </div>
        <div>
          {!isTeamActive ? (
            <Button
              data-testid="button-start-team"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10"
              onClick={startTeam}
              disabled={!isConnected}
            >
              <Play className="w-3 h-3 mr-1" />
              Start Team
            </Button>
          ) : (
            <Button
              data-testid="button-stop-team"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={stopTeam}
            >
              <Square className="w-3 h-3 mr-1" />
              Stop Team
            </Button>
          )}
        </div>
      </div>

      {!isTeamActive && !coordinatedReport && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 mb-1">Agent Team Mode</p>
            <p className="text-xs text-slate-500 max-w-[200px]">
              Start the team to coordinate EVA, SOP, CRO, and Scrum Master agents together
            </p>
          </div>
        </div>
      )}

      {coordinatedReport && !isTeamActive && (
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Coordinated Report</span>
            </div>
            <div data-testid="text-coordinated-report" className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              {coordinatedReport}
            </div>
          </div>
        </ScrollArea>
      )}

      {isTeamActive && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-2 space-y-1 border-b border-slate-700/30">
            {agents.map((agent) => {
              const config = agentConfig[agent.agentType] || agentConfig.eva;
              const sConfig = statusConfig[agent.status] || statusConfig.idle;
              const Icon = config.icon;
              const StatusIcon = sConfig.icon;
              return (
                <div
                  key={agent.agentType}
                  data-testid={`agent-status-${agent.agentType}`}
                  className={`flex items-center gap-2 p-1.5 rounded-md border ${config.bgColor}`}
                >
                  <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                  <span className={`text-xs font-medium ${config.color} min-w-[70px]`}>{config.name}</span>
                  <div className="flex-1 min-w-0">
                    {agent.currentTask && (
                      <span className="text-[10px] text-slate-400 truncate block">{agent.currentTask}</span>
                    )}
                  </div>
                  <StatusIcon className={`w-3 h-3 ${sConfig.color} ${agent.status === "working" ? "animate-spin" : ""}`} />
                </div>
              );
            })}
          </div>

          <div className="flex border-b border-slate-700/30">
            <button
              data-testid="button-show-tasks"
              className={`flex-1 text-xs py-1.5 px-2 flex items-center justify-center gap-1 ${activeTab === "tasks" ? "text-purple-400 border-b-2 border-purple-400" : "text-slate-500"}`}
              onClick={() => setActiveTab("tasks")}
            >
              <CheckCircle2 className="w-3 h-3" />
              Tasks ({tasks.length})
            </button>
            <button
              data-testid="button-show-messages"
              className={`flex-1 text-xs py-1.5 px-2 flex items-center justify-center gap-1 ${activeTab === "messages" ? "text-purple-400 border-b-2 border-purple-400" : "text-slate-500"}`}
              onClick={() => setActiveTab("messages")}
            >
              <MessageSquare className="w-3 h-3" />
              Messages ({messages.length})
            </button>
            <button
              data-testid="button-show-flow"
              className={`flex-1 text-xs py-1.5 px-2 flex items-center justify-center gap-1 ${activeTab === "flow" ? "text-purple-400 border-b-2 border-purple-400" : "text-slate-500"}`}
              onClick={() => setActiveTab("flow")}
            >
              <Network className="w-3 h-3" />
              Flow
            </button>
          </div>

          <ScrollArea className="flex-1" ref={scrollRef}>
            {activeTab === "tasks" && (
              <div className="p-2 space-y-1">
                {tasks.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No tasks yet. Agents will create tasks as they analyze meeting content.</p>
                ) : (
                  <>
                    {activeTasks.length > 0 && (
                      <div className="mb-2">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold px-1">Active</span>
                        {activeTasks.map(task => (
                          <TaskItem key={task.id} task={task} />
                        ))}
                      </div>
                    )}
                    {completedTasks.length > 0 && (
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold px-1">Completed ({completedTasks.length})</span>
                        {completedTasks.slice(0, 10).map(task => (
                          <TaskItem key={task.id} task={task} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === "messages" && (
              <div className="p-2 space-y-1">
                {messages.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No inter-agent messages yet.</p>
                ) : (
                  messages.slice(0, 50).map(msg => (
                    <MessageItem key={msg.id} message={msg} />
                  ))
                )}
              </div>
            )}

            {activeTab === "flow" && (
              <div className="p-3">
                {flowSvg ? (
                  <div
                    ref={flowRef}
                    data-testid="agent-flow-diagram"
                    className="w-full overflow-auto rounded-lg bg-slate-900/50 border border-slate-700/30 p-2"
                    dangerouslySetInnerHTML={{ __html: flowSvg }}
                  />
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                  </div>
                )}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    EVA (Team Lead)
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    SOP Generator
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    CRO Generator
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    Scrum Master
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function TaskItem({ task }: { task: AgentTeamTask }) {
  const config = agentConfig[task.agentType] || agentConfig.eva;
  const statusEmoji = taskStatusIcons[task.status] || "⏳";
  return (
    <div data-testid={`task-item-${task.id}`} className="flex items-start gap-1.5 p-1.5 rounded bg-slate-800/30 text-xs">
      <span className="text-[10px] mt-0.5">{statusEmoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={`font-medium text-[10px] ${config.color}`}>{config.name}</span>
          {task.priority === "high" || task.priority === "urgent" ? (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 border-red-500/30 text-red-400">
              {task.priority}
            </Badge>
          ) : null}
        </div>
        <p className="text-slate-400 truncate">{task.description}</p>
        {task.result && task.status === "completed" && (
          <p className="text-green-400/70 text-[10px] mt-0.5 truncate">{task.result}</p>
        )}
      </div>
    </div>
  );
}

function MessageItem({ message }: { message: AgentTeamMessage }) {
  const fromConfig = agentConfig[message.fromAgent] || agentConfig.eva;
  const toConfig = agentConfig[message.toAgent] || agentConfig.eva;
  const msgConfig = messageTypeConfig[message.messageType] || messageTypeConfig.status_update;
  const MsgIcon = msgConfig.icon;

  return (
    <div data-testid={`message-item-${message.id}`} className="flex items-start gap-1.5 p-1.5 rounded bg-slate-800/30 text-xs">
      <MsgIcon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${msgConfig.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[10px]">
          <span className={fromConfig.color}>{fromConfig.name}</span>
          <ArrowRight className="w-2.5 h-2.5 text-slate-600" />
          <span className={toConfig.color}>{message.toAgent === "all" ? "All Agents" : toConfig.name}</span>
          <span className="text-slate-600 ml-auto">{formatTime(message.createdAt)}</span>
        </div>
        <p className="text-slate-400 truncate mt-0.5">{message.content}</p>
      </div>
    </div>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
