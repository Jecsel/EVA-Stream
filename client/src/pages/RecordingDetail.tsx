import { useEffect, useRef, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ArrowLeft, Clock, Calendar, FileText, GitBranch, Play, Pause, Sparkles, Download, Edit2, Save, X, Trash2, CheckCircle, AlertCircle, Target, MessageSquare, User, Bot, Video, Volume2, VolumeX, Maximize, ClipboardList, Share2, Check, Plus, Eye, ScrollText, Zap, CalendarPlus, RefreshCw, HardDrive, CloudOff, Loader2, Upload, WifiOff, ServerCrash, TriangleAlert, ChevronRight } from "lucide-react";
import { ScheduleMeetingDialog } from "@/components/ScheduleMeetingDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { ScrumSummaryPanel } from "@/components/ScrumSummaryPanel";
import { ScrumMeetingRecordTab } from "@/components/ScrumMeetingRecordTab";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#1967D2",
    primaryTextColor: "#fff",
    primaryBorderColor: "#3b82f6",
    lineColor: "#6b7280",
    secondaryColor: "#374151",
    tertiaryColor: "#1f2937",
  },
});

const decodeHtmlEntities = (text: string): string => {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };
  return text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (match) => entities[match] || match);
};

function parseSummaryHighlights(summary: string) {
  const keyDecisions: string[] = [];
  const actionItems: string[] = [];
  const topics: string[] = [];
  
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim());
  
  sentences.forEach(sentence => {
    const lower = sentence.toLowerCase();
    if (lower.includes('decided') || lower.includes('decision') || lower.includes('agreed') || lower.includes('concluded')) {
      keyDecisions.push(sentence.trim());
    } else if (lower.includes('action') || lower.includes('will') || lower.includes('need to') || lower.includes('should') || lower.includes('must') || lower.includes('todo')) {
      actionItems.push(sentence.trim());
    } else if (sentence.trim().length > 10) {
      topics.push(sentence.trim());
    }
  });
  
  return { keyDecisions, actionItems, topics, hasStructure: keyDecisions.length > 0 || actionItems.length > 0 };
}

type FlowchartProgressStep = 'idle' | 'preparing' | 'generating' | 'rendering' | 'complete';

const FLOWCHART_PROGRESS: Record<FlowchartProgressStep, { percent: number; label: string }> = {
  idle: { percent: 0, label: '' },
  preparing: { percent: 15, label: 'Preparing SOP content...' },
  generating: { percent: 50, label: 'Generating flowchart structure...' },
  rendering: { percent: 85, label: 'Rendering diagram...' },
  complete: { percent: 100, label: 'Complete!' },
};

