import { EventEmitter } from "events";
import { storage } from "./storage";
import type { AgentType, AgentMessageType, AgentTeamTask, AgentTeamMessage } from "@shared/schema";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface TeamAgentStatus {
  agentType: AgentType;
  status: "idle" | "working" | "completed" | "error";
  currentTask?: string;
  lastActivity?: number;
}

export interface AgentTeamState {
  meetingId: string;
  isActive: boolean;
  agents: Map<AgentType, TeamAgentStatus>;
  taskCount: number;
  messageCount: number;
  startedAt: number;
}

export interface DelegationRequest {
  targetAgent: AgentType;
  description: string;
  priority?: "low" | "normal" | "high" | "urgent";
  context?: string;
}

export interface AgentOutput {
  agentType: AgentType;
  outputType: string;
  content: string;
  metadata?: Record<string, any>;
}

type BroadcastFn = (meetingId: string, message: object) => void;

class MessageBus extends EventEmitter {
  private meetingId: string;
  private broadcastFn: BroadcastFn;

  constructor(meetingId: string, broadcastFn: BroadcastFn) {
    super();
    this.meetingId = meetingId;
    this.broadcastFn = broadcastFn;
  }

  async sendMessage(
    fromAgent: AgentType,
    toAgent: AgentType | "all",
    messageType: AgentMessageType,
    content: string,
    metadata?: Record<string, any>
  ): Promise<AgentTeamMessage> {
    const message = await storage.createAgentTeamMessage({
      meetingId: this.meetingId,
      fromAgent,
      toAgent,
      messageType,
      content,
      metadata: metadata || null,
    });

    this.emit("message", message);
    this.emit(`message:${toAgent}`, message);
    this.emit(`message:${messageType}`, message);

    this.broadcastFn(this.meetingId, {
      type: "team_agent_message",
      message: {
        id: message.id,
        fromAgent: message.fromAgent,
        toAgent: message.toAgent,
        messageType: message.messageType,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt,
      },
    });

    return message;
  }
}

class TaskManager {
  private meetingId: string;
  private broadcastFn: BroadcastFn;

  constructor(meetingId: string, broadcastFn: BroadcastFn) {
    this.meetingId = meetingId;
    this.broadcastFn = broadcastFn;
  }

  async createTask(
    agentType: AgentType,
    description: string,
    priority: "low" | "normal" | "high" | "urgent" = "normal",
    assignedBy: AgentType = "eva"
  ): Promise<AgentTeamTask> {
    const task = await storage.createAgentTeamTask({
      meetingId: this.meetingId,
      agentType,
      description,
      status: "assigned",
      priority,
      assignedBy,
    });

    this.broadcastFn(this.meetingId, {
      type: "team_task_update",
      task: {
        id: task.id,
        agentType: task.agentType,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignedBy: task.assignedBy,
        createdAt: task.createdAt,
      },
    });

    return task;
  }

  async updateTaskStatus(
    taskId: string,
    status: "pending" | "assigned" | "in_progress" | "completed" | "failed",
    result?: string
  ): Promise<AgentTeamTask | undefined> {
    const data: Record<string, any> = { status };
    if (result) data.result = result;
    if (status === "completed") data.completedAt = new Date();

    const task = await storage.updateAgentTeamTask(taskId, data);
    if (task) {
      this.broadcastFn(this.meetingId, {
        type: "team_task_update",
        task: {
          id: task.id,
          agentType: task.agentType,
          description: task.description,
          status: task.status,
          result: task.result,
          priority: task.priority,
          assignedBy: task.assignedBy,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        },
      });
    }
    return task;
  }

  async getTasks(): Promise<AgentTeamTask[]> {
    return storage.getAgentTeamTasksByMeeting(this.meetingId);
  }
}

export class AgentTeamOrchestrator {
  private meetingId: string;
  private messageBus: MessageBus;
  private taskManager: TaskManager;
  private agentStatuses: Map<AgentType, TeamAgentStatus>;
  private broadcastFn: BroadcastFn;
  private isActive: boolean = false;
  private agentOutputs: Map<AgentType, AgentOutput[]>;
  private startedAt: number = 0;

  constructor(meetingId: string, broadcastFn: BroadcastFn) {
    this.meetingId = meetingId;
    this.broadcastFn = broadcastFn;
    this.messageBus = new MessageBus(meetingId, broadcastFn);
    this.taskManager = new TaskManager(meetingId, broadcastFn);
    this.agentStatuses = new Map();
    this.agentOutputs = new Map();
  }

