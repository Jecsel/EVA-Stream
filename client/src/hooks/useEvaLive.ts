import { useEffect, useRef, useState, useCallback } from "react";

interface EvaLiveMessage {
  type: "text" | "audio" | "sop_update" | "sop_status" | "cro_update" | "cro_status" | "error" | "status";
  content: string;
  audioData?: string;
  observationCount?: number;
  sopVersion?: number;
  flowchartCode?: string;
  croContent?: string;
  croVersion?: number;
}

interface UseEvaLiveOptions {
  meetingId: string;
  onMessage?: (message: EvaLiveMessage) => void;
  onSopUpdate?: (content: string, observationCount?: number, sopVersion?: number, flowchartCode?: string) => void;
  onSopStatus?: (observationCount: number, sopVersion: number) => void;
  onCroUpdate?: (content: string, croVersion?: number) => void;
  onCroStatus?: (croVersion: number) => void;
  onStatusChange?: (status: "connected" | "disconnected" | "connecting") => void;
}

export function useEvaLive({
  meetingId,
  onMessage,
  onSopUpdate,
  onSopStatus,
  onCroUpdate,
  onCroStatus,
  onStatusChange,
}: UseEvaLiveOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isObserving, setIsObserving] = useState(false);
  const observingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const connect = useCallback(() => {
    console.log(`[EVA] connect() called, current state: ${wsRef.current?.readyState}`);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(`[EVA] Already connected, skipping`);
      return;
    }

    onStatusChange?.("connecting");
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/eva?meetingId=${meetingId}`;
    console.log(`[EVA] Connecting to: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      onStatusChange?.("connected");
      console.log("EVA Live connected");
    };

    ws.onmessage = (event) => {
      try {
        const message: EvaLiveMessage = JSON.parse(event.data);
        
        if (message.type === "sop_update") {
          onSopUpdate?.(message.content, message.observationCount, message.sopVersion, message.flowchartCode);
          // Also check for CRO content in combined updates
          if (message.croContent) {
            onCroUpdate?.(message.croContent, message.croVersion);
          }
        } else if (message.type === "sop_status") {
          onSopStatus?.(message.observationCount || 0, message.sopVersion || 0);
        } else if (message.type === "cro_update") {
          onCroUpdate?.(message.croContent || message.content, message.croVersion);
        } else if (message.type === "cro_status") {
          onCroStatus?.(message.croVersion || 0);
        }
        
        onMessage?.(message);
      } catch (error) {
        console.error("Failed to parse EVA message:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsObserving(false);
      onStatusChange?.("disconnected");
      
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (meetingId) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error("EVA WebSocket error:", error);
    };
  }, [meetingId, onMessage, onSopUpdate, onSopStatus, onCroUpdate, onCroStatus, onStatusChange]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setIsObserving(false);
  }, []);

  const sendMessage = useCallback((type: string, data?: string, mimeType?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data, mimeType }));
    }
  }, []);

  const startObserving = useCallback(() => {
    sendMessage("control", undefined, undefined);
    wsRef.current?.send(JSON.stringify({ type: "control", command: "start" }));
    observingRef.current = true;
    setIsObserving(true);
  }, [sendMessage]);

  const stopObserving = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "control", command: "stop" }));
    observingRef.current = false;
    setIsObserving(false);
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
  }, []);

  // Capture and send screen frames
  const startScreenCapture = useCallback(async (stream: MediaStream) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    
    if (!videoRef.current) {
      videoRef.current = document.createElement("video");
      videoRef.current.autoplay = true;
      videoRef.current.muted = true;
    }

    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");

    // Clear any existing interval
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }

    // Capture frame every 10 seconds to avoid repetitive responses
    frameIntervalRef.current = setInterval(() => {
      if (!ctx || !video.videoWidth) return;
      
      // Scale down for bandwidth efficiency
      const scale = 0.5;
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64 JPEG
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const base64Data = dataUrl.split(",")[1];
      
      // Use ref to check observing state (avoids stale closure)
      if (wsRef.current?.readyState === WebSocket.OPEN && observingRef.current) {
        console.log("Sending screen frame to EVA...");
        wsRef.current.send(JSON.stringify({
          type: "video",
          data: base64Data,
          mimeType: "image/jpeg",
        }));
      }
    }, 10000);
  }, []);

  const stopScreenCapture = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "text",
        data: text,
      }));
    }
  }, []);

  const sendTranscript = useCallback((text: string, speaker: string, enableSop: boolean, enableCro: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && text.trim().length > 2) {
      wsRef.current.send(JSON.stringify({
        type: "transcript",
        data: text,
        speaker,
        enableSop,
        enableCro,
      }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    console.log(`[EVA] useEffect triggered - meetingId: "${meetingId}"`);
    if (meetingId) {
      console.log(`[EVA] Attempting to connect for meeting: ${meetingId}`);
      connect();
    } else {
      console.log(`[EVA] No meetingId, skipping connection`);
    }
    return () => {
      disconnect();
    };
  }, [meetingId, connect, disconnect]);

  return {
    isConnected,
    isObserving,
    startObserving,
    stopObserving,
    startScreenCapture,
    stopScreenCapture,
    sendTextMessage,
    sendTranscript,
    disconnect,
  };
}
