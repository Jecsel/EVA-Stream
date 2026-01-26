import { useState, useCallback, useEffect } from "react";
import { Eye, FileText, ListChecks, Play, Pause, Check, HelpCircle, AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ObservationSession, Observation, Clarification } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ObservationPanelProps {
  meetingId: string;
  className?: string;
}

type Phase = "observe" | "structure" | "instruct";

const PHASE_CONFIG = {
  observe: {
    icon: Eye,
    label: "Observing",
    description: "EVA is capturing actions, intent, and decisions",
    color: "bg-blue-500",
  },
  structure: {
    icon: FileText,
    label: "Structuring",
    description: "Building SOP sections and headings",
    color: "bg-amber-500",
  },
  instruct: {
    icon: ListChecks,
    label: "Instructing",
    description: "Generating step-by-step instructions",
    color: "bg-green-500",
  },
};

export function ObservationPanel({ meetingId, className }: ObservationPanelProps) {
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<ObservationSession | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<{ id: string; answer: string } | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["observation-sessions", meetingId],
    queryFn: () => api.listObservationSessions(meetingId),
  });

  const { data: observations = [] } = useQuery({
    queryKey: ["observations", activeSession?.id],
    queryFn: () => activeSession ? api.getObservations(activeSession.id) : Promise.resolve([]),
    enabled: !!activeSession?.id,
    refetchInterval: 3000,
  });

  const { data: clarifications = [] } = useQuery({
    queryKey: ["clarifications", activeSession?.id],
    queryFn: () => activeSession ? api.getClarifications(activeSession.id) : Promise.resolve([]),
    enabled: !!activeSession?.id,
    refetchInterval: 5000,
  });

  const pendingClarifications = clarifications.filter(c => c.status === "pending");

  const createSessionMutation = useMutation({
    mutationFn: (title: string) => api.createObservationSession({
      meetingId,
      title,
      phase: "observe",
      status: "active",
    }),
    onSuccess: (session) => {
      setActiveSession(session);
      queryClient.invalidateQueries({ queryKey: ["observation-sessions", meetingId] });
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ObservationSession> }) =>
      api.updateObservationSession(id, data),
    onSuccess: (session) => {
      setActiveSession(session);
      queryClient.invalidateQueries({ queryKey: ["observation-sessions", meetingId] });
    },
  });

  const answerClarificationMutation = useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      api.answerClarification(id, answer),
    onSuccess: () => {
      setPendingAnswer(null);
      queryClient.invalidateQueries({ queryKey: ["clarifications", activeSession?.id] });
    },
  });

  useEffect(() => {
    const active = sessions.find(s => s.status === "active");
    if (active && !activeSession) {
      setActiveSession(active);
    }
  }, [sessions, activeSession]);

  const startObservation = useCallback(() => {
    const timestamp = new Date().toLocaleTimeString();
    createSessionMutation.mutate(`Session ${timestamp}`);
  }, [createSessionMutation]);

  const pauseObservation = useCallback(() => {
    if (activeSession) {
      updateSessionMutation.mutate({
        id: activeSession.id,
        data: { status: "paused" },
      });
    }
  }, [activeSession, updateSessionMutation]);

  const resumeObservation = useCallback(() => {
    if (activeSession) {
      updateSessionMutation.mutate({
        id: activeSession.id,
        data: { status: "active" },
      });
    }
  }, [activeSession, updateSessionMutation]);

  const advancePhase = useCallback(() => {
    if (!activeSession) return;
    const phases: Phase[] = ["observe", "structure", "instruct"];
    const currentIndex = phases.indexOf(activeSession.phase as Phase);
    if (currentIndex < phases.length - 1) {
      updateSessionMutation.mutate({
        id: activeSession.id,
        data: { phase: phases[currentIndex + 1] },
      });
    }
  }, [activeSession, updateSessionMutation]);

  const currentPhase = (activeSession?.phase || "observe") as Phase;
  const phaseConfig = PHASE_CONFIG[currentPhase];
  const PhaseIcon = phaseConfig.icon;

  const getObservationIcon = (type: string) => {
    switch (type) {
      case "tool_used": return "🛠️";
      case "intent": return "🎯";
      case "decision": return "⚖️";
      case "action": return "👆";
      case "exception": return "⚠️";
      case "verbal_note": return "💬";
      default: return "📝";
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-card", className)}>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">EVA Ops Memory</h2>
          {activeSession?.status === "active" && (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 animate-pulse" data-testid="badge-recording-status">
              Recording
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3 flex-1">
            {(["observe", "structure", "instruct"] as Phase[]).map((phase, index) => {
              const config = PHASE_CONFIG[phase];
              const Icon = config.icon;
              const isActive = currentPhase === phase;
              const isPast = (["observe", "structure", "instruct"] as Phase[]).indexOf(currentPhase) > index;
              
              return (
                <div key={phase} className="flex items-center">
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
                    isActive && "bg-primary text-primary-foreground",
                    isPast && "bg-green-500/20 text-green-500",
                    !isActive && !isPast && "text-muted-foreground"
                  )}>
                    {isPast ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                    <span className="text-xs font-medium hidden sm:inline">{config.label}</span>
                  </div>
                  {index < 2 && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2 text-center">
          {phaseConfig.description}
        </p>
      </div>

      {!activeSession ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Eye className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">Ready to Observe</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Start recording to capture how work is done
          </p>
          <Button onClick={startObservation} data-testid="button-start-observation">
            <Play className="w-4 h-4 mr-2" />
            Start Recording
          </Button>
        </div>
      ) : (
        <>
          <div className="p-3 border-b border-border flex items-center justify-between gap-2">
            {activeSession.status === "active" ? (
              <Button variant="outline" size="sm" onClick={pauseObservation} data-testid="button-pause-observation">
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={resumeObservation} data-testid="button-resume-observation">
                <Play className="w-4 h-4 mr-2" />
                Resume
              </Button>
            )}
            {currentPhase !== "instruct" && (
              <Button size="sm" onClick={advancePhase} data-testid="button-advance-phase">
                {currentPhase === "observe" ? "Start Structuring" : "Generate SOP"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>

          {pendingClarifications.length > 0 && (
            <div className="p-3 bg-amber-500/10 border-b border-amber-500/30">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-500">
                  EVA needs clarification ({pendingClarifications.length})
                </span>
              </div>
              <div className="space-y-2">
                {pendingClarifications.slice(0, 2).map((clarification) => (
                  <Card key={clarification.id} className="bg-background/50">
                    <CardContent className="p-3">
                      <p className="text-sm mb-2">{clarification.question}</p>
                      {pendingAnswer?.id === clarification.id ? (
                        <div className="flex gap-2">
                          <Input
                            placeholder="Your answer..."
                            value={pendingAnswer.answer}
                            onChange={(e) => setPendingAnswer({ id: clarification.id, answer: e.target.value })}
                            className="text-sm h-8"
                            data-testid={`input-clarification-${clarification.id}`}
                          />
                          <Button
                            size="sm"
                            onClick={() => answerClarificationMutation.mutate(pendingAnswer)}
                            disabled={!pendingAnswer.answer.trim()}
                            data-testid={`button-submit-clarification-${clarification.id}`}
                          >
                            Answer
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingAnswer({ id: clarification.id, answer: "" })}
                          data-testid={`button-answer-clarification-${clarification.id}`}
                        >
                          Answer
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {observations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Observations will appear here as EVA captures actions</p>
                </div>
              ) : (
                observations.map((obs) => (
                  <div
                    key={obs.id}
                    className={cn(
                      "p-3 rounded-lg border bg-background/50",
                      obs.isRepeated && "border-amber-500/50"
                    )}
                    data-testid={`observation-${obs.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{getObservationIcon(obs.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {obs.type.replace("_", " ")}
                          </Badge>
                          {obs.app && (
                            <span className="text-xs text-muted-foreground">{obs.app}</span>
                          )}
                          {obs.isRepeated && (
                            <Badge className="bg-amber-500/20 text-amber-500 text-xs">
                              Repeated
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm">{obs.content}</p>
                        {obs.action && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Action: {obs.action}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
