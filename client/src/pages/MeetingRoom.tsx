import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { JitsiMeeting } from "@/components/JitsiMeeting";
import { EVAPanel } from "@/components/EVAPanel";
import { EVAMeetingAssistant, type EvaMessage } from "@/components/EVAMeetingAssistant";
import { SOPDocument } from "@/components/SOPDocument";
import { SOPFlowchart } from "@/components/SOPFlowchart";
import { LiveTranscriptPanel } from "@/components/LiveTranscriptPanel";
import { AgentSelector } from "@/components/AgentSelector";
import { ScrumBoard } from "@/components/ScrumBoard";
import { ScrumMasterPanel, type TranscriptEvent } from "@/components/ScrumMasterPanel";
import { AgentTeamDashboard } from "@/components/AgentTeamDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { Video, ChevronLeft, FileText, GitGraph, Eye, EyeOff, PhoneOff, ScrollText, Brain, MessageSquare, ToggleLeft, ToggleRight, Play, Pause, Square, Link, Check, Minimize2, Maximize2, Monitor, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type GeneratorState = "idle" | "running" | "paused" | "stopped";
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
  const { user, loading: authLoading } = useAuth();
  
  const [isEVAPanelOpen, setIsEVAPanelOpen] = useState(true);
  const [evaPanelMode, setEvaPanelMode] = useState<"assistant" | "observe" | "cro" | "team">("assistant");
  const [isScreenObserverEnabled, setIsScreenObserverEnabled] = useState(false);
  const [isAppObserving, setIsAppObserving] = useState(false);
  const [isCROEnabled, setIsCROEnabled] = useState(false);
  const [isScrumMasterEnabled, setIsScrumMasterEnabled] = useState(false);
  const [isScrumPanelMinimized, setIsScrumPanelMinimized] = useState(false);
  const [scrumPanelView, setScrumPanelView] = useState<"live" | "board">("live");
  const [latestScrumTranscript, setLatestScrumTranscript] = useState<TranscriptEvent | null>(null);
  const [croContent, setCroContent] = useState(`# CRO Agent - Business Discovery

*Waiting to analyze interview/transcript...*

The CRO Agent will generate 3 artifacts:

**1. Core Role Objective Document**
- Role title, purpose, and problems solved
- Responsibilities and tools used
- Success definition

**2. Delegation Candidate List**  
- Tasks the owner should delegate
- Grouped by: Administrative, Operations, Communications

**3. Process Identification List**
- Process names only (no steps - that's the SOP Agent's job)

Start discussing role responsibilities, daily tasks, and pain points to generate the analysis.
`);
  const [isSOPOpen, setIsSOPOpen] = useState(false);
  const [isFlowchartOpen, setIsFlowchartOpen] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState<"idle" | "connecting" | "transcribing" | "error">("idle");
  const [transcripts, setTranscripts] = useState<Array<{id: string; text: string; speaker: string; timestamp: Date; isFinal: boolean;}>>([]);
  const evaConnectedRef = useRef(false);
  const [jitsiApi, setJitsiApi] = useState<any>(null);
  const [isJitsiTranscribing, setIsJitsiTranscribing] = useState(false);
  const [evaStatus, setEvaStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [evaMessages, setEvaMessages] = useState<EvaMessage[]>([]);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [hasJoinedMeeting, setHasJoinedMeeting] = useState(false);
  const [wantsModerator, setWantsModerator] = useState(false);
  const [moderatorCode, setModeratorCode] = useState("");
  const [showModeratorCodeInput, setShowModeratorCodeInput] = useState(false);
  const modCodeFromUrlRef = useRef<string | null>(null);
  const meetingStartTime = useRef(Date.now());
  
  // Read query parameters from URL
  const followUpMeetingIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modParam = urlParams.get('mod');
    const followUpParam = urlParams.get('followUp');
    if (modParam) {
      modCodeFromUrlRef.current = modParam;
      setModeratorCode(modParam);
      setWantsModerator(true);
    }
    if (followUpParam) {
      followUpMeetingIdRef.current = followUpParam;
    }
    // Clean URL without reloading the page
    if (modParam || followUpParam) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  const [sopContent, setSopContent] = useState(`# Live SOP Document

*Waiting for screen observations...*

Start sharing your screen and EVA will automatically generate an SOP based on what it observes.
`);
  const [isSopUpdating, setIsSopUpdating] = useState(false);
  const [isCroUpdating, setIsCroUpdating] = useState(false);
  const [sopObservationCount, setSopObservationCount] = useState(0);
  const [sopVersion, setSopVersion] = useState(0);
  const [liveFlowchartCode, setLiveFlowchartCode] = useState<string | undefined>(undefined);
  
  // Per-agent generation states (idle, running, paused, stopped)
  const [sopGeneratorState, setSopGeneratorState] = useState<GeneratorState>("idle");
  const [croGeneratorState, setCroGeneratorState] = useState<GeneratorState>("idle");
  
  // Refs to avoid stale closures in callbacks
  const sopGeneratorStateRef = useRef<GeneratorState>("idle");
  const croGeneratorStateRef = useRef<GeneratorState>("idle");

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

  // Wait for auth to resolve before fetching meeting to ensure proper ownership claim
  const authReady = !authLoading;
  
  const { data: meeting, refetch: refetchMeeting } = useQuery({
    queryKey: ["meeting", roomId, user?.uid, authReady],
    queryFn: async () => {
      console.log(`[Meeting Query] Fetching meeting for room: ${roomId}, userId: ${user?.uid || 'anonymous'}, authReady: ${authReady}`);
      const result = await api.getMeetingByRoomId(roomId, user?.uid, followUpMeetingIdRef.current);
      console.log(`[Meeting Query] Got meeting:`, result?.id, 'createdBy:', result?.createdBy);
      return result;
    },
    // Only run when auth has finished loading
    enabled: authReady,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 2,
  });
  
  // Refetch meeting when user becomes authenticated after initial load to claim ownership
  const prevUserIdRef = useRef<string | undefined>(undefined);
  const prevAuthReadyRef = useRef<boolean>(false);
  useEffect(() => {
    // If auth just became ready and we have a user, refetch to claim ownership
    if (authReady && !prevAuthReadyRef.current && user?.uid) {
      console.log('[Meeting Query] Auth ready with user, ensuring meeting ownership claim');
      refetchMeeting();
    }
    // If user just became authenticated (was anonymous, now logged in), refetch to claim ownership
    if (authReady && user?.uid && prevUserIdRef.current === undefined && meeting?.id && !meeting.createdBy) {
      console.log('[Meeting Query] User authenticated, refetching to claim ownership');
      refetchMeeting();
    }
    prevUserIdRef.current = user?.uid;
    prevAuthReadyRef.current = authReady;
  }, [user?.uid, meeting?.id, meeting?.createdBy, authReady, refetchMeeting]);

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
  });

  // Initialize selectedAgents and generator states from meeting data when it loads
  // This handles: 1) API-created meetings with pre-selected agents, 2) Regular meetings without pre-selection
  const [hasInitializedAgents, setHasInitializedAgents] = useState(false);
  useEffect(() => {
    if (meeting?.id && agents.length > 0 && !hasInitializedAgents) {
      const sessionKey = `agent-toggles-${meeting.id}`;
      const savedToggles = sessionStorage.getItem(sessionKey);
      
      if (meeting.selectedAgents && meeting.selectedAgents.length > 0) {
        // API-created meeting with pre-selected agents
        setSelectedAgents(meeting.selectedAgents);
        
        // Enable generators based on pre-selected agent types
        const selectedAgentTypes = agents
          .filter(a => meeting.selectedAgents?.includes(a.id))
          .map(a => a.type?.toLowerCase());
        
        // Check for SOP-type agents (sop, eva)
        if (selectedAgentTypes.some(t => t === "sop" || t === "eva")) {
          setIsScreenObserverEnabled(true);
        }
        // Check for CRO-type agents (cro builder, cro)
        if (selectedAgentTypes.some(t => t?.includes("cro"))) {
          setIsCROEnabled(true);
        }
        // Check for Scrum Master agent
        if (selectedAgentTypes.some(t => t === "scrum")) {
          setIsScrumMasterEnabled(true);
        }
      } else if (savedToggles) {
        // Returning to a meeting - restore from sessionStorage
        try {
          const parsed = JSON.parse(savedToggles);
          const restoredScreenObserver = typeof parsed.screenObserver === 'boolean' ? parsed.screenObserver : false;
          const restoredCro = typeof parsed.cro === 'boolean' ? parsed.cro : false;
          const restoredScrum = typeof parsed.scrumMaster === 'boolean' ? parsed.scrumMaster : false;
          
          setIsScreenObserverEnabled(restoredScreenObserver);
          setIsCROEnabled(restoredCro);
          setIsScrumMasterEnabled(restoredScrum);
          
          // Build selectedAgents based on restored toggle states
          const evaAgent = agents.find(a => a.type === "eva");
          const effectiveAgents: string[] = evaAgent ? [evaAgent.id] : [];
          if (restoredScreenObserver) {
            const sopAgent = agents.find(a => a.type === "sop");
            if (sopAgent) effectiveAgents.push(sopAgent.id);
          }
          if (restoredCro) {
            const croAgent = agents.find(a => a.type?.toLowerCase().includes("cro"));
            if (croAgent) effectiveAgents.push(croAgent.id);
          }
          if (restoredScrum) {
            const scrumAgent = agents.find(a => a.type === "scrum");
            if (scrumAgent) effectiveAgents.push(scrumAgent.id);
          }
          setSelectedAgents(effectiveAgents);
          // Persist restored selection to server
          if (meeting?.id) {
            api.updateMeetingAgents(meeting.id, effectiveAgents).catch(() => {});
          }
        } catch (e) {
          // Fallback: just EVA assistant
          const evaAgent = agents.find(a => a.type === "eva");
          const fallbackAgents = evaAgent ? [evaAgent.id] : [];
          setSelectedAgents(fallbackAgents);
          if (meeting?.id) {
            api.updateMeetingAgents(meeting.id, fallbackAgents).catch(() => {});
          }
        }
      } else {
        // New meeting without pre-selected agents - only EVA assistant is always on
        const evaAgent = agents.find(a => a.type === "eva");
        const initialAgents = evaAgent ? [evaAgent.id] : [];
        setSelectedAgents(initialAgents);
        setIsScreenObserverEnabled(false);
        setIsCROEnabled(false);
        // Save initial agent selection to server
        if (meeting?.id) {
          api.updateMeetingAgents(meeting.id, initialAgents).catch(() => {});
        }
      }
      
      setHasInitializedAgents(true);
    }
  }, [meeting?.id, meeting?.selectedAgents, agents, hasInitializedAgents]);

  const isAgentTypeSelected = useCallback((agentType: string): boolean => {
    // Support backward compatibility: treat legacy "sop" type as "eva"
    const typesToCheck = agentType === "eva" ? ["eva", "sop"] : [agentType];
    return agents.some(agent => 
      typesToCheck.includes(agent.type) && selectedAgents.includes(agent.id)
    );
  }, [agents, selectedAgents]);

  const { data: jaasToken } = useQuery({
    queryKey: ["jaas-token", roomId, user?.uid, meeting?.id, wantsModerator, moderatorCode],
    queryFn: async () => {
      console.log(`[JaaS Token Query] Requesting token with wantsModerator: ${wantsModerator}, hasModeratorCode: ${!!moderatorCode}`);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      
      // If user is authenticated, get their ID token for server-side verification
      if (user) {
        try {
          const idToken = await user.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch (e) {
          console.error("Failed to get ID token:", e);
        }
      }
      
      const response = await fetch("/api/jaas/token", {
        method: "POST",
        headers,
        body: JSON.stringify({
          roomName: `VideoAI-${roomId}`,
          userName: user?.displayName || "User",
          wantsModerator: wantsModerator,
          moderatorCode: moderatorCode || undefined,
        }),
      });
      if (!response.ok) {
        return null;
      }
      const result = await response.json();
      console.log(`[JaaS Token Query] Got token, moderator status in token context:`, result?.token?.substring(0, 50) + '...');
      return result;
    },
    // Wait for meeting to be created/claimed before requesting token
    // This ensures createdBy is set before we check moderator status
    enabled: !!meeting?.id,
    retry: false,
  });

  // Check if current user is the meeting moderator based on server-verified status
  // The backend verifies: logged-in users must be the creator, non-logged-in users need correct moderator code
  const isModerator = jaasToken?.isModerator === true;
  
  // Check if logged-in user is the meeting creator (they don't need a code)
  const isCreator = user && meeting?.createdBy === user.uid;
  
  // Track if moderator code was rejected (user entered code but server didn't grant moderator)
  // This applies to any user who is not the creator and entered a code
  const moderatorCodeRejected = wantsModerator && !isCreator && moderatorCode.length > 0 && jaasToken && !jaasToken.isModerator;

  useEffect(() => {
    if (meeting?.id) {
      meetingIdRef.current = meeting.id;
    }
  }, [meeting?.id]);

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
        cro: isCROEnabled,
        scrumMaster: isScrumMasterEnabled
      }));
    }
  }, [meeting?.id, isScreenObserverEnabled, isCROEnabled, isScrumMasterEnabled]);

  const syncAgentsWithToggles = useCallback((overrides?: { screenObserver?: boolean; cro?: boolean; scrum?: boolean }) => {
    if (!meeting?.id || agents.length === 0) return;
    const sopEnabled = overrides?.screenObserver ?? isScreenObserverEnabled;
    const croEnabled = overrides?.cro ?? isCROEnabled;
    const scrumEnabled = overrides?.scrum ?? isScrumMasterEnabled;

    const evaAgent = agents.find(a => a.type === "eva");
    const effectiveAgents: string[] = evaAgent ? [evaAgent.id] : [];

    if (sopEnabled) {
      const sopAgent = agents.find(a => a.type === "sop");
      if (sopAgent) effectiveAgents.push(sopAgent.id);
    }
    if (croEnabled) {
      const croAgent = agents.find(a => a.type?.toLowerCase().includes("cro"));
      if (croAgent) effectiveAgents.push(croAgent.id);
    }
    if (scrumEnabled) {
      const scrumAgent = agents.find(a => a.type === "scrum");
      if (scrumAgent) effectiveAgents.push(scrumAgent.id);
    }

    setSelectedAgents(effectiveAgents);
    api.updateMeetingAgents(meeting.id, effectiveAgents).then(() => {
      queryClient.invalidateQueries({ queryKey: ["meeting", roomId] });
    }).catch(() => {});
  }, [meeting?.id, agents, isScreenObserverEnabled, isCROEnabled, isScrumMasterEnabled, queryClient, roomId]);

  const handleScrumMasterToggle = useCallback((enabled: boolean) => {
    setIsScrumMasterEnabled(enabled);
    syncAgentsWithToggles({ scrum: enabled });
  }, [syncAgentsWithToggles]);

  const handleScreenObserverToggle = useCallback((enabled: boolean) => {
    setIsScreenObserverEnabled(enabled);
    syncAgentsWithToggles({ screenObserver: enabled });
  }, [syncAgentsWithToggles]);

  const handleCROToggle = useCallback((enabled: boolean) => {
    setIsCROEnabled(enabled);
    syncAgentsWithToggles({ cro: enabled });
  }, [syncAgentsWithToggles]);

  
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
      stopAppCapture();
      setIsAppObserving(false);
      
      const duration = formatDuration(meetingDuration);
      const result = await api.endMeeting(meeting.id, sopContent, duration, croContent);
      
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

  const handleCroUpdate = useCallback((content: string, version?: number) => {
    setCroContent(content);
    setIsCroUpdating(false);
    console.log(`[CRO] Updated to v${version || 1}`);
  }, []);

  const handleEvaCommand = useCallback((action: string) => {
    console.log(`[EVA Command] Received: ${action}`);
    if (action === "start_app_observe") {
      setIsAppObserving(true);
    } else if (action === "stop_app_observe") {
      setIsAppObserving(false);
    }
  }, []);

  const {
    isConnected: evaConnected,
    isObserving,
    startObserving,
    stopObserving,
    startScreenCapture,
    stopScreenCapture,
    startAppCapture,
    stopAppCapture,
    sendTextMessage,
    sendTranscript,
    wsRef,
  } = useEvaLive({
    meetingId: meeting?.id || "",
    onMessage: handleEvaMessage,
    onSopUpdate: handleSopUpdate,
    onSopStatus: handleSopStatus,
    onCroUpdate: handleCroUpdate,
    onStatusChange: setEvaStatus,
    onCommand: handleEvaCommand,
  });

  // Keep ref in sync with evaConnected for use in callbacks that may have stale closures
  useEffect(() => {
    evaConnectedRef.current = evaConnected;
    console.log(`[EVA Ref] evaConnectedRef updated to: ${evaConnected}`);
  }, [evaConnected]);
  
  // Keep generator state refs in sync
  useEffect(() => {
    sopGeneratorStateRef.current = sopGeneratorState;
    console.log(`[SOP Generator] State changed to: ${sopGeneratorState}`);
  }, [sopGeneratorState]);
  
  useEffect(() => {
    croGeneratorStateRef.current = croGeneratorState;
    console.log(`[CRO Generator] State changed to: ${croGeneratorState}`);
  }, [croGeneratorState]);

  useEffect(() => {
    if (!isScreenObserverEnabled && isObserving) {
      stopObserving();
      stopScreenCapture();
    }
  }, [isScreenObserverEnabled, isObserving, stopObserving, stopScreenCapture]);

  const prevAppObservingRef = useRef(isAppObserving);
  useEffect(() => {
    if (isAppObserving && !prevAppObservingRef.current) {
      startObserving();
      startAppCapture();
    } else if (!isAppObserving && prevAppObservingRef.current) {
      stopObserving();
      stopAppCapture();
    }
    prevAppObservingRef.current = isAppObserving;
  }, [isAppObserving, startObserving, stopObserving, startAppCapture, stopAppCapture]);


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
        stopAppCapture();
        setIsAppObserving(false);
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
    
    if (isScrumMasterEnabled) {
      setLatestScrumTranscript({
        text: text.trim(),
        speaker: participant || "Unknown",
        timestamp: Date.now(),
        isFinal,
      });
    }

    if (isFinal && text.trim().length > 2) {
      try {
        await api.createTranscriptSegment(meeting.id, {
          text: text.trim(),
          speaker: participant || "Unknown",
          isFinal: true,
        });
        
        // Send transcript to EVA for processing (SOP/CRO generation)
        // Use refs to get latest status (callbacks may have stale closures)
        const isConnected = evaConnectedRef.current;
        const currentSopState = sopGeneratorStateRef.current;
        const currentCroState = croGeneratorStateRef.current;
        
        // Check if either generator is in "running" state (active generation)
        const isSopGeneratorRunning = currentSopState === "running";
        const isCroGeneratorRunning = currentCroState === "running";
        const shouldSendToSop = isScreenObserverEnabled && isSopGeneratorRunning;
        const shouldSendToCro = isCROEnabled && isCroGeneratorRunning;
        
        console.log(`[Transcript] evaConnected=${isConnected}, sopState=${currentSopState}, croState=${currentCroState}`);
        console.log(`[Transcript] shouldSendToSop=${shouldSendToSop}, shouldSendToCro=${shouldSendToCro}`);
        
        if (isConnected && (shouldSendToSop || shouldSendToCro)) {
          if (shouldSendToSop) setIsSopUpdating(true);
          if (shouldSendToCro) setIsCroUpdating(true);
          sendTranscript(text.trim(), participant || "Unknown", shouldSendToSop, shouldSendToCro);
          console.log(`[Transcript] Sent to EVA with SOP=${shouldSendToSop}, CRO=${shouldSendToCro}`);
        } else {
          console.log(`[Transcript] NOT sent - EVA not connected or generators not running`);
        }
      } catch (error) {
        console.error("Failed to save transcript segment:", error);
      }
    }
  }, [meeting?.id, sendTranscript, isScreenObserverEnabled, isCROEnabled]);

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
      stopAppCapture();
      setIsAppObserving(false);
      setSopGeneratorState("stopped");
      addSystemMessage("Screen Observer stopped.");
    } else {
      if (!isScreenObserverEnabled) {
        console.log("Screen Observer is disabled, cannot start observation");
        return;
      }
      startObserving();
      setSopGeneratorState("running");
      
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
        setSopGeneratorState("stopped");
      }
    }
  };

  const toggleAppObservation = () => {
    if (isAppObserving) {
      setIsAppObserving(false);
      addSystemMessage("App observation stopped.");
    } else {
      if (!evaConnected) return;
      setIsAppObserving(true);
      addSystemMessage("EVA is now observing the app view directly - no screen sharing needed.");
    }
  };

  const handleStartObservation = async () => {
    if (!isScreenObserverEnabled) {
      console.log("Screen Observer is disabled, cannot start observation");
      return;
    }
    if (!isObserving) {
      startObserving();
      setSopGeneratorState("running");
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
        setSopGeneratorState("stopped");
      }
    }
  };
  
  const handleStopObservation = () => {
    stopObserving();
    stopScreenCapture();
    stopAppCapture();
    setIsAppObserving(false);
    setSopGeneratorState("stopped");
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
             <Button
               size="sm"
               variant="outline"
               onClick={() => {
                 const meetingUrl = `${window.location.origin}/meeting/${roomId}`;
                 navigator.clipboard.writeText(meetingUrl);
                 setLinkCopied(true);
                 setTimeout(() => setLinkCopied(false), 2000);
               }}
               className="gap-1.5"
               data-testid="button-copy-meeting-link"
             >
               {linkCopied ? (
                 <>
                   <Check className="w-4 h-4 text-green-500" />
                   <span className="hidden sm:inline">Copied!</span>
                 </>
               ) : (
                 <>
                   <Link className="w-4 h-4" />
                   <span className="hidden sm:inline">Copy Link</span>
                 </>
               )}
             </Button>
             {meeting?.id && isModerator && (
               <AgentSelector
                 meetingId={meeting.id}
                 roomId={roomId}
                 selectedAgents={selectedAgents}
                 onAgentsChange={setSelectedAgents}
                 isScreenObserverEnabled={isScreenObserverEnabled}
                 onScreenObserverChange={handleScreenObserverToggle}
                 isCROEnabled={isCROEnabled}
                 onCROChange={handleCROToggle}
                 isScrumMasterEnabled={isScrumMasterEnabled}
                 onScrumMasterChange={handleScrumMasterToggle}
               />
             )}
             {hasJoinedMeeting && evaConnected && isModerator && (
               <div className="flex gap-1">
                 <Button
                   size="sm"
                   variant={isObserving && !isAppObserving ? "destructive" : "default"}
                   onClick={isObserving && !isAppObserving ? handleStopObservation : handleStartObservation}
                   className="gap-1.5"
                   data-testid="button-observation-toggle"
                 >
                   {isObserving && !isAppObserving ? (
                     <>
                       <EyeOff className="w-4 h-4" />
                       <span className="hidden sm:inline">Stop Screen</span>
                     </>
                   ) : (
                     <>
                       <Eye className="w-4 h-4" />
                       <span className="hidden sm:inline">Share Screen</span>
                     </>
                   )}
                 </Button>
                 <Button
                   size="sm"
                   variant={isAppObserving ? "destructive" : "outline"}
                   onClick={toggleAppObservation}
                   className="gap-1.5"
                   data-testid="button-app-observe-toggle"
                 >
                   {isAppObserving ? (
                     <>
                       <EyeOff className="w-4 h-4" />
                       <span className="hidden sm:inline">Stop App View</span>
                     </>
                   ) : (
                     <>
                       <Monitor className="w-4 h-4" />
                       <span className="hidden sm:inline">Observe App</span>
                     </>
                   )}
                 </Button>
               </div>
             )}
             {hasJoinedMeeting && isModerator && (
               <div className={`bg-card/50 border px-3 py-1.5 rounded-full flex items-center gap-2 ${
                 evaConnected ? 'border-green-500/50' : 'border-border'
               }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    evaStatus === "connected" ? "bg-green-500 animate-pulse" :
                    evaStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
                    "bg-gray-500"
                  }`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    EVA {evaStatus === "connected" ? (isObserving ? "Observing" : "Ready") : evaStatus}
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
          <div className={`flex-1 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 relative`}>
             {/* Only render Jitsi once we have a valid token - this ensures moderator JWT is ready */}
             {jaasToken?.token ? (
               <JitsiMeeting 
                 key={`jitsi-${roomId}-${jaasToken.isModerator ? 'mod' : 'user'}-${jaasToken.token.slice(-8)}`}
                 roomName={`VideoAI-${roomId}`}
                 displayName="User"
                 onApiReady={handleJitsiApiReady}
                 onTranscriptionReceived={handleTranscriptionReceived}
                 className="bg-zinc-900"
                 jwt={jaasToken.token}
                 appId={jaasToken.appId}
                 roomId={roomId}
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                 <div className="text-center">
                   <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
                   <p className="text-muted-foreground">Preparing meeting room...</p>
                 </div>
               </div>
             )}
             
             {/* Moderator toggle overlay - shows before joining for all users */}
             {!hasJoinedMeeting && (
               <div className="absolute bottom-4 left-4 z-20">
                 <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[240px]">
                   <div className="flex items-center gap-3">
                     <Switch
                       id="moderator-toggle"
                       checked={wantsModerator}
                       onCheckedChange={(checked) => {
                         setWantsModerator(checked);
                         // Show code input when non-logged-in user toggles moderator on
                         if (checked && !user) {
                           setShowModeratorCodeInput(true);
                         } else if (!checked) {
                           setShowModeratorCodeInput(false);
                           setModeratorCode("");
                         }
                       }}
                       data-testid="switch-moderator"
                     />
                     <label 
                       htmlFor="moderator-toggle" 
                       className="text-sm font-medium cursor-pointer select-none"
                     >
                       Join as Moderator
                     </label>
                   </div>
                   <p className="text-xs text-muted-foreground mt-1">
                     Moderators can control meeting settings and AI features
                   </p>
                   
                   {/* Moderator code input - shows for anyone who is not the meeting creator when toggle is on */}
                   {wantsModerator && !isCreator && (
                     <div className="mt-3 pt-3 border-t border-border">
                       <label 
                         htmlFor="moderator-code" 
                         className="text-xs text-muted-foreground block mb-1.5"
                       >
                         Enter moderator code:
                       </label>
                       <input
                         type="password"
                         id="moderator-code"
                         value={moderatorCode}
                         onChange={(e) => setModeratorCode(e.target.value)}
                         placeholder="Enter code"
                         className={`w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 ${
                           moderatorCodeRejected 
                             ? 'border-red-500 focus:ring-red-500' 
                             : 'border-border focus:ring-purple-500'
                         }`}
                         data-testid="input-moderator-code"
                       />
                       {moderatorCodeRejected ? (
                         <p className="text-xs text-red-500 mt-1.5">
                           Invalid moderator code. Please check and try again.
                         </p>
                       ) : (
                         <p className="text-xs text-muted-foreground mt-1.5">
                           Get this code from the meeting organizer
                         </p>
                       )}
                     </div>
                   )}
                 </div>
               </div>
             )}
          </div>

          {/* Live SOP Panel - visible to all participants */}
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
                {/* Mode tabs - Moderators see full controls, participants see read-only SOP */}
                {isModerator ? (
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
                        <FileText className="w-3 h-3 inline mr-1" />
                        SOP
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
                    <button
                      onClick={() => setEvaPanelMode("team")}
                      className={`flex-1 py-2.5 px-3 text-xs font-medium transition-colors ${
                        evaPanelMode === "team" 
                          ? "bg-background text-foreground border-b-2 border-purple-500" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="button-eva-mode-team"
                    >
                      <Users className="w-3 h-3 inline mr-1" />
                      Agent Team
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center bg-background/50 py-2.5 px-3">
                    <FileText className="w-3 h-3 inline mr-1 text-blue-500" />
                    <span className="text-xs font-medium text-blue-500">Live SOP Document</span>
                    {isSopUpdating && (
                      <span className="ml-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>
                )}
              </div>
              
              {/* Moderator view - full controls */}
              {isModerator && evaPanelMode === "assistant" && (
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
                  onStartAppObserve={() => {
                    if (!isAppObserving) {
                      if (evaConnected) {
                        setIsAppObserving(true);
                        addSystemMessage("EVA is now observing the app view.");
                      } else {
                        addSystemMessage("EVA is not connected yet. Please wait for the connection.");
                      }
                    }
                  }}
                  currentSopContent={sopContent}
                  messages={evaMessages}
                  setMessages={setEvaMessages}
                  sendTranscript={sendTranscript}
                  isCroEnabled={isCROEnabled}
                  isSopEnabled={isScreenObserverEnabled}
                />
              )}
              
              {isModerator && evaPanelMode === "observe" && isScreenObserverEnabled && (
                <EVAPanel 
                  meetingId={meeting.id}
                  messages={displayMessages}
                  chatMessages={chatMessages}
                  onSendMessage={handleSendMessage}
                  isScreenSharing={isScreenSharing}
                  isObserving={isObserving}
                  evaStatus={evaStatus}
                  onStartObservation={handleStartObservation}
                  onStopObservation={handleStopObservation}
                  sopContent={sopContent}
                  onSopContentChange={setSopContent}
                  isSopUpdating={isSopUpdating}
                  className="h-[calc(100%-120px)]"
                  generatorState={sopGeneratorState}
                  onGeneratorStateChange={setSopGeneratorState}
                />
              )}
              
              {/* Participant view - read-only SOP */}
              {!isModerator && (
                <div className="h-[calc(100%-120px)] flex flex-col p-4 overflow-y-auto">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-blue-500">
                        {isSopUpdating ? "SOP is being updated..." : "Viewing live SOP from moderator"}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 bg-muted/30 rounded-lg p-4 overflow-y-auto">
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {sopContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
              
              {evaPanelMode === "team" && (
                <AgentTeamDashboard
                  meetingId={meeting.id}
                  ws={wsRef.current}
                  isConnected={evaConnected}
                  className="h-[calc(100%-120px)]"
                />
              )}
              
              {evaPanelMode === "cro" && isCROEnabled && (
                <div className="h-[calc(100%-120px)] flex flex-col p-4 overflow-y-auto">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-green-500" />
                        <span className="font-medium text-sm text-green-500">CRO Generator</span>
                        <span className={`w-2 h-2 rounded-full ${
                          isCroUpdating ? "bg-blue-500 animate-pulse" :
                          croGeneratorState === "running" ? "bg-green-500 animate-pulse" :
                          croGeneratorState === "paused" ? "bg-yellow-500" :
                          croGeneratorState === "stopped" ? "bg-red-500" :
                          "bg-muted-foreground"
                        }`} />
                        <span className="text-xs text-muted-foreground">
                          {isCroUpdating ? "Processing..." :
                           croGeneratorState === "running" ? "Recording" :
                           croGeneratorState === "paused" ? "Paused" :
                           croGeneratorState === "stopped" ? "Stopped" : "Ready"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {(croGeneratorState === "idle" || croGeneratorState === "stopped") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                            onClick={() => setCroGeneratorState("running")}
                            data-testid="button-start-cro-generator"
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Start
                          </Button>
                        )}
                        {croGeneratorState === "running" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                              onClick={() => setCroGeneratorState("paused")}
                              data-testid="button-pause-cro-generator"
                            >
                              <Pause className="w-3 h-3 mr-1" />
                              Pause
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => setCroGeneratorState("stopped")}
                              data-testid="button-stop-cro-generator"
                            >
                              <Square className="w-3 h-3 mr-1" />
                              Stop
                            </Button>
                          </>
                        )}
                        {croGeneratorState === "paused" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                              onClick={() => setCroGeneratorState("running")}
                              data-testid="button-resume-cro-generator"
                            >
                              <Play className="w-3 h-3 mr-1" />
                              Resume
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => setCroGeneratorState("stopped")}
                              data-testid="button-stop-cro-generator-paused"
                            >
                              <Square className="w-3 h-3 mr-1" />
                              Stop
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Discuss role responsibilities, daily tasks, and pain points. The CRO Agent identifies bottlenecks and defines roles to delegate work.
                    </p>
                  </div>
                  <div className="flex-1 bg-muted/30 rounded-lg p-4 overflow-y-auto">
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {croContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {isScrumMasterEnabled && meeting?.id && hasJoinedMeeting && (
            <div 
              className={`
                transition-all duration-300 ease-in-out transform origin-right
                ${isScrumPanelMinimized ? 'w-[48px]' : 'w-[360px]'}
                rounded-2xl overflow-hidden shadow-xl border border-indigo-500/20 bg-card
              `}
            >
              {isScrumPanelMinimized ? (
                <div className="h-full flex flex-col items-center py-3 gap-2">
                  <button
                    onClick={() => setIsScrumPanelMinimized(false)}
                    className="p-2 rounded-lg hover:bg-indigo-500/10 text-indigo-400 transition-colors"
                    data-testid="button-expand-scrum-panel"
                    title="Expand Scrum Board"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-medium text-indigo-400 [writing-mode:vertical-lr] tracking-wider">
                    SCRUM BOARD
                  </span>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-500/20">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setScrumPanelView("live")}
                        className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                          scrumPanelView === "live"
                            ? "bg-indigo-500/20 text-indigo-400"
                            : "text-muted-foreground hover:text-indigo-400"
                        }`}
                        data-testid="btn-scrum-view-live"
                      >
                        Live Agent
                      </button>
                      <button
                        onClick={() => setScrumPanelView("board")}
                        className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                          scrumPanelView === "board"
                            ? "bg-indigo-500/20 text-indigo-400"
                            : "text-muted-foreground hover:text-indigo-400"
                        }`}
                        data-testid="btn-scrum-view-board"
                      >
                        Board
                      </button>
                    </div>
                    <button
                      onClick={() => setIsScrumPanelMinimized(true)}
                      className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-muted-foreground hover:text-indigo-400 transition-colors"
                      data-testid="button-minimize-scrum-panel"
                      title="Minimize Scrum Panel"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className={scrumPanelView === "live" ? "flex-1 overflow-auto flex flex-col" : "hidden"}>
                    <ScrumMasterPanel
                      meetingId={meeting.id}
                      className="flex-1 overflow-auto border-0 rounded-none shadow-none"
                      latestTranscript={latestScrumTranscript}
                    />
                  </div>
                  <div className={scrumPanelView === "board" ? "flex-1 overflow-auto flex flex-col" : "hidden"}>
                    <ScrumBoard
                      meetingId={meeting.id}
                      className="flex-1 overflow-auto"
                    />
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
                  <TooltipContent>{isModerator ? "Toggle EVA Assistant" : "Toggle Live SOP"}</TooltipContent>
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
