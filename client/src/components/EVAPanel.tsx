import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Monitor, Brain, MessageSquare, FileText, Eye, Play, Pause, Check, ChevronRight, Loader2, RefreshCw, AlertCircle, HelpCircle, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ChatMessage, ObservationSession, Sop } from "@shared/schema";
import { SOPViewer } from "./SOPViewer";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  context?: string;
}

interface EVAPanelProps {
  meetingId: string;
  messages: Message[];
  chatMessages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isScreenSharing?: boolean;
  isObserving?: boolean;
  evaStatus?: "connected" | "disconnected" | "connecting";
  onStartObservation?: () => void;
  onStopObservation?: () => void;
  isNoteTakerProcessing?: boolean;
  onRefreshNotes?: () => void;
  className?: string;
}

type Phase = "observe" | "structure" | "instruct";

const PHASE_CONFIG = {
  observe: {
    icon: Eye,
    label: "Observing",
    description: "Capturing actions, intent, and decisions",
    color: "bg-blue-500",
  },
  structure: {
    icon: FileText,
    label: "Structuring",
    description: "Building SOP sections and headings",
    color: "bg-amber-500",
  },
  instruct: {
    icon: FileCheck,
    label: "Instructing",
    description: "Generating step-by-step instructions",
    color: "bg-green-500",
  },
};

