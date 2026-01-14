import { useEffect, useRef, useState, useCallback } from "react";
import type { TranscriptSegment } from "@shared/schema";

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

export function useAudioTranscript({
  meetingId,
  onTranscript,
  onStatusChange,
}: UseAudioTranscriptOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    onStatusChange?.("connecting");
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/eva?meetingId=${meetingId}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      onStatusChange?.("idle");
    };

    ws.onmessage = (event) => {
      try {
        const message: TranscriptMessage = JSON.parse(event.data);
        
        if (message.type === "transcript") {
          onTranscript?.(message);
        }
      } catch (error) {
        console.error("Failed to parse transcript message:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsTranscribing(false);
      onStatusChange?.("idle");
    };

    ws.onerror = (error) => {
      console.error("Transcript WebSocket error:", error);
      onStatusChange?.("error");
    };
  }, [meetingId, onTranscript, onStatusChange]);

  const disconnect = useCallback(() => {
    stopTranscription();
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const startTranscription = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      streamRef.current = stream;

      wsRef.current.send(JSON.stringify({ 
        type: "control", 
        command: "start_transcription" 
      }));

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
          ? "audio/webm;codecs=opus" 
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            if (base64 && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: "audio_transcribe",
                data: base64,
                mimeType: "audio/webm",
              }));
            }
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorder.start();

      recordingIntervalRef.current = setInterval(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          mediaRecorder.start();
        }
      }, 3000);

      setIsTranscribing(true);
      onStatusChange?.("transcribing");
      return true;
    } catch (error) {
      console.error("Failed to start transcription:", error);
      onStatusChange?.("error");
      return false;
    }
  }, [onStatusChange]);

  const stopTranscription = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: "control", 
        command: "stop_transcription" 
      }));
    }

    setIsTranscribing(false);
    onStatusChange?.("idle");
  }, [onStatusChange]);

  useEffect(() => {
    if (meetingId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [meetingId, connect, disconnect]);

  return {
    isConnected,
    isTranscribing,
    startTranscription,
    stopTranscription,
  };
}
