import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  AlertTriangle, CheckCircle, Circle, Clock,
  ChevronDown, ChevronUp, User, ArrowRight,
  Calendar, ClipboardList, Loader2, Target,
  MessageSquare, Shield, Users, Flame
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CarryOverBlocker {
  description: string;
  owner: string;
  severity: string;
  status: string;
  firstSeen: string | null;
  meetingTitle: string;
}

interface ActionItem {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  priority: string | null;
  meetingId: string;
}

interface TeamMember {
  name: string;
  lastWorkingOn: string[];
  lastCompleted: string[];
  currentBlockers: string[];
  lastSeen: string | null;
  meetingTitle: string;
}

interface DiscussionEntry {
  date: string | null;
  meetingTitle: string;
  summary: string;
  meetingId: string;
}

interface ConsolidatedData {
  hasPreviousStandup: boolean;
  totalStandups: number;
  lastStandupDate: string | null;
  carryOverBlockers: CarryOverBlocker[];
  openActionItems: ActionItem[];
  completedActionItems: ActionItem[];
  teamStatus: TeamMember[];
  discussionHistory: DiscussionEntry[];
}

interface ScrumBoardProps {
  meetingId: string;
  className?: string;
}

const severityConfig: Record<string, { color: string; bg: string; icon: typeof Flame }> = {
  high: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/25", icon: Flame },
  medium: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/25", icon: AlertTriangle },
  low: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25", icon: AlertTriangle },
};

