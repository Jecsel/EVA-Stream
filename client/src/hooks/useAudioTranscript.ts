import { useEffect, useRef, useState, useCallback } from "react";

interface TranscriptMessage {
  type: "transcript" | "status" | "error";
  content: string;
  isFinal?: boolean;
  speaker?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionType {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionType, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionType, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionType, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionType, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionType;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

interface UseAudioTranscriptOptions {
  meetingId: string;
  onTranscript?: (transcript: TranscriptMessage) => void;
  onStatusChange?: (status: "idle" | "connecting" | "transcribing" | "error") => void;
}

export function useAudioTranscript({
  meetingId,
  onTranscript,
  onStatusChange,
}: UseAudioTranscriptOptions) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const shouldRestartRef = useRef(false);
  const pendingSyncRef = useRef<string[]>([]);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SpeechRecognitionAPI = 
    typeof window !== 'undefined' 
      ? window.SpeechRecognition || window.webkitSpeechRecognition 
      : null;

  const isSupported = Boolean(SpeechRecognitionAPI);

  const syncToServer = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    pendingSyncRef.current.push(text.trim());
    
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    syncTimeoutRef.current = setTimeout(async () => {
      const textsToSync = [...pendingSyncRef.current];
      pendingSyncRef.current = [];
      
      for (const t of textsToSync) {
        try {
          await fetch(`/api/meetings/${meetingId}/transcripts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ speaker: 'User', text: t, isFinal: true }),
          });
        } catch (err) {
          console.error('Failed to sync transcript:', err);
        }
      }
    }, 500);
  }, [meetingId]);

  const startTranscription = useCallback(async () => {
    if (!SpeechRecognitionAPI) {
      onStatusChange?.("error");
      return false;
    }

    if (!meetingId) {
      console.error("Cannot start transcription without a valid meeting ID");
      onStatusChange?.("error");
      return false;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    onStatusChange?.("connecting");
    shouldRestartRef.current = true;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsTranscribing(true);
      setIsConnected(true);
      onStatusChange?.("transcribing");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          onTranscript?.({
            type: "transcript",
            content: text.trim(),
            isFinal: true,
            speaker: "User",
          });
          
          syncToServer(text);
        } else {
          onTranscript?.({
            type: "transcript",
            content: text,
            isFinal: false,
            speaker: "User",
          });
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        onStatusChange?.("error");
        shouldRestartRef.current = false;
      }
    };

    recognition.onend = () => {
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
        }
      } else {
        setIsTranscribing(false);
        onStatusChange?.("idle");
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      return true;
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      onStatusChange?.("error");
      return false;
    }
  }, [SpeechRecognitionAPI, meetingId, onTranscript, onStatusChange, syncToServer]);

  const stopTranscription = useCallback(() => {
    shouldRestartRef.current = false;
    
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    
    setIsTranscribing(false);
    onStatusChange?.("idle");
  }, [onStatusChange]);

  useEffect(() => {
    if (isSupported) {
      setIsConnected(true);
      onStatusChange?.("idle");
    } else {
      setIsConnected(false);
      onStatusChange?.("error");
    }
  }, [isSupported, onStatusChange]);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    isTranscribing,
    startTranscription,
    stopTranscription,
  };
}