  async start(enabledAgents: AgentType[]): Promise<void> {
    this.isActive = true;
    this.startedAt = Date.now();

    for (const agent of enabledAgents) {
      this.agentStatuses.set(agent, {
        agentType: agent,
        status: "idle",
        lastActivity: Date.now(),
      });
      this.agentOutputs.set(agent, []);
    }

    if (!this.agentStatuses.has("eva")) {
      this.agentStatuses.set("eva", {
        agentType: "eva",
        status: "working",
        currentTask: "Coordinating team",
        lastActivity: Date.now(),
      });
      this.agentOutputs.set("eva", []);
    }

    await this.messageBus.sendMessage(
      "eva",
      "all",
      "status_update",
      "Agent team activated. EVA is coordinating all agents.",
      { enabledAgents }
    );

    this.broadcastFn(this.meetingId, {
      type: "team_status",
      status: "active",
      agents: this.getAgentStatusArray(),
    });

    await this.taskManager.createTask("eva", "Coordinate agent team and analyze meeting content", "high", "eva");
  }

  async stop(): Promise<void> {
    this.isActive = false;

    await this.messageBus.sendMessage(
      "eva",
      "all",
      "status_update",
      "Agent team deactivated."
    );

    this.broadcastFn(this.meetingId, {
      type: "team_status",
      status: "inactive",
      agents: this.getAgentStatusArray(),
    });
  }

  getState(): AgentTeamState {
    return {
      meetingId: this.meetingId,
      isActive: this.isActive,
      agents: this.agentStatuses,
      taskCount: 0,
      messageCount: 0,
      startedAt: this.startedAt,
    };
  }

  async classifyAndDelegate(
    inputType: "video" | "transcript" | "text",
    content: string,
    speaker?: string
  ): Promise<DelegationRequest[]> {
    if (!this.isActive) return [];

    const evaStatus = this.agentStatuses.get("eva");
    if (evaStatus) {
      evaStatus.status = "working";
      evaStatus.currentTask = "Analyzing input and delegating";
      evaStatus.lastActivity = Date.now();
    }

    const enabledAgents: AgentType[] = Array.from(this.agentStatuses.keys()).filter(a => a !== "eva");

    if (enabledAgents.length === 0) return [];

    try {
      const prompt = `You are EVA, the team lead AI agent. Analyze this meeting input and decide which teammate agents should handle it.

Available teammate agents: ${enabledAgents.join(", ")}

Agent capabilities:
- sop: Creates Standard Operating Procedures from process discussions and screen demonstrations
- cro: Creates Core Role Outcome documents from role/responsibility discussions
- scrum: Tracks standup meetings, enforces timeboxes, detects blockers, manages action items

Input type: ${inputType}
${speaker ? `Speaker: ${speaker}` : ""}
Content: ${content.substring(0, 500)}

Respond ONLY with valid JSON array of delegation objects. Each object must have:
- targetAgent: one of [${enabledAgents.map(a => `"${a}"`).join(", ")}]
- description: what the agent should do with this input
- priority: "low", "normal", "high", or "urgent"
- context: relevant excerpt from the content

If no agent should handle this input, respond with empty array [].

Rules:
- Only delegate to agents in the available list
- SOP agent: delegate when processes, procedures, workflows, or step-by-step instructions are discussed/shown
- CRO agent: delegate when roles, responsibilities, objectives, or outcomes are discussed
- Scrum agent: delegate when standup topics (yesterday/today/blockers), sprint items, or action items come up
- Multiple agents can receive the same input if relevant
- Be selective - don't delegate every input, only meaningful content`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const text = response.text || "[]";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const delegations: DelegationRequest[] = JSON.parse(jsonMatch[0]);

      for (const delegation of delegations) {
        if (!enabledAgents.includes(delegation.targetAgent as AgentType)) continue;

        const task = await this.taskManager.createTask(
          delegation.targetAgent,
          delegation.description,
          delegation.priority || "normal",
          "eva"
        );

        await this.messageBus.sendMessage(
          "eva",
          delegation.targetAgent,
          "delegate_task",
          delegation.description,
          {
            taskId: task.id,
            priority: delegation.priority,
            context: delegation.context,
            inputType,
          }
        );

        const agentStatus = this.agentStatuses.get(delegation.targetAgent);
        if (agentStatus) {
          agentStatus.status = "working";
          agentStatus.currentTask = delegation.description;
          agentStatus.lastActivity = Date.now();
        }
      }

      this.broadcastFn(this.meetingId, {
        type: "team_status",
        status: "active",
        agents: this.getAgentStatusArray(),
      });

      return delegations;
    } catch (error) {
      console.error("[AgentTeam] Classification error:", error);
      return [];
    }
  }

