import { useCallback, useRef, useState, useEffect } from "react";

interface TranscriptEntry {
  id: string;
  text: string;
  speaker: string;
  timestamp: Date;
  isFinal: boolean;
}

interface UseJitsiTranscriptionOptions {
  onWakeWord?: (command: string) => void;
  onTranscript?: (transcript: TranscriptEntry) => void;
  wakeWord?: string;
  wakeWordVariants?: string[];
}

const DEFAULT_WAKE_WORD_VARIANTS = [
  "hey eva",
  "hey ava", 
  "hi eva",
  "hi ava",
  "hey eva,",
  "hey ava,",
  "eva,",
  "ava,",
];

const SILENCE_THRESHOLD_MS = 2000;
const MAX_COMMAND_WAIT_MS = 10000;
const MIN_COMMAND_LENGTH = 3;

export function useJitsiTranscription({
  onWakeWord,
  onTranscript,
  wakeWord = "hey eva",
  wakeWordVariants = DEFAULT_WAKE_WORD_VARIANTS,
}: UseJitsiTranscriptionOptions = {}) {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  
  const lastWakeWordTimeRef = useRef<number>(0);
  const lastTranscriptTimeRef = useRef<number>(0);
  const transcriptBufferRef = useRef<string>("");
  const currentInterimRef = useRef<string>("");
  const silenceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allWakeWords = [wakeWord.toLowerCase(), ...wakeWordVariants.map(w => w.toLowerCase())];

  const findWakeWord = useCallback((text: string): { found: boolean; index: number; length: number } => {
    const lowerText = text.toLowerCase();
    
    for (const variant of allWakeWords) {
      const index = lowerText.indexOf(variant);
      if (index !== -1) {
        return { found: true, index, length: variant.length };
      }
    }
    return { found: false, index: -1, length: 0 };
  }, [allWakeWords]);

  const cleanup = useCallback(() => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    if (maxWaitTimeoutRef.current) {
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = null;
    }
  }, []);

  const sendCommand = useCallback(() => {
    cleanup();
    
    const fullCommand = (transcriptBufferRef.current + " " + currentInterimRef.current).trim();
    
    if (fullCommand.length >= MIN_COMMAND_LENGTH) {
      console.log("[EVA Wake] Sending command:", fullCommand);
      onWakeWord?.(fullCommand);
    } else {
      console.log("[EVA Wake] Command too short, ignoring:", fullCommand);
    }
    
    transcriptBufferRef.current = "";
    currentInterimRef.current = "";
    setIsActive(false);
    setIsListening(false);
  }, [onWakeWord, cleanup]);

  const startListening = useCallback(() => {
    cleanup();
    
    setIsActive(true);
    setIsListening(true);
    lastWakeWordTimeRef.current = Date.now();
    lastTranscriptTimeRef.current = Date.now();
    
    silenceCheckIntervalRef.current = setInterval(() => {
      const silenceDuration = Date.now() - lastTranscriptTimeRef.current;
      if (silenceDuration >= SILENCE_THRESHOLD_MS && isActive) {
        console.log("[EVA Wake] Silence detected after", silenceDuration, "ms");
        sendCommand();
      }
    }, 500);
    
    maxWaitTimeoutRef.current = setTimeout(() => {
      console.log("[EVA Wake] Max wait time reached");
      sendCommand();
    }, MAX_COMMAND_WAIT_MS);
  }, [cleanup, sendCommand, isActive]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const handleTranscription = useCallback(
    (text: string, participant: string, isFinal: boolean) => {
      if (!text || typeof text !== 'string') {
        return;
      }

      const now = Date.now();
      lastTranscriptTimeRef.current = now;

      const entry: TranscriptEntry = {
        id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
        text,
        speaker: participant,
        timestamp: new Date(),
        isFinal,
      };

      setTranscripts((prev) => {
        const updated = [...prev, entry].slice(-100);
        return updated;
      });

      onTranscript?.(entry);

      const wakeWordMatch = findWakeWord(text);

      if (wakeWordMatch.found && !isActive) {
        console.log("[EVA Wake] Wake word detected in:", text);
        
        const commandPart = text.slice(wakeWordMatch.index + wakeWordMatch.length).trim();
        transcriptBufferRef.current = "";
        currentInterimRef.current = commandPart;
        
        startListening();
        
        if (isFinal && commandPart.length >= MIN_COMMAND_LENGTH) {
          lastTranscriptTimeRef.current = now;
        }
      } else if (isActive && now - lastWakeWordTimeRef.current < MAX_COMMAND_WAIT_MS) {
        if (isFinal) {
          transcriptBufferRef.current += " " + currentInterimRef.current;
          transcriptBufferRef.current += " " + text;
          currentInterimRef.current = "";
          console.log("[EVA Wake] Final chunk buffered:", transcriptBufferRef.current.trim());
        } else {
          currentInterimRef.current = text;
          console.log("[EVA Wake] Interim chunk:", text);
        }
      }
    },
    [onWakeWord, onTranscript, findWakeWord, isActive, startListening]
  );

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  const cancelCommand = useCallback(() => {
    cleanup();
    transcriptBufferRef.current = "";
    currentInterimRef.current = "";
    setIsActive(false);
    setIsListening(false);
  }, [cleanup]);

  return {
    isActive,
    isListening,
    transcripts,
    handleTranscription,
    clearTranscripts,
    cancelCommand,
  };
}
