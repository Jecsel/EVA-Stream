import { useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { useRealtimeSpeech } from '@/hooks/useRealtimeSpeech';

interface RealtimeTranscriptProps {
  meetingId: string;
  onTranscriptUpdate?: (text: string) => void;
}

export function RealtimeTranscript({ meetingId, onTranscriptUpdate }: RealtimeTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const syncToServer = useCallback(async (text: string) => {
    try {
      await fetch(`/api/meetings/${meetingId}/transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker: 'User', text, isFinal: true }),
      });
      if (onTranscriptUpdate) {
        onTranscriptUpdate(text);
      }
    } catch (err) {
      console.error('Failed to sync transcript:', err);
    }
  }, [meetingId, onTranscriptUpdate]);

  const {
    isListening,
    isSupported,
    interimTranscript,
    segments,
    toggleListening,
    error,
  } = useRealtimeSpeech({
    onFinalTranscript: syncToServer,
    continuous: true,
    language: 'en-US',
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, interimTranscript]);

  if (!isSupported) {
    return (
      <Card className="bg-card border-border" data-testid="transcript-unsupported">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Live Transcript
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border flex flex-col h-full" data-testid="realtime-transcript">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Live Transcript
          </CardTitle>
          <div className="flex items-center gap-2">
            {isListening && (
              <Badge variant="outline" className="text-xs animate-pulse bg-red-500/10 text-red-400 border-red-500/30">
                Recording
              </Badge>
            )}
            <Button
              variant={isListening ? "destructive" : "default"}
              size="sm"
              onClick={toggleListening}
              data-testid="toggle-transcript-btn"
            >
              {isListening ? (
                <>
                  <MicOff className="h-4 w-4 mr-1" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-1" />
                  Start
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4" ref={scrollRef}>
          <div className="space-y-2">
            {segments.length === 0 && !interimTranscript && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isListening 
                  ? "Listening... Start speaking to see your transcript appear here in real-time."
                  : "Click 'Start' to begin transcribing your speech in real-time."}
              </p>
            )}
            
            {segments.map((segment) => (
              <div
                key={segment.id}
                className="text-sm bg-muted/50 rounded-lg p-2 border border-border/50"
                data-testid={`transcript-segment-${segment.id}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-primary">{segment.speaker}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(segment.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-foreground">{segment.text}</p>
              </div>
            ))}
            
            {interimTranscript && (
              <div
                className="text-sm bg-primary/10 rounded-lg p-2 border border-primary/30 animate-pulse"
                data-testid="interim-transcript"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-primary">User</span>
                  <span className="text-xs text-muted-foreground">typing...</span>
                </div>
                <p className="text-foreground/80 italic">{interimTranscript}</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        {error && (
          <div className="px-4 pb-4">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