  async reportAgentStatus(
    agentType: AgentType,
    status: "idle" | "working" | "completed" | "error",
    taskDescription?: string,
    result?: string
  ): Promise<void> {
    const agentStatus = this.agentStatuses.get(agentType);
    if (agentStatus) {
      agentStatus.status = status;
      agentStatus.currentTask = taskDescription;
      agentStatus.lastActivity = Date.now();
    }

    await this.messageBus.sendMessage(
      agentType,
      "eva",
      "status_update",
      `${agentType} is now ${status}${taskDescription ? `: ${taskDescription}` : ""}`,
      { status, result }
    );

    this.broadcastFn(this.meetingId, {
      type: "team_status",
      status: "active",
      agents: this.getAgentStatusArray(),
    });
  }

  async reportTaskComplete(
    agentType: AgentType,
    taskId: string,
    result: string,
    outputType: string
  ): Promise<void> {
    await this.taskManager.updateTaskStatus(taskId, "completed", result);

    const outputs = this.agentOutputs.get(agentType) || [];
    outputs.push({ agentType, outputType, content: result });
    this.agentOutputs.set(agentType, outputs);

    const agentStatus = this.agentStatuses.get(agentType);
    if (agentStatus) {
      agentStatus.status = "idle";
      agentStatus.currentTask = undefined;
      agentStatus.lastActivity = Date.now();
    }

    await this.messageBus.sendMessage(
      agentType,
      "eva",
      "task_complete",
      `Completed: ${result.substring(0, 200)}`,
      { taskId, outputType, fullResult: result }
    );

    this.broadcastFn(this.meetingId, {
      type: "team_status",
      status: "active",
      agents: this.getAgentStatusArray(),
    });
  }

  async shareContext(
    fromAgent: AgentType,
    toAgent: AgentType | "all",
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.messageBus.sendMessage(
      fromAgent,
      toAgent,
      "context_share",
      content,
      metadata
    );
  }

  async sendAlert(
    fromAgent: AgentType,
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.messageBus.sendMessage(
      fromAgent,
      "eva",
      "alert",
      content,
      metadata
    );
  }

  async sendFinding(
    fromAgent: AgentType,
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.messageBus.sendMessage(
      fromAgent,
      "eva",
      "finding",
      content,
      metadata
    );
  }

  async generateCoordinatedOutput(): Promise<string> {
    const allOutputs: AgentOutput[] = [];
    this.agentOutputs.forEach((outputs) => {
      allOutputs.push(...outputs);
    });

    if (allOutputs.length === 0) {
      return "No agent outputs collected during this session.";
    }

    const tasks = await this.taskManager.getTasks();
    const messages = await storage.getAgentTeamMessagesByMeeting(this.meetingId);

    const prompt = `You are EVA, the team lead AI. Generate a unified meeting report that synthesizes outputs from all teammate agents.

Agent Outputs:
${allOutputs.map(o => `--- ${o.agentType.toUpperCase()} (${o.outputType}) ---\n${o.content.substring(0, 1000)}`).join("\n\n")}

Tasks Completed: ${tasks.filter(t => t.status === "completed").length} of ${tasks.length}
Inter-agent Messages: ${messages.length}

Generate a comprehensive meeting summary in markdown format with these sections:
1. **Meeting Overview** - Brief summary of what was discussed
2. **Agent Team Activity** - What each agent contributed
3. **Key Findings** - Cross-referenced insights from multiple agents
4. **Documents Generated** - List of SOPs, CROs, or other documents
5. **Action Items** - Consolidated action items from all agents
6. **Recommendations** - Suggestions based on combined agent analysis

Keep it concise and actionable. Attribute findings to the relevant agent.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      return response.text || "Failed to generate coordinated output.";
    } catch (error) {
      console.error("[AgentTeam] Coordinated output error:", error);
      return "Error generating coordinated meeting report.";
    }
  }

  getAgentStatusArray(): TeamAgentStatus[] {
    return Array.from(this.agentStatuses.values());
  }

  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  isTeamActive(): boolean {
    return this.isActive;
  }
}

const activeTeams = new Map<string, AgentTeamOrchestrator>();

export function getOrCreateTeam(meetingId: string, broadcastFn: BroadcastFn): AgentTeamOrchestrator {
  let team = activeTeams.get(meetingId);
  if (!team) {
    team = new AgentTeamOrchestrator(meetingId, broadcastFn);
    activeTeams.set(meetingId, team);
  }
  return team;
}

export function getTeam(meetingId: string): AgentTeamOrchestrator | undefined {
  return activeTeams.get(meetingId);
}

export function removeTeam(meetingId: string): void {
  activeTeams.delete(meetingId);
}