export function EVAPanel({
  meetingId,
  messages,
  chatMessages,
  onSendMessage,
  isScreenSharing,
  isObserving,
  evaStatus = "disconnected",
  onStartObservation,
  onStopObservation,
  isNoteTakerProcessing,
  onRefreshNotes,
  className,
}: EVAPanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "notes" | "observe">("chat");
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [activeSession, setActiveSession] = useState<ObservationSession | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<{ id: string; answer: string } | null>(null);
  const [generatedSop, setGeneratedSop] = useState<Sop | null>(null);
  const [isGeneratingSop, setIsGeneratingSop] = useState(false);
  const [showSopViewer, setShowSopViewer] = useState(false);
  const [sopError, setSopError] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue("");
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const noteTakerMessages = chatMessages.filter(m => m.context === "NoteTaker");
  const latestNotes = noteTakerMessages[noteTakerMessages.length - 1];

  const parseNotes = (content: string) => {
    const sections: { title: string; items: string[] }[] = [];
    let currentSection: { title: string; items: string[] } | null = null;

    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = { title: line.replace(/^#+\s*/, ''), items: [] };
      } else if (line.startsWith('- ') && currentSection) {
        currentSection.items.push(line.substring(2));
      } else if (line.trim() && currentSection && !line.startsWith('#')) {
        currentSection.items.push(line.trim());
      }
    }
    if (currentSection) {
      sections.push(currentSection);
    }
    return sections;
  };

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

  const generateSopMutation = useMutation({
    mutationFn: (sessionId: string) => api.generateSopFromSession(sessionId),
    onSuccess: (sop) => {
      setGeneratedSop(sop);
      setIsGeneratingSop(false);
      setShowSopViewer(true);
      setSopError(null);
      queryClient.invalidateQueries({ queryKey: ["sops"] });
    },
    onError: (error: Error) => {
      setIsGeneratingSop(false);
      setSopError(error.message || "Failed to generate SOP. Please try again.");
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
    if (onStartObservation) {
      onStartObservation();
    }
  }, [createSessionMutation, onStartObservation]);

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
      const nextPhase = phases[currentIndex + 1];
      updateSessionMutation.mutate({
        id: activeSession.id,
        data: { phase: nextPhase },
      });

      if (nextPhase === "instruct") {
        setIsGeneratingSop(true);
        generateSopMutation.mutate(activeSession.id);
      }
    }
  }, [activeSession, updateSessionMutation, generateSopMutation]);

  const currentPhase = (activeSession?.phase || "observe") as Phase;
  const phaseConfig = PHASE_CONFIG[currentPhase];

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
    <div className={cn("flex flex-col h-full bg-card border-l border-border", className)}>
      <div className="flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">EVA Assistant</h2>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "w-2 h-2 rounded-full",
                evaStatus === "connected" ? "bg-green-500 animate-pulse" :
                evaStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
                "bg-muted-foreground"
              )} />
              <p className="text-xs text-muted-foreground">
                {evaStatus === "connected" ? (isObserving ? "Observing" : "Ready") : evaStatus}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 h-10 p-0">
          <TabsTrigger value="chat" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-chat">
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-notes">
            <FileText className="w-4 h-4 mr-1.5" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="observe" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-observe">
            <Eye className="w-4 h-4 mr-1.5" />
            Observe
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col m-0 overflow-hidden data-[state=inactive]:hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    msg.role === "ai" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
                  )}>
                    {msg.role === "ai" ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>

                  <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-foreground">
                        {msg.role === "ai" ? "EVA" : "You"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {msg.context && (
                      <div className="mb-2 px-2 py-1 bg-background/50 border border-border rounded text-[10px] text-muted-foreground flex items-center gap-1 w-fit">
                        <Monitor className="w-3 h-3" />
                        {msg.context}
                      </div>
                    )}

                    <div className={cn(
                      "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted/50 text-foreground border border-border rounded-tl-sm"
                    )}>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                            code: ({node, ...props}) => <code className="bg-background/50 px-1 py-0.5 rounded font-mono text-xs" {...props} />
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="bg-muted/50 border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"></span>
                  </div>
                </motion.div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border bg-card">
            <div className="relative flex items-center">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask EVA about the meeting..."
                className="pr-12 bg-background border-input focus-visible:ring-primary/50 h-12 rounded-full pl-5"
                data-testid="input-eva-chat"
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1.5 hover:bg-primary/10 hover:text-primary rounded-full w-9 h-9"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-2">
              EVA can see shared screens and answer questions in real-time.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="flex-1 flex flex-col m-0 overflow-hidden data-[state=inactive]:hidden">
          <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="font-medium text-sm">Meeting Notes</span>
              {isNoteTakerProcessing && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-xs text-muted-foreground">Updating</span>
                </span>
              )}
            </div>
            {onRefreshNotes && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefreshNotes}
                disabled={isNoteTakerProcessing}
                data-testid="button-refresh-notes"
              >
                <RefreshCw className={cn("w-4 h-4", isNoteTakerProcessing && "animate-spin")} />
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4" data-testid="content-notetaker">
              {!latestNotes ? (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Notes will appear as the meeting progresses
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    EVA analyzes transcriptions to extract key points and action items
                  </p>
                </div>
              ) : (
                <>
                  {parseNotes(latestNotes.content).map((section, idx) => (
                    <div key={idx} className="space-y-2">
                      <h3 className="text-sm font-semibold text-blue-400">{section.title}</h3>
                      <ul className="space-y-1">
                        {section.items.map((item, itemIdx) => (
                          <li
                            key={itemIdx}
                            className="text-sm text-foreground/90 flex items-start gap-2"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">
                      Last updated: {format(new Date(latestNotes.createdAt), "h:mm:ss a")}
                    </p>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {noteTakerMessages.length > 1 && (
            <div className="p-2 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground text-center">
                {noteTakerMessages.length} note update{noteTakerMessages.length !== 1 ? "s" : ""} captured
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="observe" className="flex-1 flex flex-col m-0 overflow-hidden data-[state=inactive]:hidden">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              {(["observe", "structure", "instruct"] as Phase[]).map((phase, index) => {
                const config = PHASE_CONFIG[phase];
                const Icon = config.icon;
                const isActive = currentPhase === phase;
                const isPast = (["observe", "structure", "instruct"] as Phase[]).indexOf(currentPhase) > index;

                return (
                  <div key={phase} className="flex items-center">
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-full transition-all",
                      isActive && "bg-primary text-primary-foreground",
                      isPast && "bg-green-500/20 text-green-500",
                      !isActive && !isPast && "text-muted-foreground"
                    )}>
                      {isPast ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                      <span className="text-xs font-medium hidden sm:inline">{config.label}</span>
                    </div>
                    {index < 2 && (
                      <ChevronRight className="w-3 h-3 text-muted-foreground mx-0.5" />
                    )}
                  </div>
                );
              })}
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
                  <Button size="sm" onClick={advancePhase} disabled={isGeneratingSop} data-testid="button-advance-phase">
                    {currentPhase === "observe" ? "Structure" : "Generate SOP"}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
                {currentPhase === "instruct" && generatedSop && (
                  <Button size="sm" onClick={() => setShowSopViewer(!showSopViewer)} data-testid="button-view-sop">
                    <FileCheck className="w-4 h-4 mr-2" />
                    {showSopViewer ? "Hide SOP" : "View SOP"}
                  </Button>
                )}
              </div>

              {isGeneratingSop && (
                <div className="p-4 bg-primary/5 border-b border-primary/20 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <div>
                    <p className="text-sm font-medium">Generating SOP...</p>
                    <p className="text-xs text-muted-foreground">EVA is analyzing observations</p>
                  </div>
                </div>
              )}

              {sopError && !isGeneratingSop && (
                <div className="p-4 bg-red-500/10 border-b border-red-500/30 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-500">SOP Generation Failed</p>
                    <p className="text-xs text-muted-foreground">{sopError}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSopError(null);
                      if (activeSession) {
                        setIsGeneratingSop(true);
                        generateSopMutation.mutate(activeSession.id);
                      }
                    }}
                    data-testid="button-retry-sop"
                  >
                    Retry
                  </Button>
                </div>
              )}

              {showSopViewer && generatedSop && (
                <div className="flex-1 overflow-auto border-b border-border">
                  <SOPViewer
                    sop={generatedSop}
                    onClose={() => setShowSopViewer(false)}
                  />
                </div>
              )}

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
        </TabsContent>
      </Tabs>
    </div>
  );
}
