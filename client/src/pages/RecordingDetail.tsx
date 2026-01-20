import { useEffect, useRef, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ArrowLeft, Clock, Calendar, FileText, GitBranch, Play, Pause, Sparkles, Download, Edit2, Save, X, Trash2, CheckCircle, AlertCircle, Target, MessageSquare, User, Bot, Video, Volume2, VolumeX, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";

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

export default function RecordingDetail() {
  const [, params] = useRoute("/recording/:id");
  const [, setLocation] = useLocation();
  const recordingId = params?.id || "";
  const flowchartRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [renderedSopContent, setRenderedSopContent] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSopContent, setEditedSopContent] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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
    if (recording?.sopContent && !isEditing) {
      setEditedSopContent(recording.sopContent);
    }
  }, [recording?.sopContent, isEditing]);

  useEffect(() => {
    if (!flowchartRef.current) return;
    
    if (!recording?.sopContent) {
      flowchartRef.current.innerHTML = `<p class="text-muted-foreground italic">No SOP content available to generate flowchart.</p>`;
      setRenderedSopContent(null);
      return;
    }
    
    if (recording.sopContent !== renderedSopContent) {
      const renderFlowchart = async () => {
        try {
          const flowchartCode = generateFlowchartFromSOP(recording.sopContent || "");
          flowchartRef.current!.innerHTML = "";
          const uniqueId = `flowchart-${Date.now()}`;
          const { svg } = await mermaid.render(uniqueId, flowchartCode);
          flowchartRef.current!.innerHTML = svg;
          setRenderedSopContent(recording.sopContent);
        } catch (err) {
          console.error("Failed to render flowchart:", err);
          flowchartRef.current!.innerHTML = `<p class="text-muted-foreground">Could not generate flowchart</p>`;
        }
      };
      renderFlowchart();
    }
  }, [recording?.sopContent, renderedSopContent]);

  const handleSave = () => {
    updateMutation.mutate(editedSopContent);
  };

  const handleCancelEdit = () => {
    setEditedSopContent(recording?.sopContent || "");
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
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-download-sop"
            onClick={() => {
              if (!recording?.sopContent) return;
              const blob = new Blob([recording.sopContent], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${recording.title.replace(/[^a-z0-9]/gi, '_')}_SOP.md`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            disabled={!recording?.sopContent}
          >
            <Download className="w-4 h-4 mr-2" />
            Export SOP
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6">
        {recording.videoUrl && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6" data-testid="section-video-player">
            <div className="relative bg-black">
              <video
                ref={videoRef}
                src={recording.videoUrl}
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
              </div>
            </div>
          </div>
        )}

        {!recording.videoUrl && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6" data-testid="section-no-video">
            <div className="aspect-video bg-muted/30 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Video recording not available</p>
                <p className="text-xs text-muted-foreground/60 mt-1">The video for this meeting was not recorded or has been removed</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-br from-card via-card to-primary/5 border border-border rounded-xl p-5 mb-6" data-testid="section-ai-summary">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-accent to-secondary flex items-center justify-center flex-shrink-0 shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                  AI Meeting Summary
                  <span className="px-2 py-0.5 text-xs bg-primary/20 text-primary rounded-full">Auto-generated</span>
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-ai-summary">
                  {recording.summary || "No summary available for this recording."}
                </p>
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

        <Tabs defaultValue="sop" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="sop" className="flex items-center gap-2" data-testid="tab-sop">
              <FileText className="w-4 h-4" />
              SOP Document
            </TabsTrigger>
            <TabsTrigger value="flowchart" className="flex items-center gap-2" data-testid="tab-flowchart">
              <GitBranch className="w-4 h-4" />
              Flowchart
            </TabsTrigger>
            <TabsTrigger value="transcript" className="flex items-center gap-2" data-testid="tab-transcript">
              <MessageSquare className="w-4 h-4" />
              Transcript
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sop" className="mt-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Standard Operating Procedure
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
                      disabled={!recording.sopContent}
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
                    {recording.sopContent ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {recording.sopContent}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">No SOP content was generated for this meeting.</p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent value="flowchart" className="mt-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  Process Flowchart
                </h2>
              </div>
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
                  {(localTranscripts.length > 0 || jaasTranscriptions.length > 0 || chatMessages.length > 0) && (
                    <span className="text-xs text-muted-foreground">
                      {localTranscripts.length > 0 
                        ? `(${localTranscripts.length} segments)` 
                        : jaasTranscriptions.length > 0 
                          ? '(AI transcription available)' 
                          : `(${chatMessages.length} messages)`}
                    </span>
                  )}
                </h2>
                {recording?.videoUrl && localTranscripts.length === 0 && jaasTranscriptions.length === 0 && (
                  <Button
                    size="sm"
                    onClick={() => transcribeMutation.mutate()}
                    disabled={transcribeMutation.isPending}
                    className="gap-2"
                    data-testid="btn-transcribe-recording"
                  >
                    <Sparkles className="w-4 h-4" />
                    {transcribeMutation.isPending ? "Starting..." : "Generate Transcript"}
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="p-4 space-y-4" data-testid="content-transcript">
                  {localTranscripts.length > 0 ? (
                    <div className="space-y-3">
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
                  ) : jaasTranscriptions.length > 0 ? (
                    <div className="space-y-6">
                      {jaasTranscriptions.map((transcription) => (
                        <div key={transcription.id} className="space-y-4">
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
                                  {items.map((item, idx) => (
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
                              {(transcription.parsedTranscript as { speaker: string; text: string; timestamp: string }[]).map((segment, idx) => (
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
                              ))}
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
                    <div className="text-center py-8 space-y-4">
                      <p className="text-muted-foreground italic">No transcript available for this meeting.</p>
                      {recording?.videoUrl && (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            This recording has a video. You can generate an AI transcript from it.
                          </p>
                          <Button
                            onClick={() => transcribeMutation.mutate()}
                            disabled={transcribeMutation.isPending}
                            className="gap-2"
                            data-testid="btn-transcribe-empty"
                          >
                            <Sparkles className="w-4 h-4" />
                            {transcribeMutation.isPending ? "Starting Transcription..." : "Generate AI Transcript"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
