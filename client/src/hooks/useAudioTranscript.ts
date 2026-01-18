import { useEffect, useRef, useState, useCallback } from "react";

interface TranscriptMessage {
  type: "transcript" | "status" | "error";
  content: string;
  isFinal?: boolean;
  speaker?: string;
}

interface UseAudioTranscriptOptions {
  meetingId: string;
  onTranscript?: (transcript: TranscriptMessage) => void;
  onStatusChange?: (status: "idle" | "connecting" | "transcribing" | "error") => void;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventMap {
  result: CustomSpeechRecognitionEvent;
  error: CustomSpeechRecognitionErrorEvent;
  start: Event;
  end: Event;
}

interface CustomSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface CustomSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface CustomSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: CustomSpeechRecognitionEvent) => void) | null;
  onerror: ((event: CustomSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => CustomSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useAudioTranscript({
  meetingId,
  onTranscript,
  onStatusChange,
}: UseAudioTranscriptOptions) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const recognitionRef = useRef<CustomSpeechRecognition | null>(null);
  const shouldRestartRef = useRef(false);

  const getSpeechRecognition = useCallback((): CustomSpeechRecognition | null => {
    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      console.error("Speech Recognition not supported in this browser");
      return null;
    }
    return new SpeechRecognitionConstructor();
  }, []);

  const startTranscription = useCallback(async () => {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      onStatusChange?.("error");
      onTranscript?.({
        type: "error",
        content: "Speech recognition is not supported in this browser. Please use Chrome or Edge.",
      });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.error("Microphone permission denied:", error);
      onStatusChange?.("error");
      onTranscript?.({
        type: "error",
        content: "Microphone access denied. Please allow microphone access to use transcription.",
      });
      return false;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsTranscribing(true);
      setIsConnected(true);
      onStatusChange?.("transcribing");
    };

    recognition.onresult = (event: CustomSpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        
        if (transcript) {
          onTranscript?.({
            type: "transcript",
            content: transcript,
            isFinal: result.isFinal,
            speaker: "User",
          });
        }
      }
    };

    recognition.onerror = (event: CustomSpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        onStatusChange?.("error");
        onTranscript?.({
          type: "error",
          content: "Microphone access denied. Please allow microphone access.",
        });
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        onStatusChange?.("error");
      }
    };

    recognition.onend = () => {
      if (shouldRestartRef.current && recognitionRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.log("Recognition restart failed:", e);
          setIsTranscribing(false);
          onStatusChange?.("idle");
        }
      } else {
        setIsTranscribing(false);
        onStatusChange?.("idle");
      }
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;

    try {
      recognition.start();
      return true;
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
      onStatusChange?.("error");
      return false;
    }
  }, [getSpeechRecognition, onTranscript, onStatusChange]);

  const stopTranscription = useCallback(() => {
    shouldRestartRef.current = false;
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log("Recognition stop error:", e);
      }
      recognitionRef.current = null;
    }

    setIsTranscribing(false);
    onStatusChange?.("idle");
  }, [onStatusChange]);

  useEffect(() => {
    if (meetingId) {
      setIsConnected(true);
      onStatusChange?.("idle");
    }
    return () => {
      stopTranscription();
    };
  }, [meetingId, stopTranscription, onStatusChange]);

  return {
    isConnected,
    isTranscribing,
    startTranscription,
    stopTranscription,
  };
}
