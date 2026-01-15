import { useState, useEffect, useCallback, useRef } from 'react';

interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  speaker: string;
}

interface UseRealtimeSpeechOptions {
  onFinalTranscript?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  language?: string;
  continuous?: boolean;
}

interface UseRealtimeSpeechReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  segments: TranscriptSegment[];
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  clearTranscript: () => void;
  error: string | null;
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

export function useRealtimeSpeech(options: UseRealtimeSpeechOptions = {}): UseRealtimeSpeechReturn {
  const {
    onFinalTranscript,
    onInterimTranscript,
    language = 'en-US',
    continuous = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const segmentIdRef = useRef(0);

  const SpeechRecognitionAPI = 
    typeof window !== 'undefined' 
      ? window.SpeechRecognition || window.webkitSpeechRecognition 
      : null;

  const isSupported = Boolean(SpeechRecognitionAPI);

  const generateSegmentId = useCallback(() => {
    segmentIdRef.current += 1;
    return `segment-${Date.now()}-${segmentIdRef.current}`;
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition is not supported in this browser');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          final += text;
          
          const newSegment: TranscriptSegment = {
            id: generateSegmentId(),
            text: text.trim(),
            isFinal: true,
            timestamp: Date.now(),
            speaker: 'User',
          };
          
          setSegments(prev => [...prev, newSegment]);
          setTranscript(prev => (prev + ' ' + text).trim());
          
          if (onFinalTranscript) {
            onFinalTranscript(text.trim());
          }
        } else {
          interim += text;
        }
      }

      setInterimTranscript(interim);
      
      if (onInterimTranscript && interim) {
        onInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        return;
      }
      if (event.error === 'aborted') {
        return;
      }
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      
      if (continuous && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
        }
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      setError('Failed to start speech recognition');
    }
  }, [SpeechRecognitionAPI, continuous, language, onFinalTranscript, onInterimTranscript, generateSegmentId]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.continuous = false;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setSegments([]);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    segments,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
    error,
  };
}