const priorityColors: Record<string, string> = {
  high: "border-red-500/30 text-red-400",
  medium: "border-blue-500/30 text-blue-400",
  low: "border-slate-500/30 text-slate-400",
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return "just now";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function BlockersSection({ blockers }: { blockers: CarryOverBlocker[] }) {
  if (blockers.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
        <CheckCircle className="w-4 h-4 text-green-400" />
        <p className="text-xs text-green-400 font-medium">No active blockers</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="section-blockers">
      {blockers.map((blocker, idx) => {
        const config = severityConfig[blocker.severity] || severityConfig.medium;
        const SeverityIcon = config.icon;
        return (
          <div
            key={idx}
            className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${config.bg}`}
            data-testid={`blocker-${idx}`}
          >
            <SeverityIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/90 leading-relaxed">{blocker.description}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <User className="w-2.5 h-2.5" /> {blocker.owner}
                </span>
                <Badge variant="outline" className={`text-[8px] h-3.5 ${priorityColors[blocker.severity] || ""}`}>
                  {blocker.severity}
                </Badge>
                {blocker.firstSeen && (
                  <span className="text-[9px] text-muted-foreground/60">
                    since {formatDate(blocker.firstSeen)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionItemsSection({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
        <CheckCircle className="w-4 h-4 text-green-400" />
        <p className="text-xs text-green-400 font-medium">No open action items</p>
      </div>
    );
  }

  const statusIcons: Record<string, typeof Circle> = {
    open: Circle,
    in_progress: Clock,
    done: CheckCircle,
    blocked: AlertTriangle,
  };

  return (
    <div className="space-y-1.5" data-testid="section-actions">
      {items.map((item) => {
        const StatusIcon = statusIcons[item.status] || Circle;
        return (
          <div
            key={item.id}
            className="flex items-start gap-2 p-2 bg-background/60 rounded-lg border border-border/50"
            data-testid={`action-${item.id}`}
          >
            <StatusIcon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
              item.status === "blocked" ? "text-red-400" :
              item.status === "in_progress" ? "text-blue-400" : "text-muted-foreground"
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-foreground/90 leading-relaxed">{item.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {item.assignee && (
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <User className="w-2.5 h-2.5" /> {item.assignee}
                  </span>
                )}
                {item.priority && (
                  <Badge variant="outline" className={`text-[8px] h-3.5 ${priorityColors[item.priority] || ""}`}>
                    {item.priority}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[8px] h-3.5 ${
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
  );
}

function TeamStatusSection({ members }: { members: TeamMember[] }) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  if (members.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No team member data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="section-team">
      {members.map((member, idx) => {
        const isExpanded = expandedMember === member.name;
        const hasBlockers = member.currentBlockers.length > 0;
        return (
          <div
            key={idx}
            className={`rounded-lg border overflow-hidden ${hasBlockers ? "border-red-500/20" : "border-border/50"} bg-background/60`}
            data-testid={`team-member-${idx}`}
          >
            <button
              onClick={() => setExpandedMember(isExpanded ? null : member.name)}
              className="w-full flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${
                  hasBlockers ? "bg-red-500/20 text-red-400" : "bg-indigo-500/20 text-indigo-400"
                }`}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium truncate">{member.name}</span>
                {hasBlockers && (
                  <Badge variant="outline" className="text-[8px] h-3.5 border-red-500/30 text-red-400">
                    {member.currentBlockers.length} blocker{member.currentBlockers.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {member.lastSeen && (
                  <span className="text-[9px] text-muted-foreground/50">{formatTimeAgo(member.lastSeen)}</span>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/30">
                {member.lastCompleted.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[9px] uppercase tracking-wide text-green-400/80 font-semibold mb-0.5">Completed</p>
                    <ul className="space-y-0.5">
                      {member.lastCompleted.map((item, i) => (
                        <li key={i} className="text-[11px] text-foreground/70 flex items-start gap-1.5">
                          <CheckCircle className="w-3 h-3 text-green-400/60 mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {member.lastWorkingOn.length > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-blue-400/80 font-semibold mb-0.5">Working On</p>
                    <ul className="space-y-0.5">
                      {member.lastWorkingOn.map((item, i) => (
                        <li key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                          <ArrowRight className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {member.currentBlockers.length > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-red-400 font-semibold mb-0.5">Blockers</p>
                    <ul className="space-y-0.5">
                      {member.currentBlockers.map((blocker, i) => (
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
  );
}

function DiscussionHistorySection({ history }: { history: DiscussionEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? history : history.slice(0, 2);

  if (history.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No discussion history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="section-discussions">
      {visible.map((entry, idx) => (
        <div
          key={idx}
          className="p-2.5 bg-background/60 rounded-lg border border-border/50"
          data-testid={`discussion-${idx}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              {entry.date ? formatDate(entry.date) : ""}
            </span>
            <span className="text-[9px] text-muted-foreground/50 truncate">{entry.meetingTitle}</span>
          </div>
          <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-3">{entry.summary}</p>
        </div>
      ))}
      {history.length > 2 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-[10px] text-indigo-400 hover:text-indigo-300 py-1 transition-colors"
          data-testid="btn-show-more-discussions"
        >
          {showAll ? "Show less" : `Show ${history.length - 2} more`}
        </button>
      )}
    </div>
  );
}

export function ScrumBoard({ meetingId, className }: ScrumBoardProps) {
  const [activeSection, setActiveSection] = useState<"blockers" | "actions" | "team" | "history">("blockers");

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
        <p className="text-sm text-muted-foreground">Loading scrum board...</p>
      </div>
    );
  }

  const board = data as ConsolidatedData | undefined;

  if (!board?.hasPreviousStandup) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`} data-testid="scrum-board-empty">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
          <ClipboardList className="w-7 h-7 text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold mb-1">Ready for First Standup</h3>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          The scrum board will populate after your first standup session with blockers, action items, and team context.
        </p>
      </div>
    );
  }

  const blockerCount = board.carryOverBlockers?.length || 0;
  const actionCount = board.openActionItems?.length || 0;
  const teamCount = board.teamStatus?.length || 0;

  const sections = [
    {
      id: "blockers" as const,
      label: "Blockers",
      icon: Shield,
      count: blockerCount,
      countColor: blockerCount > 0 ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400",
    },
    {
      id: "actions" as const,
      label: "Actions",
      icon: Target,
      count: actionCount,
      countColor: actionCount > 0 ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400",
    },
    {
      id: "team" as const,
      label: "Team",
      icon: Users,
      count: teamCount,
      countColor: "bg-indigo-500/20 text-indigo-400",
    },
    {
      id: "history" as const,
      label: "Context",
      icon: MessageSquare,
      count: board.discussionHistory?.length || 0,
      countColor: "bg-slate-500/20 text-slate-400",
    },
  ];

  return (
    <div className={`flex flex-col ${className}`} data-testid="scrum-board">
      <div className="px-3 pt-3 pb-2 border-b border-border/50">
        {board.lastStandupDate && (
          <p className="text-[9px] text-muted-foreground flex items-center gap-1 mb-2">
            <Calendar className="w-2.5 h-2.5" />
            Last standup: {formatDate(board.lastStandupDate)}
            <span className="text-muted-foreground/40 mx-1">|</span>
            {board.totalStandups} past session{board.totalStandups > 1 ? "s" : ""}
          </p>
        )}

        {blockerCount > 0 && (
          <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-red-500/8 border border-red-500/20 rounded-md">
            <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
            <p className="text-[10px] text-red-400 font-medium">
              {blockerCount} carry-over blocker{blockerCount > 1 ? "s" : ""} from previous standup{board.totalStandups > 1 ? "s" : ""}
            </p>
          </div>
        )}

        <div className="grid grid-cols-4 gap-1 bg-muted/30 rounded-lg p-0.5">
          {sections.map(({ id, label, count, countColor }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`text-[9px] font-medium py-1.5 px-1 rounded-md transition-colors flex flex-col items-center gap-0.5 ${
                activeSection === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-scrum-${id}`}
            >
              <span>{label}</span>
              <span className={`text-[8px] px-1.5 rounded-full ${countColor}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeSection === "blockers" && (
          <BlockersSection blockers={board.carryOverBlockers || []} />
        )}
        {activeSection === "actions" && (
          <ActionItemsSection items={board.openActionItems || []} />
        )}
        {activeSection === "team" && (
          <TeamStatusSection members={board.teamStatus || []} />
        )}
        {activeSection === "history" && (
          <DiscussionHistorySection history={board.discussionHistory || []} />
        )}
      </div>
    </div>
  );
}
