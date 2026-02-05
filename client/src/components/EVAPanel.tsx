import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Edit3, Save, X, FileText, Play, Pause, Square, Download, FileDown } from "lucide-react";
import jsPDF from "jspdf";
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

  const handleDownloadMD = useCallback(() => {
    const blob = new Blob([sopContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SOP-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sopContent]);

  const handleDownloadPDF = useCallback(() => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let yPosition = 20;
    const lineHeight = 7;
    
    // Parse markdown and convert to plain text with formatting
    const lines = sopContent.split('\n');
    
    lines.forEach((line) => {
      // Check if we need a new page
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Handle headers
      if (line.startsWith('# ')) {
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(line.replace('# ', ''), margin, yPosition);
        yPosition += lineHeight + 4;
      } else if (line.startsWith('## ')) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(line.replace('## ', ''), margin, yPosition);
        yPosition += lineHeight + 2;
      } else if (line.startsWith('### ')) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(line.replace('### ', ''), margin, yPosition);
        yPosition += lineHeight + 1;
      } else if (line.startsWith('**') && line.endsWith('**')) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(line.replace(/\*\*/g, ''), margin, yPosition);
        yPosition += lineHeight;
      } else if (line.trim() === '') {
        yPosition += lineHeight / 2;
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        // Word wrap long lines
        const textLines = doc.splitTextToSize(line.replace(/\*\*/g, '').replace(/\*/g, ''), maxWidth);
        textLines.forEach((textLine: string) => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(textLine, margin, yPosition);
          yPosition += lineHeight;
        });
      }
    });
    
    doc.save(`SOP-${new Date().toISOString().split('T')[0]}.pdf`);
  }, [sopContent]);

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
                  onClick={() => {
                    onStartObservation?.();
                    onGeneratorStateChange("running");
                  }}
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
                    onClick={() => {
                      onStopObservation?.();
                      onGeneratorStateChange("stopped");
                    }}
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
                    onClick={() => {
                      onStartObservation?.();
                      onGeneratorStateChange("running");
                    }}
                    data-testid="button-resume-sop-generator"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => {
                      onStopObservation?.();
                      onGeneratorStateChange("stopped");
                    }}
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
          <div className="flex items-center gap-1">
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
              <>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={handleDownloadPDF}
                  disabled={!sopContent || sopContent.includes('*Waiting')}
                  data-testid="button-download-pdf"
                  title="Download as PDF"
                >
                  <FileDown className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">PDF</span>
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={handleDownloadMD}
                  disabled={!sopContent || sopContent.includes('*Waiting')}
                  data-testid="button-download-md"
                  title="Download as Markdown"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">MD</span>
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleStartEditing}
                  data-testid="button-edit-sop"
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              </>
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
