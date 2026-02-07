import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Users, AlertTriangle, CheckCircle, Circle, Clock,
  ChevronDown, ChevronUp, Target, User, ArrowRight,
  Calendar, ClipboardList, Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ScrumParticipantUpdate {
  name: string;
  yesterday: string[];
  today: string[];
  blockers: string[];
}

interface ScrumBlocker {
  description: string;
  owner: string;
  severity: "low" | "medium" | "high";
  status: "active" | "resolved";
}

interface ScrumActionItemData {
  title: string;
  assignee: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
}

interface ScrumData {
  participants: ScrumParticipantUpdate[];
  blockers: ScrumBlocker[];
  actionItems: ScrumActionItemData[];
  teamMood?: string;
  sprintGoalProgress?: string;
}

interface ActionItem {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  priority: string | null;
  meetingId: string;
}

interface ScrumBoardProps {
  meetingId: string;
  className?: string;
}

const severityColors = {
  low: "border-yellow-500/30 text-yellow-400",
  medium: "border-orange-500/30 text-orange-400",
  high: "border-red-500/30 text-red-400",
};

const statusIcons: Record<string, typeof CheckCircle> = {
  open: Circle,
  in_progress: Clock,
  done: CheckCircle,
  blocked: AlertTriangle,
};

const priorityColors = {
  low: "bg-slate-500/10 text-slate-400",
  medium: "bg-blue-500/10 text-blue-400",
  high: "bg-red-500/10 text-red-400",
};

