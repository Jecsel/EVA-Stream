import { useEffect, useRef, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ChatMessage } from "@shared/schema";

interface NoteTakerPanelProps {
  messages: ChatMessage[];
  isProcessing: boolean;
  onRefresh?: () => void;
  className?: string;
}

export function NoteTakerPanel({
  messages,
  isProcessing,
  onRefresh,
  className,
}: NoteTakerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const noteTakerMessages = messages.filter(m => m.context === "NoteTaker");
  const latestNotes = noteTakerMessages[noteTakerMessages.length - 1];

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [noteTakerMessages, autoScroll]);

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

  return (
    <div className={cn("flex flex-col h-full bg-card", className)}>
      <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" />
          <span className="font-medium text-sm">Meeting Notes</span>
          {isProcessing && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Updating</span>
            </span>
          )}
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isProcessing}
            data-testid="button-refresh-notes"
          >
            <RefreshCw className={cn("w-4 h-4", isProcessing && "animate-spin")} />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4" data-testid="content-notetaker">
          {!latestNotes ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Notes will appear as the meeting progresses
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                The NoteTaker analyzes transcriptions to extract key points and action items
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
    </div>
  );
}
