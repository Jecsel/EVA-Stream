import { useState, useRef, useEffect } from "react";
import { Loader2, Edit3, Save, X, FileText, Play, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@shared/schema";

export type GeneratorState = "idle" | "running" | "paused" | "stopped";

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
  className?: string;
  sopContent?: string;
  onSopContentChange?: (content: string) => void;
  isSopUpdating?: boolean;
  generatorState?: GeneratorState;
  onGeneratorStateChange?: (state: GeneratorState) => void;
}

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
  className,
  sopContent = "",
  onSopContentChange,
  isSopUpdating = false,
  generatorState = "idle",
  onGeneratorStateChange,
}: EVAPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(sopContent);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync edited content when sopContent changes externally (live updates from EVA)
  useEffect(() => {
    if (!isEditing) {
      setEditedContent(sopContent);
    }
  }, [sopContent, isEditing]);

  // Auto-scroll to bottom when content updates
  useEffect(() => {
    if (scrollRef.current && !isEditing) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sopContent, isEditing]);

  const handleStartEditing = () => {
    setEditedContent(sopContent);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (onSopContentChange) {
      onSopContentChange(editedContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedContent(sopContent);
    setIsEditing(false);
  };

  return (
    <div className={cn("flex flex-col h-full bg-card border-l border-border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">SOP Generator</h2>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "w-2 h-2 rounded-full",
                isSopUpdating ? "bg-blue-500 animate-pulse" :
                generatorState === "running" ? "bg-green-500 animate-pulse" :
                generatorState === "paused" ? "bg-yellow-500" :
                generatorState === "stopped" ? "bg-red-500" :
                "bg-muted-foreground"
              )} />
              <p className="text-xs text-muted-foreground">
                {isSopUpdating ? "Processing..." :
                 generatorState === "running" ? "Recording" :
                 generatorState === "paused" ? "Paused" :
                 generatorState === "stopped" ? "Stopped" : "Ready"}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Generator Controls */}
          {onGeneratorStateChange && (
            <div className="flex items-center gap-1">
              {(generatorState === "idle" || generatorState === "stopped") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                  onClick={() => onGeneratorStateChange("running")}
                  data-testid="button-start-sop-generator"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Start
                </Button>
              )}
              {generatorState === "running" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                    onClick={() => onGeneratorStateChange("paused")}
                    data-testid="button-pause-sop-generator"
                  >
                    <Pause className="w-4 h-4 mr-1" />
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => onGeneratorStateChange("stopped")}
                    data-testid="button-stop-sop-generator"
                  >
                    <Square className="w-4 h-4 mr-1" />
                    Stop
                  </Button>
                </>
              )}
              {generatorState === "paused" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                    onClick={() => onGeneratorStateChange("running")}
                    data-testid="button-resume-sop-generator"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => onGeneratorStateChange("stopped")}
                    data-testid="button-stop-sop-generator-paused"
                  >
                    <Square className="w-4 h-4 mr-1" />
                    Stop
                  </Button>
                </>
              )}
            </div>
          )}
          
          {/* Status indicator */}
          {isSopUpdating && (
            <div className="flex items-center gap-1.5 text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Updating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Live SOP Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* SOP Header with Edit controls */}
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Live SOP Document</span>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleCancelEdit}
                  data-testid="button-cancel-edit"
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSaveEdit}
                  data-testid="button-save-edit"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </>
            ) : (
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={handleStartEditing}
                data-testid="button-edit-sop"
              >
                <Edit3 className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* SOP Content Area */}
        {isEditing ? (
          <div className="flex-1 p-4 overflow-hidden">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full h-full resize-none font-mono text-sm"
              placeholder="# SOP Title&#10;&#10;## Overview&#10;Describe the process...&#10;&#10;## Steps&#10;1. First step&#10;2. Second step"
              data-testid="textarea-sop-edit"
            />
          </div>
        ) : (
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="p-4">
              {sopContent ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {sopContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium mb-1">SOP will appear here</p>
                  <p className="text-xs">
                    {isObserving 
                      ? "EVA is observing your screen and will update the SOP based on what you show..."
                      : "Click 'Start Observing' to share your screen and generate an SOP"
                    }
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Live updates indicator */}
      {isObserving && !isEditing && (
        <div className="px-4 py-2 border-t border-border bg-blue-500/5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs text-blue-400">
            Live updates enabled - SOP updates as EVA observes your screen
          </span>
        </div>
      )}
    </div>
  );
}
