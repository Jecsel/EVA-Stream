import { useState, useRef, useCallback, useEffect } from "react";

interface UseElevenLabsAudioOptions {
  wakeWord?: string;
  wakeWordVariants?: string[];
  onWakeWordDetected?: () => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onCommand?: (command: string) => void;
  enabled?: boolean;
}

const DEFAULT_WAKE_WORD_VARIANTS = [
  "hey eva",
  "hey ava",
  "hi eva",
  "hi ava",
  "eva",
  "ava",
];

const SILENCE_THRESHOLD_MS = 4000; // Increased to give user more time to formulate their question
const RECORDING_INTERVAL_MS = 2000;

// Audio events that should not reset the silence timer or be added to command buffer
const NOISE_TRANSCRIPTS = [
  '[typing]', '[clicking]', '[mouse clicking]', '[keyboard clicking]', '[keyboard clacking]',
  '[silence]', '[pause]', '[background noise]', '[noise]', '[music]', '[música]',
  '[sound effect]', '[beep]', '[phone notification]', '[door closing]', '[sound of chair]',
  '[sound of object being moved]', '[clears throat]', '[cough]', '[coughing]'
];

const isNoiseTranscript = (text: string): boolean => {
  const lowerText = text.toLowerCase().trim();
  return NOISE_TRANSCRIPTS.some(noise => lowerText === noise.toLowerCase());
};

export function useElevenLabsAudio({
  wakeWord = "hey eva",
  wakeWordVariants = DEFAULT_WAKE_WORD_VARIANTS,
  onWakeWordDetected,
  onTranscript,
  onCommand,
  enabled = true,
}: UseElevenLabsAudioOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);
  const commandBufferRef = useRef<string[]>([]);
  const lastTranscriptTimeRef = useRef(0);
  const silenceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const sendCommand = useCallback(() => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    
    const fullCommand = commandBufferRef.current.join(" ").trim();
    console.log("[ElevenLabs Audio] Sending command:", fullCommand);
    
    if (fullCommand.length >= 3) {
      onCommand?.(fullCommand);
    }
    
    commandBufferRef.current = [];
    isActiveRef.current = false;
    setIsActive(false);
  }, [onCommand]);

  const mimeTypeRef = useRef<string>('audio/webm');

  const processAudioChunk = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;
    
    const mimeType = mimeTypeRef.current;
    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
    audioChunksRef.current = [];
    
    if (audioBlob.size < 1000) return;
    
    setIsProcessing(true);
    
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      const response = await fetch('/api/eva/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio, mimeType }),
      });
      
      if (response.ok) {
        const result = await response.json();
        const text = result.text?.trim();
        
        if (text) {
          console.log("[ElevenLabs Audio] Transcript:", text);
          setLastTranscript(text);
          onTranscript?.(text, true);
          
          const wakeWordMatch = findWakeWord(text);
          
          if (wakeWordMatch.found && !isActiveRef.current) {
            console.log("[ElevenLabs Audio] Wake word detected!");
            onWakeWordDetected?.();
            
            const commandPart = text.slice(wakeWordMatch.index + wakeWordMatch.length).trim();
            isActiveRef.current = true;
            setIsActive(true);
            // Don't add noise as initial command
            commandBufferRef.current = (commandPart && !isNoiseTranscript(commandPart)) ? [commandPart] : [];
            lastTranscriptTimeRef.current = Date.now();
            
            silenceCheckIntervalRef.current = setInterval(() => {
              const silenceDuration = Date.now() - lastTranscriptTimeRef.current;
              if (silenceDuration >= SILENCE_THRESHOLD_MS && isActiveRef.current) {
                sendCommand();
              }
            }, 500);
          } else if (isActiveRef.current && text) {
            // Only add real speech to command buffer and reset silence timer
            if (!isNoiseTranscript(text)) {
              lastTranscriptTimeRef.current = Date.now();
              commandBufferRef.current.push(text);
            }
            // Note: noise transcripts don't reset the silence timer, allowing natural timeout
          }
        }
      }
    } catch (error) {
      console.error("[ElevenLabs Audio] STT error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [findWakeWord, onWakeWordDetected, onTranscript, sendCommand]);

  const startListening = useCallback(async () => {
    if (isListening || !enabled) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      streamRef.current = stream;
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      mimeTypeRef.current = mimeType;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        processAudioChunk();
      };
      
      mediaRecorder.start();
      setIsListening(true);
      
      recordingIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, RECORDING_INTERVAL_MS);
      
      console.log("[ElevenLabs Audio] Started listening");
    } catch (error) {
      console.error("[ElevenLabs Audio] Failed to start:", error);
    }
  }, [enabled, isListening, processAudioChunk]);

  const stopListening = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    audioChunksRef.current = [];
    isActiveRef.current = false;
    setIsActive(false);
    setIsListening(false);
    
    console.log("[ElevenLabs Audio] Stopped listening");
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  useEffect(() => {
    if (enabled && !isListening) {
      startListening();
    } else if (!enabled && isListening) {
      stopListening();
    }
  }, [enabled, isListening, startListening, stopListening]);

  return {
    isListening,
    isActive,
    isProcessing,
    lastTranscript,
    startListening,
    stopListening,
  };
}
