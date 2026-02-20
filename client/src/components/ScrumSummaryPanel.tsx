import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Users, AlertTriangle, CheckCircle, Circle, Clock, ChevronDown, ChevronUp, Target, User, ArrowRight, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

interface ScrumSummaryPanelProps {
  meetingId: string;
}

const severityColors = {
  low: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  medium: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  high: "bg-red-500/10 text-red-500 border-red-500/20",
};

const priorityColors = {
  low: "bg-slate-500/10 text-slate-400",
  medium: "bg-blue-500/10 text-blue-400",
  high: "bg-red-500/10 text-red-400",
};

const statusIcons: Record<string, typeof CheckCircle> = {
  open: Circle,
  in_progress: Clock,
  done: CheckCircle,
  blocked: AlertTriangle,
};

export function ScrumSummaryPanel({ meetingId }: ScrumSummaryPanelProps) {
  const queryClient = useQueryClient();
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; assignee: string; priority: string }>({ title: "", assignee: "", priority: "medium" });
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const { data: scrumSummaryData, isLoading, error } = useQuery({
    queryKey: ["scrumSummary", meetingId],
    queryFn: () => api.getScrumSummary(meetingId),
    enabled: !!meetingId,
    retry: false,
  });

  const updateActionItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateScrumActionItem(id, data),
    onSuccess: () => {
      setEditingItemId(null);
      queryClient.invalidateQueries({ queryKey: ["scrumSummary", meetingId] });
    },
  });

  const deleteActionItemMutation = useMutation({
    mutationFn: (id: string) => api.deleteScrumActionItem(id),
    onSuccess: () => {
      setDeletingItemId(null);
      queryClient.invalidateQueries({ queryKey: ["scrumSummary", meetingId] });
    },
  });

  const startEditing = (item: ActionItem) => {
    setEditingItemId(item.id);
    setEditForm({ title: item.title, assignee: item.assignee || "", priority: item.priority || "medium" });
  };

  const saveEdit = (id: string) => {
    updateActionItemMutation.mutate({ id, data: { title: editForm.title, assignee: editForm.assignee || null, priority: editForm.priority } });
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6" data-testid="section-scrum-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !scrumSummaryData) {
    return null;
  }

  const { summary, actionItems } = scrumSummaryData;
  const scrumData = summary.scrumData as ScrumData | null;

  if (!scrumData) return null;

  return (
    <div className="space-y-4" data-testid="section-scrum-summary">
      <div className="bg-gradient-to-br from-indigo-500/10 via-card to-purple-500/5 border border-indigo-500/20 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              Standup Summary
              <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-400">Scrum Master</Badge>
            </h3>
            <p className="text-xs text-muted-foreground">{summary.fullSummary}</p>
          </div>
        </div>

        {scrumData.sprintGoalProgress && (
          <div className="mb-4 px-3 py-2 bg-background/50 rounded-lg border border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Sprint Progress:</span> {scrumData.sprintGoalProgress}
            </p>
          </div>
        )}

        {scrumData.teamMood && (
          <div className="mb-4 px-3 py-2 bg-background/50 rounded-lg border border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Team Mood:</span> {scrumData.teamMood}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-indigo-400" />
            Participant Updates ({scrumData.participants.length})
          </h4>
          
          {scrumData.participants.map((participant, idx) => {
            const isExpanded = expandedParticipant === participant.name;
            return (
              <div
                key={idx}
                className="bg-background/60 border border-border/50 rounded-lg overflow-hidden"
                data-testid={`card-participant-${idx}`}
              >
                <button
                  onClick={() => setExpandedParticipant(isExpanded ? null : participant.name)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                  data-testid={`button-expand-participant-${idx}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-medium text-indigo-400">
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{participant.name}</span>
                    {participant.blockers.length > 0 && (
                      <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                        {participant.blockers.length} blocker{participant.blockers.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border/30">
                    {participant.yesterday.length > 0 && (
                      <div className="pt-3">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Yesterday / Done</p>
                        <ul className="space-y-1">
                          {participant.yesterday.map((item, i) => (
                            <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                              <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {participant.today.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Today / Planned</p>
                        <ul className="space-y-1">
                          {participant.today.map((item, i) => (
                            <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                              <ArrowRight className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {participant.blockers.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-red-400 font-semibold mb-1.5">Blockers</p>
                        <ul className="space-y-1">
                          {participant.blockers.map((blocker, i) => (
                            <li key={i} className="text-xs text-red-300 flex items-start gap-2">
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

      {scrumData.blockers.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5" data-testid="section-blockers">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3 text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Active Blockers ({scrumData.blockers.filter(b => b.status === "active").length})
          </h4>
          <div className="space-y-2">
            {scrumData.blockers.map((blocker, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-background/60 rounded-lg border border-border/50"
                data-testid={`card-blocker-${idx}`}
              >
                <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  blocker.severity === "high" ? "text-red-400" : 
                  blocker.severity === "medium" ? "text-orange-400" : "text-yellow-400"
                }`} />
                <div className="flex-1">
                  <p className="text-xs text-foreground/90">{blocker.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">Owner: {blocker.owner}</span>
                    <Badge variant="outline" className={`text-[10px] ${severityColors[blocker.severity]}`}>
                      {blocker.severity}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(actionItems as ActionItem[])?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5" data-testid="section-action-items">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-orange-400" />
            Action Items ({(actionItems as ActionItem[]).length})
          </h4>
          <div className="space-y-2">
            {(actionItems as ActionItem[]).map((item) => {
              const StatusIcon = statusIcons[item.status] || Circle;
              const isEditing = editingItemId === item.id;
              const isDeleting = deletingItemId === item.id;

              if (isEditing) {
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-background/60 rounded-lg border border-primary/30 space-y-2"
                    data-testid={`card-action-item-edit-${item.id}`}
                  >
                    <Input
                      value={editForm.title}
                      onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Action item title"
                      className="h-7 text-xs"
                      data-testid={`input-title-${item.id}`}
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        value={editForm.assignee}
                        onChange={(e) => setEditForm(f => ({ ...f, assignee: e.target.value }))}
                        placeholder="Assignee"
                        className="h-7 text-xs flex-1"
                        data-testid={`input-assignee-${item.id}`}
                      />
                      <Select value={editForm.priority} onValueChange={(v) => setEditForm(f => ({ ...f, priority: v }))}>
                        <SelectTrigger className="w-[90px] h-7 text-[10px]" data-testid={`select-priority-edit-${item.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setEditingItemId(null)}
                        data-testid={`button-cancel-edit-${item.id}`}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => saveEdit(item.id)}
                        disabled={!editForm.title.trim() || updateActionItemMutation.isPending}
                        data-testid={`button-save-edit-${item.id}`}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 bg-background/60 rounded-lg border border-border/50 group"
                  data-testid={`card-action-item-${item.id}`}
                >
                  <StatusIcon className={`w-4 h-4 flex-shrink-0 ${
                    item.status === "done" ? "text-green-400" :
                    item.status === "blocked" ? "text-red-400" :
                    item.status === "in_progress" ? "text-blue-400" : "text-muted-foreground"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${item.status === "done" ? "line-through text-muted-foreground" : "text-foreground/90"}`}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.assignee && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <User className="w-2.5 h-2.5" /> {item.assignee}
                        </span>
                      )}
                      {item.priority && (
                        <Badge variant="outline" className={`text-[10px] ${priorityColors[item.priority as keyof typeof priorityColors] || ""}`}>
                          {item.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isDeleting ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-red-400 mr-1">Delete?</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setDeletingItemId(null)}
                          data-testid={`button-cancel-delete-${item.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => deleteActionItemMutation.mutate(item.id)}
                          disabled={deleteActionItemMutation.isPending}
                          data-testid={`button-confirm-delete-${item.id}`}
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={() => startEditing(item)}
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                          onClick={() => setDeletingItemId(item.id)}
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    <Select
                      value={item.status}
                      onValueChange={(value) => updateActionItemMutation.mutate({ id: item.id, data: { status: value } })}
                    >
                      <SelectTrigger className="w-[110px] h-7 text-[10px]" data-testid={`select-status-${item.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
