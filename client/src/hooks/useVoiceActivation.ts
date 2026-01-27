import { useState, useRef, useCallback, useEffect } from "react";

interface UseVoiceActivationOptions {
  wakeWord?: string;
  onWakeWordDetected?: () => void;
  onSpeechResult?: (text: string) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

const getSpeechRecognition = (): any => {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
};

export function useVoiceActivation({
  wakeWord = "hey eva",
  onWakeWordDetected,
  onSpeechResult,
  onError,
  enabled = true,
}: UseVoiceActivationOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isHoldingToTalk, setIsHoldingToTalk] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const wakeWordModeRef = useRef(true);
  const isHoldingRef = useRef(false);
  const holdToTalkTranscriptRef = useRef("");
  const speechResultHandledRef = useRef(false);
  
  const onWakeWordDetectedRef = useRef(onWakeWordDetected);
  const onSpeechResultRef = useRef(onSpeechResult);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onWakeWordDetectedRef.current = onWakeWordDetected;
    onSpeechResultRef.current = onSpeechResult;
    onErrorRef.current = onError;
  }, [onWakeWordDetected, onSpeechResult, onError]);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    setIsSupported(!!SpeechRecognition);
    
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const fullTranscript = finalTranscript || interimTranscript;
      setTranscript(fullTranscript);

      if (isHoldingRef.current) {
        holdToTalkTranscriptRef.current = fullTranscript;
        return;
      }

      if (wakeWordModeRef.current && finalTranscript) {
        const lowerTranscript = finalTranscript.toLowerCase().trim();
        if (lowerTranscript.includes(wakeWord.toLowerCase())) {
          wakeWordModeRef.current = false;
          onWakeWordDetectedRef.current?.();
          const commandAfterWake = lowerTranscript.split(wakeWord.toLowerCase()).pop()?.trim();
          if (commandAfterWake && commandAfterWake.length > 3) {
            onSpeechResultRef.current?.(commandAfterWake);
            wakeWordModeRef.current = true;
          }
        }
      } else if (!wakeWordModeRef.current && finalTranscript) {
        onSpeechResultRef.current?.(finalTranscript);
        wakeWordModeRef.current = true;
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
        onErrorRef.current?.(event.error);
      }
    };

    recognition.onend = () => {
      if (isActiveRef.current && enabled && !isHoldingRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.log("Recognition restart failed");
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isActiveRef.current = false;
      try {
        recognition.stop();
      } catch (e) {}
    };
  }, [wakeWord, enabled]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !enabled) return;
    
    try {
      isActiveRef.current = true;
      wakeWordModeRef.current = true;
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e: any) {
      if (e.name !== "InvalidStateError") {
        console.error("Failed to start recognition:", e);
      }
    }
  }, [enabled]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    
    isActiveRef.current = false;
    isHoldingRef.current = false;
    try {
      recognitionRef.current.stop();
    } catch (e) {}
    setIsListening(false);
    setIsHoldingToTalk(false);
  }, []);

  const startHoldToTalk = useCallback(() => {
    if (!recognitionRef.current || !enabled) return;
    
    try {
      recognitionRef.current.stop();
    } catch (e) {}
    
    isHoldingRef.current = true;
    isActiveRef.current = false;
    wakeWordModeRef.current = false;
    holdToTalkTranscriptRef.current = "";
    speechResultHandledRef.current = false;
    setIsHoldingToTalk(true);
    setTranscript("");
    
    setTimeout(() => {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e: any) {
        if (e.name !== "InvalidStateError") {
          console.error("Failed to start hold-to-talk:", e);
        }
      }
    }, 100);
  }, [enabled]);

  const stopHoldToTalk = useCallback(() => {
    if (!isHoldingRef.current) return;
    
    isHoldingRef.current = false;
    setIsHoldingToTalk(false);
    
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
    
    if (holdToTalkTranscriptRef.current && !speechResultHandledRef.current) {
      speechResultHandledRef.current = true;
      onSpeechResultRef.current?.(holdToTalkTranscriptRef.current);
    }
    
    holdToTalkTranscriptRef.current = "";
    setTranscript("");
    wakeWordModeRef.current = true;
    
    setTimeout(() => {
      if (enabled) {
        isActiveRef.current = true;
        try {
          recognitionRef.current?.start();
          setIsListening(true);
        } catch (e) {}
      }
    }, 200);
  }, [enabled]);

  return {
    isListening,
    isHoldingToTalk,
    transcript,
    isSupported,
    startListening,
    stopListening,
    startHoldToTalk,
    stopHoldToTalk,
    wakeWordMode: wakeWordModeRef.current,
  };
}