export function ScrumBoard({ meetingId, className }: ScrumBoardProps) {
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "actions" | "blockers">("overview");

  const { data, isLoading } = useQuery({
    queryKey: ["previousStandup", meetingId],
    queryFn: () => api.getPreviousStandup(meetingId),
    enabled: !!meetingId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`} data-testid="scrum-board-loading">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Loading previous standup...</p>
      </div>
    );
  }

  if (!data?.hasPreviousStandup) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`} data-testid="scrum-board-empty">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
          <ClipboardList className="w-7 h-7 text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold mb-1">No Previous Standup</h3>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          This is the first standup for this meeting series. Previous standup data will appear here after your first session.
        </p>
      </div>
    );
  }

  const scrumData = data.scrumData as ScrumData;
  const actionItems = (data.actionItems || []) as ActionItem[];
  const activeBlockers = scrumData?.blockers?.filter(b => b.status === "active") || [];
  const createdAt = data.createdAt ? new Date(data.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  }) : "";

  return (
    <div className={`flex flex-col ${className}`} data-testid="scrum-board">
      <div className="px-4 pt-3 pb-2 border-b border-border/50">
        {createdAt && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-2">
            <Calendar className="w-2.5 h-2.5" />
            Last standup: {createdAt}
          </p>
        )}

        <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex-1 text-[10px] font-medium py-1.5 px-2 rounded-md transition-colors ${
              activeTab === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-scrum-overview"
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("actions")}
            className={`flex-1 text-[10px] font-medium py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1 ${
              activeTab === "actions"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-scrum-actions"
          >
            Actions
            {actionItems.length > 0 && (
              <span className="bg-orange-500/20 text-orange-400 text-[9px] px-1 rounded-full">
                {actionItems.filter(a => a.status !== "done").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("blockers")}
            className={`flex-1 text-[10px] font-medium py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1 ${
              activeTab === "blockers"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-scrum-blockers"
          >
            Blockers
            {activeBlockers.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-[9px] px-1 rounded-full">
                {activeBlockers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === "overview" && (
          <>
            {data.summary && (
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3" data-testid="section-prev-summary">
                <p className="text-[10px] uppercase tracking-wide text-indigo-400 font-semibold mb-1.5">Last Standup Summary</p>
                <p className="text-xs text-foreground/80 leading-relaxed">{data.summary}</p>
              </div>
            )}

            {scrumData?.sprintGoalProgress && (
              <div className="bg-background/50 border border-border/50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">Sprint Progress:</span> {scrumData.sprintGoalProgress}
                </p>
              </div>
            )}

            {scrumData?.participants?.length > 0 && (
              <div data-testid="section-prev-participants">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                  <User className="w-3 h-3" />
                  Last Updates ({scrumData.participants.length})
                </p>
                <div className="space-y-1.5">
                  {scrumData.participants.map((participant, idx) => {
                    const isExpanded = expandedParticipant === participant.name;
                    return (
                      <div
                        key={idx}
                        className="bg-background/60 border border-border/50 rounded-lg overflow-hidden"
                        data-testid={`card-prev-participant-${idx}`}
                      >
                        <button
                          onClick={() => setExpandedParticipant(isExpanded ? null : participant.name)}
                          className="w-full flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-medium text-indigo-400">
                              {participant.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium">{participant.name}</span>
                            {participant.blockers.length > 0 && (
                              <Badge variant="outline" className="text-[9px] h-4 border-red-500/30 text-red-400">
                                {participant.blockers.length} blocker{participant.blockers.length > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/30">
                            {participant.yesterday.length > 0 && (
                              <div className="pt-2">
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Completed</p>
                                <ul className="space-y-0.5">
                                  {participant.yesterday.map((item, i) => (
                                    <li key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                                      <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {participant.today.length > 0 && (
                              <div>
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Working On</p>
                                <ul className="space-y-0.5">
                                  {participant.today.map((item, i) => (
                                    <li key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                                      <ArrowRight className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {participant.blockers.length > 0 && (
                              <div>
                                <p className="text-[9px] uppercase tracking-wide text-red-400 font-semibold mb-1">Blockers</p>
                                <ul className="space-y-0.5">
                                  {participant.blockers.map((blocker, i) => (
                                    <li key={i} className="text-[11px] text-red-300 flex items-start gap-1.5">
                                      <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                                      {blocker}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "actions" && (
          <>
            {actionItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Target className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No action items from last standup</p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="section-prev-actions">
                {actionItems.map((item) => {
                  const StatusIcon = statusIcons[item.status] || Circle;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 p-2.5 bg-background/60 rounded-lg border border-border/50"
                      data-testid={`card-prev-action-${item.id}`}
                    >
                      <StatusIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        item.status === "done" ? "text-green-400" :
                        item.status === "blocked" ? "text-red-400" :
                        item.status === "in_progress" ? "text-blue-400" : "text-muted-foreground"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs leading-relaxed ${
                          item.status === "done" ? "line-through text-muted-foreground" : "text-foreground/90"
                        }`}>
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.assignee && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <User className="w-2.5 h-2.5" /> {item.assignee}
                            </span>
                          )}
                          {item.priority && (
                            <Badge variant="outline" className={`text-[9px] h-4 ${priorityColors[item.priority as keyof typeof priorityColors] || ""}`}>
                              {item.priority}
                            </Badge>
                          )}
                          <Badge variant="outline" className={`text-[9px] h-4 ${
                            item.status === "done" ? "border-green-500/30 text-green-400" :
                            item.status === "blocked" ? "border-red-500/30 text-red-400" :
                            item.status === "in_progress" ? "border-blue-500/30 text-blue-400" :
                            "border-border text-muted-foreground"
                          }`}>
                            {item.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === "blockers" && (
          <>
            {activeBlockers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400/30 mb-2" />
                <p className="text-xs text-muted-foreground">No active blockers from last standup</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Great job keeping things moving!</p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="section-prev-blockers">
                {activeBlockers.map((blocker, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-3 bg-red-500/5 rounded-lg border border-red-500/20"
                    data-testid={`card-prev-blocker-${idx}`}
                  >
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      blocker.severity === "high" ? "text-red-400" :
                      blocker.severity === "medium" ? "text-orange-400" : "text-yellow-400"
                    }`} />
                    <div className="flex-1">
                      <p className="text-xs text-foreground/90 leading-relaxed">{blocker.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <User className="w-2.5 h-2.5" /> {blocker.owner}
                        </span>
                        <Badge variant="outline" className={`text-[9px] h-4 ${severityColors[blocker.severity]}`}>
                          {blocker.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] h-4 border-red-500/30 text-red-400">
                          carry-over
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
