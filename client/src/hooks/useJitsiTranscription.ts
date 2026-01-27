import { useCallback, useRef, useState } from "react";

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
}

export function useJitsiTranscription({
  onWakeWord,
  onTranscript,
  wakeWord = "hey eva",
}: UseJitsiTranscriptionOptions = {}) {
  const [isActive, setIsActive] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [lastWakeWordTime, setLastWakeWordTime] = useState<number>(0);
  const transcriptBufferRef = useRef<string>("");
  const commandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTranscription = useCallback(
    (text: string, participant: string, isFinal: boolean) => {
      const entry: TranscriptEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

      const lowerText = text.toLowerCase();
      const wakeWordLower = wakeWord.toLowerCase();

      if (lowerText.includes(wakeWordLower)) {
        setIsActive(true);
        setLastWakeWordTime(Date.now());

        const wakeWordIndex = lowerText.indexOf(wakeWordLower);
        const commandPart = text.slice(wakeWordIndex + wakeWord.length).trim();

        if (commandTimeoutRef.current) {
          clearTimeout(commandTimeoutRef.current);
        }

        transcriptBufferRef.current = commandPart;

        if (isFinal && commandPart.length > 0) {
          onWakeWord?.(commandPart);
          transcriptBufferRef.current = "";
          setIsActive(false);
        } else {
          commandTimeoutRef.current = setTimeout(() => {
            if (transcriptBufferRef.current.length > 0) {
              onWakeWord?.(transcriptBufferRef.current);
              transcriptBufferRef.current = "";
            }
            setIsActive(false);
          }, 3000);
        }
      } else if (isActive && Date.now() - lastWakeWordTime < 5000) {
        transcriptBufferRef.current += " " + text;

        if (commandTimeoutRef.current) {
          clearTimeout(commandTimeoutRef.current);
        }

        if (isFinal) {
          commandTimeoutRef.current = setTimeout(() => {
            if (transcriptBufferRef.current.length > 0) {
              onWakeWord?.(transcriptBufferRef.current.trim());
              transcriptBufferRef.current = "";
            }
            setIsActive(false);
          }, 1500);
        }
      }
    },
    [onWakeWord, onTranscript, wakeWord, isActive, lastWakeWordTime]
  );

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return {
    isActive,
    transcripts,
    handleTranscription,
    clearTranscripts,
  };
}