export default function RecordingDetail() {
  const [, params] = useRoute("/recording/:id");
  const [, setLocation] = useLocation();
  const recordingId = params?.id || "";
  const flowchartRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [renderedSopContent, setRenderedSopContent] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSopContent, setEditedSopContent] = useState("");
  const [activeTab, setActiveTab] = useState("sop");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [flowchartProgress, setFlowchartProgress] = useState<FlowchartProgressStep>('idle');
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showNewMeetingPopover, setShowNewMeetingPopover] = useState(false);
  const [showReanalyzeModal, setShowReanalyzeModal] = useState(false);
  const [selectedTranscriptionId, setSelectedTranscriptionId] = useState<string | null>(null);
  const [showReanalyzeResults, setShowReanalyzeResults] = useState(false);
  const [reanalyzeResultsData, setReanalyzeResultsData] = useState<{
    outputs: Record<string, string>;
    startedAt?: string;
    completedAt?: string;
  } | null>(null);
  const [reanalyzeOutputs, setReanalyzeOutputs] = useState<Record<string, boolean>>({
    document: true,
    sop: true,
    cro: true,
    flowchart: true,
    transcript: true,
    meeting_notes: true,
    meeting_record: true,
  });
  const queryClient = useQueryClient();

  const { data: recording, isLoading, error } = useQuery({
    queryKey: ["recording", recordingId],
    queryFn: () => api.getRecording(recordingId),
    enabled: !!recordingId,
  });

  const meetingId = recording?.meetingId;

  const { data: chatMessages = [] } = useQuery({
    queryKey: ["chatMessages", meetingId],
    queryFn: () => api.getChatMessages(meetingId!),
    enabled: !!meetingId,
  });

  const { data: jaasTranscriptions = [] } = useQuery({
    queryKey: ["jaasTranscriptions", meetingId],
    queryFn: () => api.getMeetingTranscriptions(meetingId!),
    enabled: !!meetingId,
  });

  const { data: localTranscripts = [] } = useQuery({
    queryKey: ["localTranscripts", meetingId],
    queryFn: () => api.getTranscripts(meetingId!),
    enabled: !!meetingId,
  });

  const { data: meeting } = useQuery({
    queryKey: ["meeting", meetingId],
    queryFn: () => api.getMeeting(meetingId!),
    enabled: !!meetingId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
  });

  const hasScrumMaster = !!(meeting?.selectedAgents && agents.length > 0 &&
    meeting.selectedAgents.some((agentId: string) => {
      const agent = agents.find((a: any) => a.id?.toString() === agentId);
      return agent?.type === "scrum";
    })
  );

  const cloudTranscriptions = jaasTranscriptions.filter(
    (t) => t.fqn !== `recording-${recordingId}`
  );
  const selectedTranscription = selectedTranscriptionId
    ? cloudTranscriptions.find((t) => t.id === selectedTranscriptionId)
    : cloudTranscriptions[0] || null;
  const activeSopContent = selectedTranscription?.sopContent || recording?.sopContent;
  const activeCroContent = selectedTranscription?.croContent || recording?.croContent;
  const activeFlowchartCode = selectedTranscription?.flowchartCode || recording?.flowchartCode;

  const { data: backupStatus } = useQuery({
    queryKey: ["backupStatus", recordingId],
    queryFn: () => api.getBackupStatus(recordingId),
    enabled: !!recordingId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.storageStatus === "downloading") return 3000;
      return false;
    },
  });

  const backupMutation = useMutation({
    mutationFn: () => api.backupRecordingVideo(recordingId),
    onSuccess: () => {
      toast.success("Video backup started! This may take a few minutes.");
      queryClient.invalidateQueries({ queryKey: ["backupStatus", recordingId] });
    },
    onError: () => {
      toast.error("Failed to start video backup. Please try again.");
    },
  });

  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadRecordingVideo(recordingId, file),
    onMutate: () => {
      setUploadProgress("Uploading...");
    },
    onSuccess: () => {
      setUploadProgress(null);
      toast.success("Video uploaded successfully!");
      queryClient.invalidateQueries({ queryKey: ["backupStatus", recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recording", recordingId] });
    },
    onError: () => {
      setUploadProgress(null);
      toast.error("Failed to upload video. Please try again.");
    },
  });

  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    if (videoFileInputRef.current) {
      videoFileInputRef.current.value = "";
    }
  };

  // Fetch decision-based SOPs linked to this meeting
  const { data: decisionBasedSops = [] } = useQuery({
    queryKey: ["meetingSops", meetingId],
    queryFn: () => api.getSopsByMeeting(meetingId!),
    enabled: !!meetingId,
  });

  // Get the most recent approved SOP, or the most recent one if none approved
  const primarySop = decisionBasedSops.find((s: any) => s.status === "approved") || decisionBasedSops[0];

  const updateMutation = useMutation({
    mutationFn: (sopContent: string) => api.updateRecording(recordingId, { sopContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recording", recordingId] });
      setIsEditing(false);
      toast.success("SOP saved successfully");
    },
    onError: () => {
      toast.error("Failed to save SOP. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteRecording(recordingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      toast.success("Recording deleted");
      setLocation("/");
    },
    onError: () => {
      toast.error("Failed to delete recording. Please try again.");
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: () => api.transcribeRecording(recordingId),
    onSuccess: () => {
      toast.success("Transcription started! It will appear here shortly.");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["jaasTranscriptions", meetingId] });
        queryClient.invalidateQueries({ queryKey: ["localTranscripts", meetingId] });
      }, 5000);
    },
    onError: () => {
      toast.error("Failed to start transcription. Please try again.");
    },
  });

  const generateFlowchartMutation = useMutation({
    mutationFn: async () => {
      if (!activeSopContent) {
        throw new Error("No SOP content available");
      }
      
      setFlowchartProgress('preparing');
      
      setFlowchartProgress('generating');
      let result;
      try {
        result = await api.generateFlowchart(activeSopContent, meetingId);
      } catch (error) {
        throw new Error("AI generation failed");
      }
      
      if (!result?.mermaidCode) {
        throw new Error("No flowchart code returned");
      }
      
      setFlowchartProgress('rendering');
      try {
        await api.updateRecording(recordingId, { flowchartCode: result.mermaidCode });
      } catch (error) {
        throw new Error("Failed to save flowchart");
      }
      
      return result.mermaidCode;
    },
    onSuccess: () => {
      setFlowchartProgress('complete');
      queryClient.invalidateQueries({ queryKey: ["recording", recordingId] });
      setRenderedSopContent(null);
      toast.success("Flowchart generated successfully!");
      setTimeout(() => setFlowchartProgress('idle'), 2000);
    },
    onError: (error: Error) => {
      setFlowchartProgress('idle');
      const message = error.message || "Failed to generate flowchart";
      toast.error(message + ". Please try again.");
      console.error("Flowchart generation error:", error);
    },
  });

  type ReanalysisOutputStatus = "pending" | "in_progress" | "done" | "error";
  type ReanalysisErrorCode = "no_audio" | "network_error" | "processing_error" | "partial_failure";
  type ReanalyzeStatusState = {
    active: boolean;
    status?: string;
    step?: string;
    progress?: number;
    completed?: boolean;
    error?: string;
    errorCode?: ReanalysisErrorCode;
    outputs?: Record<string, ReanalysisOutputStatus>;
    startedAt?: string;
    updatedAt?: string;
  };

  const [reanalyzeStatus, setReanalyzeStatus] = useState<ReanalyzeStatusState>({ active: false });
  const [reanalyzeSuccessFlash, setReanalyzeSuccessFlash] = useState(false);

  const handleReanalysisUpdate = useRef<(data: ReanalyzeStatusState) => void>(() => {});

  handleReanalysisUpdate.current = (data: ReanalyzeStatusState) => {
    setReanalyzeStatus(data);
    if (data.active && data.completed) {
      if (!data.error) {
        toast.success("Re-analysis completed!");
        setReanalyzeSuccessFlash(true);
        setTimeout(() => setReanalyzeSuccessFlash(false), 2500);
        const resultsPayload = {
          outputs: data.outputs ?? {},
          startedAt: data.startedAt,
          completedAt: data.updatedAt,
        };
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ["recording", recordingId] }),
          queryClient.invalidateQueries({ queryKey: ["jaasTranscriptions", meetingId] }),
          queryClient.invalidateQueries({ queryKey: ["localTranscripts", meetingId] }),
          queryClient.invalidateQueries({ queryKey: ["chatMessages", meetingId] }),
        ]).then(() => {
          setReanalyzeResultsData(resultsPayload);
          setShowReanalyzeResults(true);
        });
      } else if (data.errorCode !== "partial_failure") {
        toast.error(data.status || "Re-analysis failed");
      } else {
        toast.warning("Re-analysis partially completed — some outputs failed.");
        const resultsPayload = {
          outputs: data.outputs ?? {},
          startedAt: data.startedAt,
          completedAt: data.updatedAt,
        };
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ["recording", recordingId] }),
        ]).then(() => {
          setReanalyzeResultsData(resultsPayload);
          setShowReanalyzeResults(true);
        });
      }
      setTimeout(() => setReanalyzeStatus({ active: false }), 6000);
    }
  };

  // WebSocket-based status updates — no polling
  useEffect(() => {
    if (!recordingId || !meetingId) return;
    let ws: WebSocket | null = null;
    let cancelled = false;

    fetch(`/api/recordings/${recordingId}/reanalyze-status`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.active && !cancelled) handleReanalysisUpdate.current(data);
      })
      .catch(() => {});

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/eva?meetingId=${meetingId}`);

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "reanalysis_progress" && msg.recordingId === recordingId && !cancelled) {
          handleReanalysisUpdate.current(msg);
        }
        if (msg.type === "session_reanalysis_progress" && !cancelled) {
          handleReanalysisUpdate.current(msg);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener("open", () => {
      ws?.send(JSON.stringify({ type: "reanalysis_subscribe", recordingId }));
    });

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [recordingId, meetingId]);

  const isReanalyzing = reanalyzeStatus.active && !reanalyzeStatus.completed;

  const reanalyzeMutation = useMutation({
    mutationFn: async () => {
      const selectedOutputs = Object.entries(reanalyzeOutputs)
        .filter(([, selected]) => selected)
        .map(([key]) => key);
      if (selectedOutputs.length === 0) {
        throw new Error("Please select at least one output type");
      }
      if (selectedTranscription?.id) {
        return api.reanalyzeTranscriptionSession(selectedTranscription.id, selectedOutputs);
      }
      return api.reanalyzeRecording(recordingId, selectedOutputs);
    },
    onSuccess: () => {
      setShowReanalyzeModal(false);
      const selectedKeys = Object.entries(reanalyzeOutputs)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const initialOutputs: Record<string, ReanalysisOutputStatus> = {};
      for (const k of selectedKeys) initialOutputs[k] = "pending";
      setReanalyzeStatus({
        active: true,
        status: "Starting re-analysis...",
        step: "starting",
        progress: 0,
        completed: false,
        outputs: initialOutputs,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to start re-analysis. Please try again.");
    },
  });

  const togglePlay = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        try {
          await videoRef.current.play();
        } catch (err) {
          toast.error("Unable to play video. Please try again.");
          console.error("Video play error:", err);
        }
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generateFlowchartFromSOP = (sopContent: string): string => {
    const lines = sopContent.split("\n");
    const steps: string[] = [];
    let currentSection = "";
    
    for (const line of lines) {
      if (line.startsWith("## ")) {
        currentSection = line.replace("## ", "").replace(/^\d+\.\s*/, "").trim();
        if (currentSection && steps.length < 8) {
          steps.push(currentSection);
        }
      }
    }
    
    if (steps.length < 2) {
      return `flowchart TD
    A[Start] --> B[Meeting Recorded]
    B --> C[SOP Generated]
    C --> D[End]`;
    }
    
    let mermaidCode = "flowchart TD\n";
    const nodeIds = "ABCDEFGHIJ".split("");
    
    steps.forEach((step, i) => {
      const cleanStep = step.replace(/[[\]{}()]/g, "").substring(0, 30);
      mermaidCode += `    ${nodeIds[i]}[${cleanStep}]\n`;
    });
    
    for (let i = 0; i < steps.length - 1; i++) {
      mermaidCode += `    ${nodeIds[i]} --> ${nodeIds[i + 1]}\n`;
    }
    
    return mermaidCode;
  };

  useEffect(() => {
    setSelectedTranscriptionId(null);
  }, [recordingId]);

  useEffect(() => {
    if (activeSopContent && !isEditing) {
      setEditedSopContent(activeSopContent);
    }
  }, [activeSopContent, isEditing]);

  useEffect(() => {
    if (activeTab !== "flowchart") return;
    
    if (!activeSopContent && !activeFlowchartCode) {
      if (flowchartRef.current) {
        flowchartRef.current.innerHTML = `<p class="text-muted-foreground italic">No SOP content available to generate flowchart.</p>`;
      }
      setRenderedSopContent(null);
      return;
    }
    
    const contentToCheck = activeFlowchartCode || activeSopContent;
    if (contentToCheck !== renderedSopContent) {
      const renderFlowchart = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (!flowchartRef.current) {
          console.error("Flowchart ref not available");
          return;
        }
        
        try {
          let flowchartCode = activeFlowchartCode 
            ? decodeHtmlEntities(activeFlowchartCode) 
            : generateFlowchartFromSOP(activeSopContent || "");
          
          flowchartRef.current.innerHTML = "";
          const uniqueId = `flowchart-${Date.now()}`;
          const { svg } = await mermaid.render(uniqueId, flowchartCode);
          flowchartRef.current.innerHTML = svg;
          setRenderedSopContent(contentToCheck || null);
        } catch (err) {
          console.error("Failed to render flowchart:", err);
          if (flowchartRef.current) {
            flowchartRef.current.innerHTML = `<p class="text-muted-foreground">Could not generate flowchart</p>`;
          }
        }
      };
      renderFlowchart();
    }
  }, [activeSopContent, activeFlowchartCode, renderedSopContent, activeTab]);

  const handleSave = () => {
    updateMutation.mutate(editedSopContent);
  };

  const handleCancelEdit = () => {
    setEditedSopContent(activeSopContent || "");
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Recording not found</p>
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const summaryData = parseSummaryHighlights(recording.summary || "");
  const isFailedAnalysis = recording.summary && (
    recording.summary.startsWith("Re-analysis failed") ||
    recording.summary.startsWith("Transcription failed")
  );

  // Derive a friendly error code from the stored summary message for the UI
  const persistedErrorCode: ReanalysisErrorCode | undefined = (() => {
    if (!isFailedAnalysis) return undefined;
    const msg = (recording.summary ?? "").toLowerCase();
    if (msg.includes("no audio") || msg.includes("no live transcripts")) return "no_audio";
    if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) return "network_error";
    if (msg.includes("partial")) return "partial_failure";
    return "processing_error";
  })();

  const failedOutputs = reanalyzeStatus.outputs
    ? Object.entries(reanalyzeStatus.outputs).filter(([, v]) => v === "error").map(([k]) => k)
    : [];

  const reanalyzeDisabledReason = !recording?.videoUrl
    ? "No video URL available for this recording"
    : isReanalyzing
    ? "Re-analysis is currently in progress"
    : reanalyzeMutation.isPending
    ? "Starting re-analysis..."
    : undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Play className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-medium" data-testid="text-recording-title">{recording.title}</h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(recording.recordedAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {recording.duration}
                </span>
                {meeting?.selectedAgents && meeting.selectedAgents.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-1">
                    {meeting.selectedAgents.map((agentId: string) => {
                      const agent = agents.find((a: any) => a.id?.toString() === agentId);
                      const agentType = agent?.type || "";
                      const label = agent?.name || agentId;
                      const config: Record<string, { icon: React.ReactNode; color: string }> = {
                        eva: { icon: <Bot className="w-2.5 h-2.5" />, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                        sop: { icon: <FileText className="w-2.5 h-2.5" />, color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
                        flowchart: { icon: <GitBranch className="w-2.5 h-2.5" />, color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
                        cro: { icon: <Target className="w-2.5 h-2.5" />, color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
                        scrum: { icon: <ScrollText className="w-2.5 h-2.5" />, color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
                        screen_observer: { icon: <Eye className="w-2.5 h-2.5" />, color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
                      };
                      const c = config[agentType] || { icon: <Bot className="w-2.5 h-2.5" />, color: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
                      return (
                        <span
                          key={agentId}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${c.color}`}
                          data-testid={`badge-agent-${agentId}`}
                        >
                          {c.icon}
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={showNewMeetingPopover} onOpenChange={setShowNewMeetingPopover}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-new-meeting"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Meeting
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="space-y-1">
                <button
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left"
                  data-testid="button-instant-meeting"
                  onClick={() => {
                    setShowNewMeetingPopover(false);
                    const randomId = Math.random().toString(36).substring(7);
                    setLocation(`/meeting/${randomId}?followUp=${meetingId}`);
                  }}
                >
                  <Zap className="w-4 h-4 text-amber-500" />
                  <div>
                    <div className="font-medium">Start Instant Meeting</div>
                    <div className="text-xs text-muted-foreground">Begin a meeting right now</div>
                  </div>
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left"
                  data-testid="button-schedule-followup"
                  onClick={() => {
                    setShowNewMeetingPopover(false);
                    setShowScheduleDialog(true);
                  }}
                >
                  <CalendarPlus className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="font-medium">Schedule Meeting</div>
                    <div className="text-xs text-muted-foreground">Pick a date and time</div>
                  </div>
                </button>
              </div>
            </PopoverContent>
          </Popover>
          
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-share-sop"
            onClick={async () => {
              try {
                const shareToken = await api.getOrCreateShareToken(recordingId);
                const shareUrl = `${window.location.origin}/sop/${shareToken}`;
                await navigator.clipboard.writeText(shareUrl);
                setShareLinkCopied(true);
                toast.success("Share link copied to clipboard");
                setTimeout(() => setShareLinkCopied(false), 2000);
              } catch (error) {
                toast.error("Failed to generate share link");
              }
            }}
            disabled={!activeSopContent}
          >
            {shareLinkCopied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Share2 className="w-4 h-4 mr-2" />}
            {shareLinkCopied ? "Copied!" : "Share SOP"}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-download-sop"
            onClick={() => {
              if (!activeSopContent) return;
              const blob = new Blob([activeSopContent], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${recording.title.replace(/[^a-z0-9]/gi, '_')}_SOP.md`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            disabled={!activeSopContent}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" data-testid="button-delete-recording">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Recording</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this recording? This will permanently remove the recording and its SOP content. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      {reanalyzeStatus.active && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4" data-testid="reanalyze-status-banner">
          <div className={`bg-card border ${reanalyzeStatus.completed && reanalyzeStatus.error ? 'border-destructive/30' : reanalyzeStatus.completed ? 'border-green-500/30' : 'border-border'} rounded-xl p-4`}>
            <div className="flex items-center gap-3 mb-2">
              {reanalyzeStatus.completed && reanalyzeStatus.error && reanalyzeStatus.errorCode !== "partial_failure" ? (
                <AlertCircle className="w-5 h-5 text-destructive" />
              ) : reanalyzeStatus.completed && !reanalyzeStatus.error ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <RefreshCw className={`w-5 h-5 text-primary ${!reanalyzeStatus.completed ? 'animate-spin' : ''}`} />
              )}
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {reanalyzeStatus.completed
                    ? reanalyzeStatus.errorCode === "partial_failure"
                      ? "Re-analysis Partially Completed"
                      : reanalyzeStatus.error
                      ? "Re-analysis Failed"
                      : "Re-analysis Complete"
                    : "Re-analyzing Recording"}
                </div>
                <div className={`text-xs mt-0.5 ${reanalyzeStatus.completed && reanalyzeStatus.error ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                  {reanalyzeStatus.status}
                </div>
              </div>
              {reanalyzeStatus.progress != null && !reanalyzeStatus.completed && (
                <span className="text-xs font-mono text-muted-foreground">{reanalyzeStatus.progress}%</span>
              )}
            </div>
            {!reanalyzeStatus.completed && reanalyzeStatus.progress != null && (
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(reanalyzeStatus.progress, 3)}%` }}
                />
              </div>
            )}
            {reanalyzeStatus.outputs && Object.keys(reanalyzeStatus.outputs).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(reanalyzeStatus.outputs).map(([key, status]) => {
                  const outputLabels: Record<string, string> = {
                    transcript: "Transcript", document: "Document", sop: "SOP",
                    cro: "CRO", flowchart: "Flowchart", meeting_notes: "Notes", meeting_record: "Record",
                  };
                  const statusConfig = {
                    pending: { color: "text-muted-foreground bg-muted/50", icon: null },
                    in_progress: { color: "text-primary bg-primary/10", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
                    done: { color: "text-green-500 bg-green-500/10", icon: <Check className="w-3 h-3" /> },
                    error: { color: "text-destructive bg-destructive/10", icon: <X className="w-3 h-3" /> },
                  }[status] ?? { color: "text-muted-foreground bg-muted/50", icon: null };
                  return (
                    <span key={key} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusConfig.color}`}>
                      {statusConfig.icon}
                      {outputLabels[key] ?? key}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6">
        {(recording.videoUrl || backupStatus?.storedVideoPath) && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6" data-testid="section-video-player">
            <div className="relative bg-black">
              <video
                ref={videoRef}
                src={backupStatus?.storedVideoPath || recording.videoUrl || undefined}
                className="w-full aspect-video"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                data-testid="video-player"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {!isPlaying && (
                  <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                    <Play className="w-8 h-8 text-white fill-current ml-1" />
                  </div>
                )}
              </div>
              <div 
                className="absolute inset-0 cursor-pointer"
                onClick={togglePlay}
                data-testid="video-overlay"
              />
            </div>
            <div className="p-4 bg-muted/30 border-t border-border">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePlay}
                  className="h-10 w-10"
                  data-testid="button-play-pause"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                </Button>
                
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground min-w-[40px]">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                    data-testid="video-seek-bar"
                  />
                  <span className="text-xs text-muted-foreground min-w-[40px]">
                    {formatTime(duration)}
                  </span>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="h-10 w-10"
                  data-testid="button-mute"
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleFullscreen}
                  className="h-10 w-10"
                  data-testid="button-fullscreen"
                >
                  <Maximize className="w-5 h-5" />
                </Button>

                <div className="border-l border-border pl-3 ml-1 flex items-center gap-2">
                  {backupStatus?.storageStatus === "stored" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" data-testid="badge-storage-stored">
                      <HardDrive className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                  {backupStatus?.storageStatus === "downloading" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse" data-testid="badge-storage-downloading">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Backing up...
                    </span>
                  )}
                  {backupStatus?.storageStatus === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => backupMutation.mutate()}
                      disabled={backupMutation.isPending}
                      data-testid="button-retry-backup"
                    >
                      <CloudOff className="w-3 h-3 mr-1.5" />
                      Retry Backup
                    </Button>
                  )}
                  {(backupStatus?.storageStatus === "pending" || (!backupStatus?.storageStatus && recording.videoUrl)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => backupMutation.mutate()}
                      disabled={backupMutation.isPending}
                      data-testid="button-backup-video"
                    >
                      <HardDrive className="w-3 h-3 mr-1.5" />
                      {backupMutation.isPending ? "Starting..." : "Save Video"}
                    </Button>
                  )}
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoFileSelect}
                    data-testid="input-upload-video"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => videoFileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    data-testid="button-upload-video"
                  >
                    <Upload className="w-3 h-3 mr-1.5" />
                    {uploadMutation.isPending ? (uploadProgress || "Uploading...") : "Upload Video"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!recording.videoUrl && !backupStatus?.storedVideoPath && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6" data-testid="section-no-video">
            <div className="aspect-video bg-muted/30 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Video recording not available</p>
                <p className="text-xs text-muted-foreground/60 mt-1">The video for this meeting was not recorded or has been removed</p>
              </div>
              <div>
                <input
                  ref={videoFileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleVideoFileSelect}
                  data-testid="input-upload-video-no-video"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => videoFileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  data-testid="button-upload-video-no-video"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadMutation.isPending ? (uploadProgress || "Uploading...") : "Upload Video"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className={`bg-gradient-to-br ${isFailedAnalysis ? 'from-card via-card to-destructive/10 border-destructive/30' : 'from-card via-card to-primary/5 border-border'} border rounded-xl p-5 mb-6`} data-testid="section-ai-summary">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl ${isFailedAnalysis ? 'bg-gradient-to-br from-destructive/80 to-destructive' : 'bg-gradient-to-br from-primary via-accent to-secondary'} flex items-center justify-center flex-shrink-0 shadow-lg`}>
              {isFailedAnalysis ? <AlertCircle className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 space-y-4">
              <div>
                {isFailedAnalysis ? (
                  (() => {
                      const errorConfig: Record<string, { title: string; description: string; icon: React.ReactNode; badge: string }> = {
                        no_audio: {
                          title: "No Audio Detected",
                          description: "The video file had no detectable audio, or the audio quality was too low to transcribe. Check that the recording has sound and try again.",
                          icon: <VolumeX className="w-4 h-4" />,
                          badge: "No Audio",
                        },
                        network_error: {
                          title: "Network Error",
                          description: "A network issue occurred while processing the video. This may be a transient error — retrying usually resolves it.",
                          icon: <WifiOff className="w-4 h-4" />,
                          badge: "Network Error",
                        },
                        partial_failure: {
                          title: "Partially Completed",
                          description: "Some outputs were generated successfully, but others failed. Use 'Retry Failed Outputs' to regenerate only the ones that didn't complete.",
                          icon: <TriangleAlert className="w-4 h-4" />,
                          badge: "Partial Failure",
                        },
                        processing_error: {
                          title: "Analysis Failed",
                          description: "An unexpected error occurred during processing. You can try re-analyzing the recording, or contact support if the issue persists.",
                          icon: <ServerCrash className="w-4 h-4" />,
                          badge: "Error",
                        },
                      };
                      const cfg = errorConfig[persistedErrorCode ?? "processing_error"] ?? errorConfig["processing_error"];
                      return (
                        <>
                          <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                            {cfg.title}
                            <span className="px-2 py-0.5 text-xs bg-destructive/20 text-destructive rounded-full">{cfg.badge}</span>
                          </h3>
                          <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-ai-summary">
                            {recording.summary}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">{cfg.description}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 border-destructive/30 hover:bg-destructive/10"
                            onClick={() => {
                              if (persistedErrorCode === "partial_failure" && failedOutputs.length > 0) {
                                const retryMap: Record<string, boolean> = {};
                                for (const k of failedOutputs) retryMap[k] = true;
                                setReanalyzeOutputs(retryMap);
                              }
                              setShowReanalyzeModal(true);
                            }}
                            disabled={isReanalyzing}
                            data-testid="button-retry-reanalyze"
                          >
                            {cfg.icon}
                            <span className="ml-2">{persistedErrorCode === "partial_failure" ? "Retry Failed Outputs" : "Retry Re-analyze"}</span>
                          </Button>
                        </>
                      );
                    })()
                ) : (
                  <>
                    <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                      AI Meeting Summary
                      <span className="px-2 py-0.5 text-xs bg-primary/20 text-primary rounded-full">Auto-generated</span>
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-ai-summary">
                      {recording.summary || "No summary available for this recording."}
                    </p>
                  </>
                )}
              </div>
              
              {summaryData.hasStructure && (
                <div className="grid gap-3 md:grid-cols-2 pt-2 border-t border-border/50">
                  {summaryData.keyDecisions.length > 0 && (
                    <div className="bg-background/50 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Key Decisions
                      </h4>
                      <ul className="space-y-1">
                        {summaryData.keyDecisions.slice(0, 3).map((decision, i) => (
                          <li key={i} className="text-xs text-foreground/80">{decision}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {summaryData.actionItems.length > 0 && (
                    <div className="bg-background/50 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-orange-400 mb-2 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" />
                        Action Items
                      </h4>
                      <ul className="space-y-1">
                        {summaryData.actionItems.slice(0, 3).map((action, i) => (
                          <li key={i} className="text-xs text-foreground/80">{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {!summaryData.hasStructure && summaryData.topics.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    Topics:
                  </span>
                  {summaryData.topics.slice(0, 4).map((topic, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-muted rounded-full text-foreground/70">
                      {topic.length > 40 ? topic.substring(0, 40) + "..." : topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {meetingId && <ScrumSummaryPanel meetingId={meetingId} />}

        {cloudTranscriptions.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 mb-4" data-testid="transcription-session-selector">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Transcription Sessions ({cloudTranscriptions.length})</h3>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowReanalyzeModal(true)}
                        disabled={isReanalyzing || reanalyzeMutation.isPending}
                        data-testid="button-reanalyze"
                        className={reanalyzeSuccessFlash ? "border-green-500 text-green-500 transition-colors duration-300" : ""}
                      >
                        {reanalyzeSuccessFlash ? (
                          <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                        ) : (
                          <RefreshCw className={`w-4 h-4 mr-2 ${isReanalyzing || reanalyzeMutation.isPending ? 'animate-spin' : ''}`} />
                        )}
                        {isReanalyzing ? (
                          <span className="flex items-center gap-1.5">
                            Re-analyzing...
                            {reanalyzeStatus.progress != null && (
                              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-mono">
                                {reanalyzeStatus.progress}%
                              </span>
                            )}
                          </span>
                        ) : reanalyzeMutation.isPending ? "Starting..." : reanalyzeSuccessFlash ? "Done!" : "Re-analyze"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isReanalyzing && (
                    <TooltipContent>
                      <p>Re-analysis is currently in progress</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-wrap gap-2">
              {cloudTranscriptions.map((t, idx) => {
                const isSelected = selectedTranscription?.id === t.id;
                const segmentCount = Array.isArray(t.parsedTranscript) ? (t.parsedTranscript as any[]).length : 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTranscriptionId(t.id)}
                    className={`flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
                    }`}
                    data-testid={`btn-select-session-${idx}`}
                  >
                    <span className="text-sm font-medium">Session {idx + 1}</span>
                    <span className="text-xs opacity-70">
                      {segmentCount > 0 ? `${segmentCount} segments` : "Transcript available"}
                      {t.sopContent ? " · SOP" : ""}
                      {t.croContent ? " · CRO" : ""}
                    </span>
                    {t.createdAt && (
                      <span className="text-xs opacity-50">
                        {format(new Date(t.createdAt), "MMM d, h:mm a")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasScrumMaster && meetingId && activeTab !== "meeting-record" && (
          <button
            onClick={() => setActiveTab("meeting-record")}
            className="w-full mb-4 p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl flex items-center gap-3 hover:from-indigo-500/15 hover:to-purple-500/15 transition-all text-left"
            data-testid="btn-scrum-meeting-record-banner"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <ScrollText className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">Scrum Meeting Record</h4>
              <p className="text-xs text-muted-foreground">View the generated Daily Scrum meeting record for this session</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          </button>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto mb-4 -mx-1 px-1">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
              <TabsTrigger value="sop" className="flex items-center gap-2" data-testid="tab-sop">
                <FileText className="w-4 h-4" />
                SOP
              </TabsTrigger>
              {activeCroContent && (
                <TabsTrigger value="cro" className="flex items-center gap-2" data-testid="tab-cro">
                  <Target className="w-4 h-4" />
                  CRO
                </TabsTrigger>
              )}
              <TabsTrigger value="flowchart" className="flex items-center gap-2" data-testid="tab-flowchart">
                <GitBranch className="w-4 h-4" />
                Flowchart
              </TabsTrigger>
              <TabsTrigger value="transcript" className="flex items-center gap-2" data-testid="tab-transcript">
                <MessageSquare className="w-4 h-4" />
                Transcript
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex items-center gap-2" data-testid="tab-notes">
                <ClipboardList className="w-4 h-4" />
                Notes
              </TabsTrigger>
              {meetingId && (
                <TabsTrigger value="meeting-record" className="flex items-center gap-2" data-testid="tab-meeting-record">
                  <ScrollText className="w-4 h-4" />
                  Meeting Record
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="sop" className="mt-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Generated Document
                </h2>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={updateMutation.isPending}
                        data-testid="button-cancel-edit"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                        data-testid="button-save-sop"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      disabled={!activeSopContent && !primarySop}
                      data-testid="button-edit-sop"
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>
              
              {isEditing ? (
                <div className="p-4">
                  <Textarea
                    value={editedSopContent}
                    onChange={(e) => setEditedSopContent(e.target.value)}
                    className="min-h-[calc(100vh-400px)] font-mono text-sm resize-none"
                    placeholder="Enter SOP content in Markdown format..."
                    data-testid="textarea-sop-edit"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Use Markdown formatting: ## for headings, - for bullet points, **bold**, *italic*
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-350px)]">
                  <div className="p-6 prose prose-invert prose-sm max-w-none" data-testid="content-sop">
                    {primarySop ? (
                      <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            primarySop.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                            primarySop.status === 'reviewed' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {primarySop.status.charAt(0).toUpperCase() + primarySop.status.slice(1)}
                          </span>
                          <span className="text-xs text-muted-foreground">Version {primarySop.version}</span>
                        </div>
                        
                        <div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">{primarySop.title}</h3>
                          {primarySop.goal && (
                            <p className="text-muted-foreground text-sm mb-4">{primarySop.goal}</p>
                          )}
                        </div>

                        {primarySop.trigger && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">Trigger</h4>
                            <p className="text-sm text-muted-foreground">{primarySop.trigger}</p>
                          </div>
                        )}

                        {primarySop.decisionPoints && primarySop.decisionPoints.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">Decision Points</h4>
                            <div className="space-y-3">
                              {primarySop.decisionPoints.map((dp: any, idx: number) => (
                                <div key={idx} className="pl-4 border-l-2 border-primary/50">
                                  <p className="font-medium text-sm">{dp.question}</p>
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    {dp.options?.map((opt: any, optIdx: number) => (
                                      <div key={optIdx} className="flex items-start gap-2 mt-1">
                                        <span className="text-primary">→</span>
                                        <span><strong>{opt.condition}:</strong> {opt.action}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {primarySop.steps && primarySop.steps.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">Steps</h4>
                            <ol className="list-decimal list-inside space-y-2 text-sm">
                              {primarySop.steps.map((step: string, idx: number) => (
                                <li key={idx} className="text-muted-foreground">{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {primarySop.exceptions && primarySop.exceptions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">Exceptions</h4>
                            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                              {primarySop.exceptions.map((exc: string, idx: number) => (
                                <li key={idx}>{exc}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {primarySop.assumptions && primarySop.assumptions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">Assumptions</h4>
                            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                              {primarySop.assumptions.map((assumption: string, idx: number) => (
                                <li key={idx}>{assumption}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : activeSopContent ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {activeSopContent}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">No document was generated for this meeting.</p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          {activeCroContent && (
            <TabsContent value="cro" className="mt-0">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <h2 className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Core Role Outcomes (CRO)
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([activeCroContent!], { type: "text/markdown" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${recording.title}-CRO.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      data-testid="button-download-cro"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-350px)]">
                  <div className="p-6 prose prose-invert prose-sm max-w-none" data-testid="content-cro">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeCroContent}
                    </ReactMarkdown>
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          )}

          <TabsContent value="flowchart" className="mt-0" forceMount style={{ display: activeTab === "flowchart" ? "block" : "none" }}>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  Process Flowchart
                </h2>
                {activeSopContent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateFlowchartMutation.mutate()}
                    disabled={generateFlowchartMutation.isPending || flowchartProgress !== 'idle'}
                    className="gap-2"
                    data-testid="btn-regenerate-flowchart"
                  >
                    <Sparkles className="w-4 h-4" />
                    {flowchartProgress !== 'idle' ? 'Generating...' : activeFlowchartCode ? 'Regenerate' : 'Generate Flowchart'}
                  </Button>
                )}
              </div>
              
              {flowchartProgress !== 'idle' && (
                <div className="px-4 py-3 border-b border-border bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{FLOWCHART_PROGRESS[flowchartProgress].label}</span>
                    <span className="text-xs font-medium text-primary">{FLOWCHART_PROGRESS[flowchartProgress].percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${FLOWCHART_PROGRESS[flowchartProgress].percent}%` }}
                    />
                  </div>
                </div>
              )}
              
              <div className="p-6 min-h-[400px] flex items-center justify-center" data-testid="content-flowchart">
                <div ref={flowchartRef} className="w-full overflow-x-auto flex justify-center" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transcript" className="mt-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Meeting Transcript
                  {(cloudTranscriptions.length > 0 || localTranscripts.length > 0 || chatMessages.length > 0) && (
                    <span className="text-xs text-muted-foreground">
                      {selectedTranscription
                        ? `(${Array.isArray(selectedTranscription.parsedTranscript) ? (selectedTranscription.parsedTranscript as any[]).length : 0} segments${cloudTranscriptions.length > 1 ? ` · Session ${cloudTranscriptions.indexOf(selectedTranscription) + 1} of ${cloudTranscriptions.length}` : ""})`
                        : localTranscripts.length > 0
                        ? `(${localTranscripts.length} segments)`
                        : `(${chatMessages.length} messages)`}
                    </span>
                  )}
                </h2>
                {recording?.videoUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => transcribeMutation.mutate()}
                    disabled={transcribeMutation.isPending}
                    className="gap-2"
                    data-testid="btn-transcribe-recording"
                  >
                    <Download className="w-4 h-4" />
                    {transcribeMutation.isPending
                      ? "Pulling..."
                      : jaasTranscriptions.length > 0
                      ? "Re-pull JaaS Transcript"
                      : "Pull JaaS Transcript"}
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="p-4 space-y-4" data-testid="content-transcript">
                  {selectedTranscription ? (
                    <div className="space-y-6">
                      {(() => {
                        const transcription = selectedTranscription;
                        return (
                          <div key={transcription.id} className="space-y-4">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                <Volume2 className="w-3 h-3" />
                                JaaS Cloud
                              </span>
                              {cloudTranscriptions.length > 1 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                  Session {cloudTranscriptions.indexOf(transcription) + 1}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                Provided by JaaS transcription service
                              </span>
                            </div>
                            {transcription.aiSummary && (
                              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Sparkles className="w-4 h-4 text-primary" />
                                  <span className="text-sm font-medium text-primary">AI Transcription Summary</span>
                                </div>
                                <p className="text-sm text-foreground">{transcription.aiSummary}</p>
                              </div>
                            )}
                            {(() => {
                              const items = transcription.actionItems;
                              if (!items || !Array.isArray(items) || items.length === 0) return null;
                              return (
                                <div className="bg-accent/10 border border-accent/20 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Target className="w-4 h-4 text-accent" />
                                    <span className="text-sm font-medium text-accent">Action Items</span>
                                  </div>
                                  <ul className="space-y-1">
                                    {(items as any[]).map((item, idx) => (
                                      <li key={idx} className="flex items-start gap-2 text-sm">
                                        <CheckCircle className="w-3 h-3 text-accent mt-1 flex-shrink-0" />
                                        <span>{String(item)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })()}
                            {transcription.parsedTranscript && Array.isArray(transcription.parsedTranscript) && transcription.parsedTranscript.length > 0 ? (
                              <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Full Transcript</h3>
                                {(() => {
                                  const raw = transcription.parsedTranscript as any[];
                                  let segments: { speaker: string; text: string; timestamp: string }[] = [];
                                  if (raw.length === 1 && raw[0].text && typeof raw[0].text === "string") {
                                    try {
                                      const parsed = JSON.parse(raw[0].text);
                                      if (parsed.messages && Array.isArray(parsed.messages)) {
                                        segments = parsed.messages.map((m: any) => ({
                                          speaker: m.name || raw[0].speaker || "Participant",
                                          text: m.content || "",
                                          timestamp: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "",
                                        }));
                                      }
                                    } catch {
                                      segments = raw as any;
                                    }
                                  }
                                  if (segments.length === 0) {
                                    segments = raw.map((s: any) => ({
                                      speaker: s.speaker || "Participant",
                                      text: s.text || "",
                                      timestamp: s.timestamp || "",
                                    }));
                                  }
                                  return segments.map((segment, idx) => (
                                    <div key={idx} className="flex gap-3">
                                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                        <User className="w-4 h-4 text-foreground" />
                                      </div>
                                      <div className="flex-1 bg-muted/50 border border-border rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-medium">{segment.speaker}</span>
                                          {segment.timestamp && (
                                            <span className="text-xs opacity-60">{segment.timestamp}</span>
                                          )}
                                        </div>
                                        <p className="text-sm whitespace-pre-wrap">{segment.text}</p>
                                      </div>
                                    </div>
                                  ));
                                })()}
                              </div>
                            ) : transcription.rawTranscript ? (
                              <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Full Transcript</h3>
                                <div className="bg-muted/50 border border-border rounded-xl p-4">
                                  <pre className="text-sm whitespace-pre-wrap font-sans">{transcription.rawTranscript}</pre>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4">
                                <p className="text-sm text-muted-foreground">Transcription is being processed...</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : localTranscripts.length > 0 ? (
                    // Priority 2: Live capture segments (recorded in real-time during the meeting)
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          <MessageSquare className="w-3 h-3" />
                          Live Capture
                        </span>
                        <span className="text-xs text-muted-foreground">Captured in real-time during meeting</span>
                      </div>
                      {localTranscripts.map((segment) => (
                        <div key={segment.id} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-foreground" />
                          </div>
                          <div className="flex-1 bg-muted/50 border border-border rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium">{segment.speaker}</span>
                              <span className="text-xs opacity-60">
                                {format(new Date(segment.createdAt), "h:mm:ss a")}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{segment.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : chatMessages.length > 0 ? (
                    chatMessages.map((message) => (
                      <div 
                        key={message.id} 
                        className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {message.role === 'ai' && (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div 
                          className={`max-w-[80%] rounded-xl p-3 ${
                            message.role === 'user' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted/50 border border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium">
                              {message.role === 'user' ? 'You' : 'EVA'}
                            </span>
                            <span className="text-xs opacity-60">
                              {format(new Date(message.createdAt), "h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                        {message.role === 'user' && (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-foreground" />
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 space-y-2">
                      <p className="text-muted-foreground italic">No transcript available for this meeting.</p>
                      {recording?.videoUrl && (
                        <p className="text-sm text-muted-foreground">
                          Use the "Pull JaaS Transcript" button above to generate an AI transcript from the recording.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="mt-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-blue-400" />
                  Meeting Notes
                </h2>
              </div>
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="p-6" data-testid="content-notes">
                  {(() => {
                    const evaNotesMessages = chatMessages.filter(m => m.role === "ai" && m.content?.includes("##"));
                    const latestNotes = evaNotesMessages[evaNotesMessages.length - 1];
                    
                    if (!latestNotes) {
                      return (
                        <div className="text-center py-8 space-y-2">
                          <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/30" />
                          <p className="text-muted-foreground italic">No meeting notes were captured during this session.</p>
                          <p className="text-sm text-muted-foreground/70">
                            Notes are captured automatically by EVA during live meetings.
                          </p>
                        </div>
                      );
                    }

                    const parseNotes = (content: string) => {
                      const sections: { title: string; items: string[] }[] = [];
                      let currentSection: { title: string; items: string[] } | null = null;
                      const lines = content.split('\n');
                      for (const line of lines) {
                        if (line.startsWith('## ') || line.startsWith('### ')) {
                          if (currentSection) sections.push(currentSection);
                          currentSection = { title: line.replace(/^#+\s*/, ''), items: [] };
                        } else if (line.startsWith('- ') && currentSection) {
                          currentSection.items.push(line.substring(2));
                        } else if (line.trim() && currentSection && !line.startsWith('#')) {
                          currentSection.items.push(line.trim());
                        }
                      }
                      if (currentSection) sections.push(currentSection);
                      return sections;
                    };

                    const sections = parseNotes(latestNotes.content);

                    return (
                      <div className="space-y-6">
                        {sections.length > 0 ? (
                          sections.map((section, idx) => (
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
                          ))
                        ) : (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {latestNotes.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        <div className="pt-4 border-t border-border/50">
                          <p className="text-xs text-muted-foreground">
                            Last updated: {format(new Date(latestNotes.createdAt), "MMM d, yyyy 'at' h:mm:ss a")}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {meetingId && (
            <TabsContent value="meeting-record" className="mt-0">
              <ScrumMeetingRecordTab meetingId={meetingId} />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <ScheduleMeetingDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        onSuccess={(meetingLink) => {
          setShowScheduleDialog(false);
          if (meetingLink) setLocation(meetingLink);
        }}
        initialSelectedAgents={meeting?.selectedAgents || undefined}
        initialTitle={recording?.title || meeting?.title || ""}
        followUpContext={{
          previousMeetingId: meetingId,
          meetingSeriesId: meeting?.meetingSeriesId || undefined,
          documentContext: activeSopContent || undefined,
        }}
      />

      <Dialog open={showReanalyzeModal} onOpenChange={setShowReanalyzeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Re-analyze {selectedTranscription ? `Session` : "Recording"}
            </DialogTitle>
            <DialogDescription>
              {selectedTranscription
                ? "Generate documents from this session's transcript. Select the outputs you want to create."
                : "The video will be re-transcribed from scratch using AI. Select the outputs you want to regenerate from the new transcription."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {([
              ...(selectedTranscription ? [] : [
                { key: "document", label: "Document", icon: FileText, description: "General document from transcript" },
              ]),
              { key: "sop", label: "SOP", icon: FileText, description: "Standard Operating Procedure" },
              { key: "cro", label: "CRO", icon: Target, description: "Core Role Objective" },
              { key: "flowchart", label: "Flowchart", icon: GitBranch, description: "Process flow diagram" },
              ...(selectedTranscription ? [] : [
                { key: "transcript", label: "Transcript", icon: MessageSquare, description: "Full meeting transcript" },
              ]),
              { key: "meeting_notes", label: "Meeting Notes", icon: ClipboardList, description: "Structured meeting notes" },
              { key: "meeting_record", label: "Meeting Record", icon: ScrollText, description: "Complete meeting record" },
            ] as Array<{ key: string; label: string; icon: any; description: string }>).map(({ key, label, icon: Icon, description }) => {
              const outputStatus = reanalyzeStatus.outputs?.[key];
              const statusBadge = outputStatus === "done"
                ? <span className="text-xs text-green-500 flex items-center gap-0.5"><Check className="w-3 h-3" />Done</span>
                : outputStatus === "in_progress"
                ? <span className="text-xs text-primary flex items-center gap-0.5"><Loader2 className="w-3 h-3 animate-spin" />Running</span>
                : outputStatus === "error"
                ? <span className="text-xs text-destructive flex items-center gap-0.5"><AlertCircle className="w-3 h-3" />Failed</span>
                : null;
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${outputStatus === "error" ? "border-destructive/40 bg-destructive/5" : outputStatus === "done" ? "border-green-500/30 bg-green-500/5" : "border-border hover:bg-muted/50"} cursor-pointer`}
                  data-testid={`reanalyze-option-${key}`}
                >
                  <input
                    type="checkbox"
                    checked={reanalyzeOutputs[key] ?? false}
                    onChange={(e) =>
                      setReanalyzeOutputs((prev) => ({
                        ...prev,
                        [key]: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                  {statusBadge}
                </label>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowReanalyzeModal(false)}
              data-testid="button-cancel-reanalyze"
            >
              Cancel
            </Button>
            <Button
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending || Object.values(reanalyzeOutputs).every((v) => !v)}
              data-testid="button-confirm-reanalyze"
            >
              {reanalyzeMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-analyze
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReanalyzeResults} onOpenChange={setShowReanalyzeResults}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Re-analysis Results
            </DialogTitle>
            <DialogDescription>
              {reanalyzeResultsData?.startedAt && reanalyzeResultsData?.completedAt
                ? `Completed in ${Math.round((new Date(reanalyzeResultsData.completedAt).getTime() - new Date(reanalyzeResultsData.startedAt).getTime()) / 1000)}s`
                : "Re-analysis completed"}
            </DialogDescription>
          </DialogHeader>

          {reanalyzeResultsData?.outputs && (
            <div className="space-y-4">
              <div className="grid gap-2">
                {Object.entries(reanalyzeResultsData.outputs).map(([key, status]) => {
                  const outputLabels: Record<string, string> = {
                    transcript: "Transcript", document: "Document", sop: "SOP",
                    cro: "CRO", flowchart: "Flowchart", meeting_notes: "Meeting Notes", meeting_record: "Meeting Record",
                  };
                  const outputIcons: Record<string, React.ReactNode> = {
                    transcript: <FileText className="w-4 h-4" />,
                    document: <FileText className="w-4 h-4" />,
                    sop: <ClipboardList className="w-4 h-4" />,
                    cro: <Target className="w-4 h-4" />,
                    flowchart: <GitBranch className="w-4 h-4" />,
                    meeting_notes: <ScrollText className="w-4 h-4" />,
                    meeting_record: <ClipboardList className="w-4 h-4" />,
                  };
                  const statusStyle = status === "done"
                    ? { border: 'border-green-500/20 bg-green-500/5', color: 'text-green-500', icon: <CheckCircle className="w-4 h-4 text-green-500" /> }
                    : status === "error"
                    ? { border: 'border-destructive/20 bg-destructive/5', color: 'text-destructive', icon: <AlertCircle className="w-4 h-4 text-destructive" /> }
                    : { border: 'border-border bg-muted/30', color: 'text-muted-foreground', icon: <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" /> };
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${statusStyle.border}`}
                      data-testid={`reanalyze-result-${key}`}
                    >
                      <div className={statusStyle.color}>
                        {outputIcons[key] || <FileText className="w-4 h-4" />}
                      </div>
                      <span className="flex-1 text-sm font-medium">{outputLabels[key] ?? key}</span>
                      {statusStyle.icon}
                    </div>
                  );
                })}
              </div>

              {recording?.summary && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Updated Summary</h4>
                  <div className="text-sm text-foreground bg-muted/30 rounded-lg p-3 max-h-40 overflow-y-auto overflow-x-hidden break-words">
                    {recording.summary.length > 500 ? recording.summary.slice(0, 500) + "..." : recording.summary}
                  </div>
                </div>
              )}

              {activeSopContent && (reanalyzeResultsData?.outputs?.sop === "done" || reanalyzeResultsData?.outputs?.document === "done") && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    SOP Highlights
                  </h4>
                  <div className="text-sm text-foreground bg-muted/30 rounded-lg p-3 max-h-40 overflow-y-auto overflow-x-hidden break-words prose prose-invert prose-sm max-w-none [&_*]:break-words [&_pre]:whitespace-pre-wrap [&_code]:break-all">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeSopContent.length > 800 ? activeSopContent.slice(0, 800) + "\n\n*...view full SOP in the SOP tab*" : activeSopContent}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {activeCroContent && reanalyzeResultsData?.outputs?.cro === "done" && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    CRO Preview
                  </h4>
                  <div className="text-sm text-foreground bg-muted/30 rounded-lg p-3 max-h-32 overflow-y-auto overflow-x-hidden break-words prose prose-invert prose-sm max-w-none [&_*]:break-words [&_pre]:whitespace-pre-wrap [&_code]:break-all">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeCroContent.length > 500 ? activeCroContent.slice(0, 500) + "\n\n*...view full CRO in the CRO tab*" : activeCroContent}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {(() => {
                const transcriptions = jaasTranscriptions || [];
                const latestTranscription = transcriptions.length > 0 ? transcriptions[transcriptions.length - 1] : null;
                const actionItems = latestTranscription?.actionItems;
                if (!actionItems || !Array.isArray(actionItems) || actionItems.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">Action Items</h4>
                    <ul className="space-y-1">
                      {(actionItems as string[]).slice(0, 5).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                      {actionItems.length > 5 && (
                        <li className="text-xs text-muted-foreground pl-5">+{actionItems.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                );
              })()}

              {(() => {
                const transcriptions = jaasTranscriptions || [];
                const latestTranscription = transcriptions.length > 0 ? transcriptions[transcriptions.length - 1] : null;
                const segments = latestTranscription?.parsedTranscript;
                if (!segments || !Array.isArray(segments) || segments.length === 0) return null;
                const speakers = [...new Set(segments.map((s: any) => s.speaker))];
                return (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">Speakers Detected</h4>
                    <div className="flex flex-wrap gap-2">
                      {speakers.map((speaker, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                          <User className="w-3 h-3" />
                          {speaker as string}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{segments.length} transcript segments</p>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowReanalyzeResults(false)} data-testid="button-close-reanalyze-results">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
