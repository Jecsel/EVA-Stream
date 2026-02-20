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
  chunkIntervalMs?: number;
}

const CHUNK_INTERVAL = 15000;

export function useAudioTranscript({
  meetingId,
  onTranscript,
  onStatusChange,
  chunkIntervalMs = CHUNK_INTERVAL,
}: UseAudioTranscriptOptions) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shouldContinueRef = useRef(false);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const queueRef = useRef<Blob[]>([]);
  const isProcessingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    while (queueRef.current.length > 0) {
      const audioBlob = queueRef.current.shift()!;
      if (audioBlob.size < 1000) continue;

      try {
        const base64Audio = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.readAsDataURL(audioBlob);
        });

        const response = await fetch("/api/transcribe/whisper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64Audio }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.text && data.text.trim()) {
            onTranscriptRef.current?.({
              type: "transcript",
              content: data.text.trim(),
              isFinal: true,
              speaker: "User",
            });
          }
        }
      } catch (error) {
        console.error("Whisper transcription error:", error);
      }
    }

    isProcessingRef.current = false;
  }, []);

  const enqueueChunks = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    queueRef.current.push(audioBlob);
    processQueue();
  }, [processQueue]);

  const startTranscription = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsTranscribing(true);
        setIsConnected(true);
        onStatusChange?.("transcribing");
      };

      mediaRecorder.onstop = () => {
        enqueueChunks();
      };

      mediaRecorderRef.current = mediaRecorder;
      shouldContinueRef.current = true;
      chunksRef.current = [];
      queueRef.current = [];

      mediaRecorder.start(500);

      chunkTimerRef.current = setInterval(() => {
        if (shouldContinueRef.current && mediaRecorderRef.current?.state === "recording") {
          enqueueChunks();
        }
      }, chunkIntervalMs);

      return true;
    } catch (error) {
      console.error("Microphone permission denied:", error);
      onStatusChange?.("error");
      onTranscript?.({
        type: "error",
        content: "Microphone access denied. Please allow microphone access to use transcription.",
      });
      return false;
    }
  }, [onTranscript, onStatusChange, chunkIntervalMs, enqueueChunks]);

  const stopTranscription = useCallback(() => {
    shouldContinueRef.current = false;

    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.log("MediaRecorder stop error:", e);
      }
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
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
