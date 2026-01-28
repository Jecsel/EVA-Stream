import { useState, useRef, useCallback, useEffect } from "react";

interface UseElevenLabsAgentOptions {
  onUserTranscript?: (text: string) => void;
  onAgentResponse?: (text: string) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

interface AgentMessage {
  type: string;
  transcript?: string;
  response?: string;
  audio?: string;
  conversation_id?: string;
  agent_id?: string;
  agent_output_audio_format?: string;
}

export function useElevenLabsAgent({
  onUserTranscript,
  onAgentResponse,
  onError,
  enabled = true,
}: UseElevenLabsAgentOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const getSignedUrl = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/elevenlabs/signed-url');
      if (!response.ok) {
        throw new Error('Failed to get signed URL');
      }
      const data = await response.json();
      return data.signedUrl;
    } catch (error) {
      console.error('[ElevenLabs Agent] Error getting signed URL:', error);
      onError?.('Failed to connect to voice agent');
      return null;
    }
  }, [onError]);

  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    
    isPlayingRef.current = true;
    setIsSpeaking(true);

    while (audioQueueRef.current.length > 0) {
      const pcmData = audioQueueRef.current.shift();
      if (!pcmData || !audioContextRef.current) break;

      try {
        // Convert PCM 16-bit little-endian to Float32 for Web Audio API
        const int16Array = new Int16Array(pcmData);
        const float32Array = new Float32Array(int16Array.length);
        
        for (let i = 0; i < int16Array.length; i++) {
          // Convert int16 (-32768 to 32767) to float (-1.0 to 1.0)
          float32Array[i] = int16Array[i] / 32768;
        }
        
        // Create AudioBuffer from Float32 PCM data
        const audioBuffer = audioContextRef.current.createBuffer(
          1, // mono
          float32Array.length,
          16000 // sample rate from ElevenLabs
        );
        audioBuffer.getChannelData(0).set(float32Array);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        sourceNodeRef.current = source;
        
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
          source.start();
        });
      } catch (error) {
        console.error('[ElevenLabs Agent] Audio playback error:', error);
      }
    }

    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      sourceNodeRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const connect = useCallback(async () => {
    // Prevent duplicate connections - check for OPEN or CONNECTING states
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const signedUrl = await getSignedUrl();
    if (!signedUrl) return;

    console.log('[ElevenLabs Agent] Connecting...');
    
    const ws = new WebSocket(signedUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ElevenLabs Agent] Connected');
      setIsConnected(true);
      
      // Initialize audio context for playback
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle different message types from ElevenLabs Conversational AI
        // API uses nested event objects like: {type: "agent_response", agent_response_event: {...}}
        const msgType = message.type;
        
        switch (msgType) {
          case 'conversation_initiation_metadata':
            // Extract conversation_id from nested event object
            const convId = message.conversation_initiation_metadata_event?.conversation_id;
            console.log('[ElevenLabs Agent] Conversation initialized:', convId);
            setConversationId(convId || null);
            break;

          case 'user_transcript':
            // Extract user transcript from nested event object
            const userText = message.user_transcription_event?.user_transcript;
            console.log('[ElevenLabs Agent] User said:', userText);
            if (userText) {
              onUserTranscript?.(userText);
            }
            break;

          case 'agent_response':
            // Extract agent response from nested event object
            const agentText = message.agent_response_event?.agent_response;
            console.log('[ElevenLabs Agent] Agent response:', agentText);
            if (agentText) {
              onAgentResponse?.(agentText);
            }
            break;

          case 'audio':
            // Extract audio from nested event object - uses audio_base_64
            const audioData = message.audio_event?.audio_base_64;
            if (audioData) {
              // Decode base64 PCM audio and queue for playback
              const binaryString = atob(audioData);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              audioQueueRef.current.push(bytes.buffer);
              playAudioQueue();
            }
            break;

          case 'interruption':
            console.log('[ElevenLabs Agent] User interrupted');
            stopAudio();
            break;

          case 'ping':
            // Respond to keep-alive pings with matching event_id
            const eventId = message.ping_event?.event_id;
            console.log('[ElevenLabs Agent] Received ping, responding with pong');
            ws.send(JSON.stringify({ 
              type: 'pong', 
              event_id: eventId 
            }));
            break;

          case 'error':
            console.error('[ElevenLabs Agent] Server error:', message.error || message.message);
            onError?.(message.error || message.message || 'Unknown error');
            break;

          default:
            // Log unhandled message types for debugging
            console.log('[ElevenLabs Agent] Unhandled message type:', msgType, message);
        }
      } catch (error) {
        console.error('[ElevenLabs Agent] Message parse error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[ElevenLabs Agent] WebSocket error:', error);
      onError?.('Voice agent connection error');
    };

    ws.onclose = () => {
      console.log('[ElevenLabs Agent] Disconnected');
      setIsConnected(false);
      setConversationId(null);
    };
  }, [getSignedUrl, onUserTranscript, onAgentResponse, onError, playAudioQueue, stopAudio]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopAudio();
    setIsConnected(false);
    setConversationId(null);
  }, [stopAudio]);

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }

    if (isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      mediaStreamRef.current = stream;
      
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert float32 to int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const bytes = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);
        
        // Send to ElevenLabs - use user_audio field as expected by the API
        wsRef.current.send(JSON.stringify({
          user_audio_chunk: base64Audio,
        }));
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      processorRef.current = processor;

      setIsListening(true);
      console.log('[ElevenLabs Agent] Started listening');
    } catch (error) {
      console.error('[ElevenLabs Agent] Microphone error:', error);
      onError?.('Failed to access microphone');
    }
  }, [connect, isListening, onError]);

  const stopListening = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setIsListening(false);
    console.log('[ElevenLabs Agent] Stopped listening');
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[ElevenLabs Agent] Not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'user_message',
      message: text,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      stopListening();
    };
  }, [disconnect, stopListening]);

  return {
    isConnected,
    isListening,
    isSpeaking,
    conversationId,
    connect,
    disconnect,
    startListening,
    stopListening,
    stopAudio,
    sendTextMessage,
  };
}
