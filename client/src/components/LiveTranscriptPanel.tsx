import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface TranscriptEntry {
  id: string;
  text: string;
  speaker: string;
  timestamp: Date;
  isFinal: boolean;
}

interface LiveTranscriptPanelProps {
  transcripts: TranscriptEntry[];
  isTranscribing: boolean;
  onToggleTranscription: () => void;
  status: "idle" | "connecting" | "transcribing" | "error";
  className?: string;
}

export function LiveTranscriptPanel({
  transcripts,
  isTranscribing,
  onToggleTranscription,
  status,
  className,
}: LiveTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, autoScroll]);

  return (
    <div className={cn("flex flex-col h-full bg-card", className)}>
      <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-cyan-400" />
          <span className="font-medium text-sm">Live Transcript</span>
          {isTranscribing && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Recording</span>
            </span>
          )}
        </div>
        <Button
          variant={isTranscribing ? "destructive" : "default"}
          size="sm"
          onClick={onToggleTranscription}
          disabled={status === "connecting"}
          data-testid={isTranscribing ? "button-stop-transcription" : "button-start-transcription"}
        >
          {isTranscribing ? (
            <>
              <MicOff className="w-4 h-4 mr-1" />
              Stop
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 mr-1" />
              Start
            </>
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-3" data-testid="content-live-transcript">
          {transcripts.length === 0 ? (
            <div className="text-center py-8">
              <Mic className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {isTranscribing 
                  ? "Listening for speech..." 
                  : "Click Start to begin live transcription"}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Your microphone audio will be transcribed in real-time
              </p>
            </div>
          ) : (
            transcripts.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "p-3 rounded-lg border",
                  entry.isFinal
                    ? "bg-muted/30 border-border"
                    : "bg-cyan-500/10 border-cyan-500/30 animate-pulse"
                )}
                data-testid={`transcript-entry-${entry.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-cyan-400">
                    {entry.speaker}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(entry.timestamp, "h:mm:ss a")}
                  </span>
                </div>
                <p className="text-sm text-foreground">{entry.text}</p>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {transcripts.length > 0 && (
        <div className="p-2 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground text-center">
            {transcripts.length} segment{transcripts.length !== 1 ? "s" : ""} transcribed
          </p>
        </div>
      )}
    </div>
  );
}
