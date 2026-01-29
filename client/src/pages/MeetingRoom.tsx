import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { JitsiMeeting } from "@/components/JitsiMeeting";
import { EVAPanel } from "@/components/EVAPanel";
import { EVAMeetingAssistant, type EvaMessage } from "@/components/EVAMeetingAssistant";
import { SOPDocument } from "@/components/SOPDocument";
import { SOPFlowchart } from "@/components/SOPFlowchart";
import { LiveTranscriptPanel } from "@/components/LiveTranscriptPanel";
import { AgentSelector } from "@/components/AgentSelector";
import { Video, ChevronLeft, FileText, GitGraph, Eye, EyeOff, PhoneOff, ScrollText, Brain, MessageSquare, ToggleLeft, ToggleRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEvaLive } from "@/hooks/useEvaLive";
import type { ChatMessage } from "@shared/schema";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  context?: string;
}

export default function MeetingRoom() {
  const [, params] = useRoute("/meeting/:id");
  const [, setLocation] = useLocation();
  const roomId = params?.id || "demo-room";
  const queryClient = useQueryClient();
  
  const [isEVAPanelOpen, setIsEVAPanelOpen] = useState(true);
  const [evaPanelMode, setEvaPanelMode] = useState<"assistant" | "observe" | "cro">("assistant");
  const [isScreenObserverEnabled, setIsScreenObserverEnabled] = useState(true);
  const [isCROEnabled, setIsCROEnabled] = useState(false);
  const [croContent, setCroContent] = useState(`# Core Role Outcomes

*Waiting to generate CRO...*

Enable the CRO Agent and discuss role responsibilities during the meeting to generate Core Role Outcomes.
`);
  const [isSOPOpen, setIsSOPOpen] = useState(false);
  const [isFlowchartOpen, setIsFlowchartOpen] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState<"idle" | "connecting" | "transcribing" | "error">("idle");
  const [transcripts, setTranscripts] = useState<Array<{id: string; text: string; speaker: string; timestamp: Date; isFinal: boolean;}>>([]);
  const [jitsiApi, setJitsiApi] = useState<any>(null);
  const [isJitsiTranscribing, setIsJitsiTranscribing] = useState(false);
  const [evaStatus, setEvaStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [evaMessages, setEvaMessages] = useState<EvaMessage[]>([]);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [hasJoinedMeeting, setHasJoinedMeeting] = useState(false);
  const meetingStartTime = useRef(Date.now());
  const [sopContent, setSopContent] = useState(`# Live SOP Document

*Waiting for screen observations...*

Start sharing your screen and EVA will automatically generate an SOP based on what it observes.
`);
  const [isSopUpdating, setIsSopUpdating] = useState(false);
  const [sopObservationCount, setSopObservationCount] = useState(0);
  const [sopVersion, setSopVersion] = useState(0);
  const [liveFlowchartCode, setLiveFlowchartCode] = useState<string | undefined>(undefined);

  const hasEndedMeetingRef = useRef(false);
  const meetingIdRef = useRef<string | null>(null);
  const sopContentRef = useRef(sopContent);
  const meetingActiveRef = useRef(false);

  useEffect(() => {
    sopContentRef.current = sopContent;
  }, [sopContent]);

  useEffect(() => {
    const timer = setTimeout(() => {
      meetingActiveRef.current = true;
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const { data: meeting } = useQuery({
    queryKey: ["meeting", roomId],
    queryFn: () => api.getMeetingByRoomId(roomId),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
  });

  const isAgentTypeSelected = useCallback((agentType: string): boolean => {
    // Support backward compatibility: treat legacy "sop" type as "eva"
    const typesToCheck = agentType === "eva" ? ["eva", "sop"] : [agentType];
    return agents.some(agent => 
      typesToCheck.includes(agent.type) && selectedAgents.includes(agent.id)
    );
  }, [agents, selectedAgents]);

  const { data: jaasToken } = useQuery({
    queryKey: ["jaas-token", roomId],
    queryFn: async () => {
      const response = await fetch("/api/jaas/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: `VideoAI-${roomId}`,
          userName: "User",
        }),
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 60 * 2,
  });

  useEffect(() => {
    if (meeting?.id) {
      meetingIdRef.current = meeting.id;
      if (agents.length > 0) {
        const allAgentIds = agents.map(a => a.id);
        setSelectedAgents(allAgentIds);
      }
    }
  }, [meeting?.id, agents]);

  const prevSelectedAgentsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isScreenObserverEnabled && evaPanelMode === "observe") {
      setEvaPanelMode("assistant");
    }
    if (!isCROEnabled && evaPanelMode === "cro") {
      setEvaPanelMode("assistant");
    }
  }, [isScreenObserverEnabled, isCROEnabled, evaPanelMode]);

  useEffect(() => {
    if (meeting?.id) {
      const key = `agent-toggles-${meeting.id}`;
      sessionStorage.setItem(key, JSON.stringify({
        screenObserver: isScreenObserverEnabled,
        cro: isCROEnabled
      }));
    }
  }, [meeting?.id, isScreenObserverEnabled, isCROEnabled]);

  useEffect(() => {
    if (meeting?.id) {
      const key = `agent-toggles-${meeting.id}`;
      const saved = sessionStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (typeof parsed.screenObserver === 'boolean') {
            setIsScreenObserverEnabled(parsed.screenObserver);
          }
          if (typeof parsed.cro === 'boolean') {
            setIsCROEnabled(parsed.cro);
          }
        } catch (e) {
          // ignore parse errors
        }
      } else {
        // New meeting: SOP Agent enabled by default, CRO disabled
        setIsScreenObserverEnabled(true);
        setIsCROEnabled(false);
      }
    }
  }, [meeting?.id]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setMeetingDuration(Math.floor((Date.now() - meetingStartTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const autoSaveMeeting = useCallback(() => {
    if (!hasEndedMeetingRef.current && meetingIdRef.current && meetingActiveRef.current) {
      const duration = formatDuration(Math.floor((Date.now() - meetingStartTime.current) / 1000));
      const params = new URLSearchParams();
      params.append('sopContent', sopContentRef.current);
      params.append('duration', duration);
      navigator.sendBeacon(
        `/api/meetings/${meetingIdRef.current}/end-beacon`, 
        new Blob([params.toString()], { type: 'application/x-www-form-urlencoded' })
      );
      hasEndedMeetingRef.current = true;
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasEndedMeetingRef.current && meetingIdRef.current && meetingActiveRef.current) {
        autoSaveMeeting();
        e.preventDefault();
        e.returnValue = 'Your meeting recording may not be saved. Click "End Call" to save properly.';
        return e.returnValue;
      }
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) {
        autoSaveMeeting();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [autoSaveMeeting]);

  const handleEndMeeting = async () => {
    if (!meeting?.id || isEndingMeeting) return;
    
    setIsEndingMeeting(true);
    try {
      stopObserving();
      stopScreenCapture();
      
      const duration = formatDuration(meetingDuration);
      const result = await api.endMeeting(meeting.id, sopContent, duration);
      
      if (result.recording) {
        hasEndedMeetingRef.current = true;
        setLocation("/");
      } else {
        throw new Error("Recording not created");
      }
    } catch (error) {
      console.error("Failed to end meeting:", error);
      setIsEndingMeeting(false);
      addSystemMessage("Failed to save recording. Please try ending the call again.");
    }
  };

  const { data: chatMessages = [] } = useQuery({
    queryKey: ["messages", meeting?.id],
    queryFn: () => api.getChatMessages(meeting!.id),
    enabled: !!meeting?.id,
    refetchInterval: 3000,
  });

  const handleEvaMessage = useCallback((message: { type: string; content: string }) => {
    if (message.type === "text" && message.content && meeting?.id) {
      api.createChatMessage(meeting.id, {
        role: "ai",
        content: message.content,
        context: "Screen Analysis",
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["messages", meeting.id] });
      });
    }
  }, [meeting?.id, queryClient]);

  const handleSopUpdate = useCallback((content: string, observationCount?: number, version?: number, flowchartCode?: string) => {
    // Replace entire SOP content with new generated content
    setSopContent(content);
    setIsSopUpdating(false);
    if (observationCount !== undefined) setSopObservationCount(observationCount);
    if (version !== undefined) setSopVersion(version);
    if (flowchartCode) setLiveFlowchartCode(flowchartCode);
  }, []);

  const handleSopStatus = useCallback((observationCount: number, version: number) => {
    setSopObservationCount(observationCount);
    setSopVersion(version);
  }, []);

  const {
    isConnected: evaConnected,
    isObserving,
    startObserving,
    stopObserving,
    startScreenCapture,
    stopScreenCapture,
    sendTextMessage,
  } = useEvaLive({
    meetingId: meeting?.id || "",
    onMessage: handleEvaMessage,
    onSopUpdate: handleSopUpdate,
    onSopStatus: handleSopStatus,
    onStatusChange: setEvaStatus,
  });

  useEffect(() => {
    if (!isScreenObserverEnabled && isObserving) {
      stopObserving();
      stopScreenCapture();
    }
  }, [isScreenObserverEnabled, isObserving, stopObserving, stopScreenCapture]);


  useEffect(() => {
    if (!jitsiApi || agents.length === 0) return;
    
    // Support backward compatibility: treat legacy "sop" type as "eva"
    const wasEvaSelected = agents.some(
      a => (a.type === "eva" || a.type === "sop") && prevSelectedAgentsRef.current.includes(a.id)
    );
    const isEvaSelected = isAgentTypeSelected("eva");
    
    if (wasEvaSelected && !isEvaSelected && isObserving) {
      stopObserving();
      stopScreenCapture();
    }
    
    prevSelectedAgentsRef.current = selectedAgents;
  }, [selectedAgents, agents, jitsiApi, isObserving, isAgentTypeSelected, stopObserving, stopScreenCapture]);

  const messages: Message[] = chatMessages.map(msg => ({
    id: msg.id,
    role: msg.role as "user" | "ai",
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    context: msg.context || undefined,
  }));

  const displayMessages = messages.length === 0 ? [{
    id: "welcome",
    role: "ai" as const,
    content: "Hello! I'm EVA, your AI assistant. I can observe your screen, take meeting notes, and help document processes in real-time. Use the tabs above to switch between Chat, Notes, and Observation modes.",
    timestamp: new Date(),
  }] : messages;

  const saveChatMessage = useMutation({
    mutationFn: (data: { role: string; content: string; context?: string }) =>
      api.createChatMessage(meeting!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", meeting?.id] });
    },
  });

  const handleJitsiApiReady = (api: any) => {
    setJitsiApi(api);
    
    // Helper to mark user as joined and enable transcription (idempotent)
    const markJoined = () => {
      setHasJoinedMeeting((prev) => {
        if (!prev) {
          console.log("Setting hasJoinedMeeting=true");
          setTimeout(() => {
            setIsJitsiTranscribing(true);
            setTranscriptStatus("transcribing");
            console.log("Auto-enabled Jitsi transcription for wake word detection");
          }, 3500);
        }
        return true;
      });
    };

    // Check if already in conference (can happen if event fired before listener was added)
    // Use multiple detection methods for reliability
    const checkJoinedState = () => {
      try {
        // Method 1: Check if we have a user ID (indicates we're in the conference)
        const myUserId = api.getMyUserId?.();
        if (myUserId) {
          console.log("Detected already joined via getMyUserId:", myUserId);
          markJoined();
          return true;
        }
        
        // Method 2: Check participants list for local user
        const participants = api.getParticipantsInfo?.();
        if (participants && participants.length > 0) {
          const hasLocal = participants.some((p: any) => p.local);
          if (hasLocal) {
            console.log("Detected already joined via local participant");
            markJoined();
            return true;
          }
        }
      } catch (e) {
        console.log("Could not check join state:", e);
      }
      return false;
    };

    // Check immediately
    checkJoinedState();
    
    // Also re-check after a short delay in case participant registration is delayed
    setTimeout(() => checkJoinedState(), 1500);
    setTimeout(() => checkJoinedState(), 3000);
    
    api.addEventListeners({
      videoConferenceJoined: async () => {
        markJoined();
      },
      screenSharingStatusChanged: async (payload: { on: boolean }) => {
        setIsScreenSharing(payload.on);
        
        if (payload.on) {
          if (isAgentTypeSelected("eva") && isScreenObserverEnabled) {
            addSystemMessage("Screen sharing started. Screen Observer is analyzing the visual content.");
            
            if (evaConnected && isObserving) {
              try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ 
                  video: { frameRate: 1 } 
                });
                startScreenCapture(stream);
                addSystemMessage("Screen Observer is now observing your shared screen.");
              } catch (e) {
                console.log("Could not start screen capture for Screen Observer:", e);
                addSystemMessage("Could not access screen for observation. Please enable Screen Observer manually.");
              }
            }
          }
        } else {
          if (isAgentTypeSelected("eva") && isScreenObserverEnabled) {
            addSystemMessage("Screen sharing ended.");
          }
          stopScreenCapture();
        }
      },
      videoConferenceLeft: () => {
        setHasJoinedMeeting(false);
        stopObserving();
        stopScreenCapture();
        setIsJitsiTranscribing(false);
        setTranscriptStatus("idle");
      }
    });
  };

  const addSystemMessage = (content: string) => {
    if (!meeting?.id) return;
    saveChatMessage.mutate({
      role: "ai",
      content,
      context: "System Event",
    });
  };

  // Handle Jitsi transcription and save to database
  const handleTranscriptionReceived = useCallback(async (text: string, participant: string, isFinal: boolean) => {
    if (!meeting?.id || !text.trim()) return;
    
    const transcriptEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: text.trim(),
      speaker: participant || "Unknown",
      timestamp: new Date(),
      isFinal,
    };
    
    // Update local state for LiveTranscriptPanel display
    setTranscripts(prev => {
      // If not final, update existing interim transcript for this speaker
      if (!isFinal) {
        const existingIndex = prev.findIndex(t => !t.isFinal && t.speaker === participant);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = transcriptEntry;
          return updated;
        }
      }
      return [...prev.filter(t => t.isFinal || t.speaker !== participant), transcriptEntry];
    });
    
    // Save final transcripts to database
    if (isFinal && text.trim().length > 2) {
      try {
        await api.createTranscriptSegment(meeting.id, {
          text: text.trim(),
          speaker: participant || "Unknown",
          isFinal: true,
        });
      } catch (error) {
        console.error("Failed to save transcript segment:", error);
      }
    }
  }, [meeting?.id]);

  const handleSendMessage = async (content: string) => {
    if (!meeting?.id) return;

    try {
      setIsSopUpdating(true);
      const response = await api.sendAIChat(meeting.id, content, isScreenSharing);
      
      queryClient.invalidateQueries({ queryKey: ["messages", meeting.id] });
      
      if (response.sopUpdate && !sopContent.includes(response.sopUpdate.trim())) {
          setSopContent(prev => prev + "\n" + response.sopUpdate);
      }
      setIsSopUpdating(false);
    } catch (error) {
      console.error("Failed to get AI response", error);
      setIsSopUpdating(false);
    }
  };

  const toggleEvaObservation = async () => {
    if (isObserving) {
      stopObserving();
      stopScreenCapture();
      addSystemMessage("Screen Observer stopped.");
    } else {
      if (!isScreenObserverEnabled) {
        console.log("Screen Observer is disabled, cannot start observation");
        return;
      }
      startObserving();
      
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { frameRate: 1 } 
        });
        startScreenCapture(stream);
        addSystemMessage("Screen Observer is now analyzing your screen in real-time.");
      } catch (e) {
        console.log("Could not start screen capture:", e);
        addSystemMessage("Screen capture was cancelled. Click the eye icon again to try sharing your screen.");
        stopObserving();
      }
    }
  };

  const handleStartObservation = async () => {
    if (!isScreenObserverEnabled) {
      console.log("Screen Observer is disabled, cannot start observation");
      return;
    }
    if (!isObserving) {
      startObserving();
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { frameRate: 1 } 
        });
        startScreenCapture(stream);
        addSystemMessage("Screen Observer is now analyzing your screen in real-time.");
      } catch (e) {
        console.log("Could not start screen capture:", e);
        addSystemMessage("Screen capture was cancelled. Click the eye icon to try sharing your screen.");
        stopObserving();
      }
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <main className="flex-1 flex flex-col relative">
        <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-background z-10">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="mr-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (meetingActiveRef.current && !hasEndedMeetingRef.current) {
                  handleEndMeeting();
                } else {
                  setLocation("/");
                }
              }}
              data-testid="button-back-to-dashboard"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">Meeting</h1>
              <p className="text-xs text-muted-foreground">{roomId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             {meeting?.id && (
               <AgentSelector
                 meetingId={meeting.id}
                 roomId={roomId}
                 selectedAgents={selectedAgents}
                 onAgentsChange={setSelectedAgents}
                 isScreenObserverEnabled={isScreenObserverEnabled}
                 onScreenObserverChange={setIsScreenObserverEnabled}
                 isCROEnabled={isCROEnabled}
                 onCROChange={setIsCROEnabled}
               />
             )}
             {hasJoinedMeeting && (
               <div className={`bg-card/50 border px-3 py-1.5 rounded-full flex items-center gap-2 ${
                 evaConnected ? 'border-green-500/50' : 'border-border'
               }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    evaStatus === "connected" ? "bg-green-500 animate-pulse" :
                    evaStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
                    "bg-gray-500"
                  }`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    EVA {evaStatus === "connected" ? (isObserving && isScreenObserverEnabled ? "Observing" : "Ready") : evaStatus}
                  </span>
               </div>
             )}
             <div className="bg-card/50 border border-border px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-muted-foreground">{formatDuration(meetingDuration)}</span>
             </div>
          </div>
        </header>

        <div className="flex-1 p-4 relative flex gap-4 overflow-hidden">
          <div className={`flex-1 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300`}>
             <JitsiMeeting 
               roomName={`VideoAI-${roomId}`}
               displayName="User"
               onApiReady={handleJitsiApiReady}
               onTranscriptionReceived={handleTranscriptionReceived}
               className="bg-zinc-900"
               jwt={jaasToken?.token}
               appId={jaasToken?.appId}
             />
          </div>

          {meeting?.id && hasJoinedMeeting && (
            <div 
              className={`
                transition-all duration-500 ease-in-out transform origin-right
                ${isEVAPanelOpen ? 'w-[400px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden hidden'}
                rounded-2xl overflow-hidden shadow-xl border border-border
              `}
            >
              {/* Panel header with mode tabs */}
              <div className="bg-muted/30 border-b">
                {/* Mode tabs - show Screen Observer tab only if SOP Agent is enabled */}
                <div className="flex bg-background/50">
                  <button
                    onClick={() => setEvaPanelMode("assistant")}
                    className={`flex-1 py-2.5 px-3 text-xs font-medium transition-colors ${
                      evaPanelMode === "assistant" 
                        ? "bg-background text-foreground border-b-2 border-purple-500" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-eva-mode-assistant"
                  >
                    <MessageSquare className="w-3 h-3 inline mr-1" />
                    Meeting Assistant
                  </button>
                  {isScreenObserverEnabled && (
                    <button
                      onClick={() => setEvaPanelMode("observe")}
                      className={`flex-1 py-2.5 px-3 text-xs font-medium transition-colors ${
                        evaPanelMode === "observe" 
                          ? "bg-background text-foreground border-b-2 border-blue-500" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="button-eva-mode-observe"
                    >
                      <Eye className="w-3 h-3 inline mr-1" />
                      Screen Observer
                    </button>
                  )}
                  {isCROEnabled && (
                    <button
                      onClick={() => setEvaPanelMode("cro")}
                      className={`flex-1 py-2.5 px-3 text-xs font-medium transition-colors ${
                        evaPanelMode === "cro" 
                          ? "bg-background text-foreground border-b-2 border-green-500" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="button-eva-mode-cro"
                    >
                      <FileText className="w-3 h-3 inline mr-1" />
                      CRO Generator
                    </button>
                  )}
                </div>
              </div>
              
              {/* Show content based on selected mode */}
              {evaPanelMode === "assistant" && (
                <EVAMeetingAssistant
                  meetingId={meeting.id}
                  meetingTitle={meeting.title}
                  meetingStatus={meeting.status}
                  className="h-[calc(100%-120px)]"
                  onRequestScreenObserver={() => {
                    if (isScreenObserverEnabled) {
                      setEvaPanelMode("observe");
                    }
                  }}
                  currentSopContent={sopContent}
                  messages={evaMessages}
                  setMessages={setEvaMessages}
                />
              )}
              
              {evaPanelMode === "observe" && isScreenObserverEnabled && (
                <EVAPanel 
                  meetingId={meeting.id}
                  messages={displayMessages}
                  chatMessages={chatMessages}
                  onSendMessage={handleSendMessage}
                  isScreenSharing={isScreenSharing}
                  isObserving={isObserving}
                  evaStatus={evaStatus}
                  onStartObservation={handleStartObservation}
                  onStopObservation={() => {
                    stopObserving();
                    stopScreenCapture();
                  }}
                  sopContent={sopContent}
                  onSopContentChange={setSopContent}
                  isSopUpdating={isSopUpdating}
                  className="h-[calc(100%-120px)]"
                />
              )}
              
              {evaPanelMode === "cro" && isCROEnabled && (
                <div className="h-[calc(100%-120px)] flex flex-col p-4 overflow-y-auto">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm text-green-500">CRO Generator</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Discuss role responsibilities during the meeting. The CRO Agent will analyze the conversation and generate Core Role Outcomes using the FABIUS structure.
                    </p>
                  </div>
                  <div className="flex-1 bg-muted/30 rounded-lg p-4 overflow-y-auto">
                    <div className="prose prose-sm prose-invert max-w-none">
                      <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {croContent}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isAgentTypeSelected("eva") && (
            <div 
              className={`
                transition-all duration-500 ease-in-out transform origin-right
                ${isSOPOpen ? 'w-[400px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden hidden'}
                rounded-2xl overflow-hidden shadow-xl border border-border
              `}
            >
              <SOPDocument 
                  content={sopContent}
                  isUpdating={isSopUpdating}
                  onContentChange={setSopContent}
                  className="h-full"
              />
            </div>
          )}

          {isAgentTypeSelected("flowchart") && (
            <div 
              className={`
                transition-all duration-500 ease-in-out transform origin-right
                ${isFlowchartOpen ? 'w-[400px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden hidden'}
                rounded-2xl overflow-hidden shadow-xl border border-border
              `}
            >
              <SOPFlowchart 
                  sopContent={sopContent}
                  meetingId={meeting?.id}
                  className="h-full"
                  liveFlowchartCode={liveFlowchartCode}
              />
            </div>
          )}

          {isAgentTypeSelected("transcription") && (
            <div 
              className={`
                transition-all duration-500 ease-in-out transform origin-right
                ${isTranscriptOpen ? 'w-[350px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden hidden'}
                rounded-2xl overflow-hidden shadow-xl border border-border
              `}
            >
              <LiveTranscriptPanel 
                  transcripts={transcripts}
                  isTranscribing={isJitsiTranscribing}
                  onToggleTranscription={() => {}}
                  status={transcriptStatus}
                  className="h-full"
              />
            </div>
          )}
        </div>

        <div className="h-20 flex items-center justify-center gap-4 px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border/50">
            {isScreenObserverEnabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant={isObserving ? "default" : "outline"} 
                      size="icon" 
                      className={`h-12 w-12 rounded-full border-2 ${isObserving ? 'bg-blue-600 border-blue-600 hover:bg-blue-700' : 'border-border bg-card hover:bg-muted'}`}
                      onClick={toggleEvaObservation}
                      disabled={!evaConnected}
                      data-testid="button-toggle-eva-observation"
                    >
                      {isObserving ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isObserving ? "Stop Screen Observer" : "Start Screen Observer"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {hasJoinedMeeting && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant={isEVAPanelOpen ? "default" : "outline"} 
                      size="icon" 
                      className={`h-12 w-12 rounded-full border-2 ${isEVAPanelOpen ? 'bg-primary border-primary hover:bg-primary/90' : 'border-border bg-card hover:bg-muted'}`}
                      onClick={() => setIsEVAPanelOpen(!isEVAPanelOpen)}
                      data-testid="button-toggle-eva-panel"
                    >
                      <Brain className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle EVA Assistant</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {isScreenObserverEnabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant={isSOPOpen ? "default" : "outline"} 
                      size="icon" 
                      className={`h-12 w-12 rounded-full border-2 ${isSOPOpen ? 'bg-secondary border-secondary hover:bg-secondary/90' : 'border-border bg-card hover:bg-muted'}`}
                      onClick={() => setIsSOPOpen(!isSOPOpen)}
                      data-testid="button-toggle-sop"
                    >
                      <FileText className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle SOP Document</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {isAgentTypeSelected("transcription") && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant={isTranscriptOpen ? "default" : "outline"} 
                      size="icon" 
                      className={`h-12 w-12 rounded-full border-2 ${isTranscriptOpen ? 'bg-cyan-500 border-cyan-500 hover:bg-cyan-600 text-white' : 'border-border bg-card hover:bg-muted'}`}
                      onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
                      data-testid="button-toggle-transcript"
                    >
                      <ScrollText className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Live Transcript</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {isAgentTypeSelected("flowchart") && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant={isFlowchartOpen ? "default" : "outline"} 
                      size="icon" 
                      className={`h-12 w-12 rounded-full border-2 ${isFlowchartOpen ? 'bg-orange-500 border-orange-500 hover:bg-orange-600 text-white' : 'border-border bg-card hover:bg-muted'}`}
                      onClick={() => setIsFlowchartOpen(!isFlowchartOpen)}
                      data-testid="button-toggle-flowchart"
                    >
                      <GitGraph className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle SOP Flowchart</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="h-12 w-16 rounded-full ml-4"
                    onClick={handleEndMeeting}
                    disabled={isEndingMeeting}
                    data-testid="button-end-call"
                  >
                    <span className="sr-only">End Call</span>
                    <PhoneOff className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isEndingMeeting ? "Saving recording..." : "End Call & Save Recording"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
        </div>
      </main>
    </div>
  );
}
