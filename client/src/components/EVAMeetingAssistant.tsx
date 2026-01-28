import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Send, Bot, User, Volume2, VolumeX, Mic, MicOff,
  Plus, Trash2, Check, X, FileText, List, Files, 
  MessageSquare, ClipboardList, Loader2, Play, Square,
  Upload, File as FileIcon, ChevronDown, Radio, Phone, PhoneOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useElevenLabsAudio } from "@/hooks/useElevenLabsAudio";
import { useElevenLabsAgent } from "@/hooks/useElevenLabsAgent";
import type { MeetingNote, MeetingFile, MeetingSummary } from "@shared/schema";

interface AgendaItem {
  id: string;
  title: string;
  covered: boolean;
  order: number;
}

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

interface EVAMeetingAssistantProps {
  meetingId: string;
  meetingTitle?: string;
  meetingStatus?: string;
  className?: string;
  onRequestScreenObserver?: () => void;
  currentSopContent?: string;
}

export function EVAMeetingAssistant({
  meetingId,
  meetingTitle,
  meetingStatus,
  className,
  onRequestScreenObserver,
  currentSopContent,
}: EVAMeetingAssistantProps) {
  const [activeTab, setActiveTab] = useState<"ask" | "notes" | "agenda" | "files" | "summary">("ask");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [agendaContent, setAgendaContent] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [wakeWordTriggered, setWakeWordTriggered] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [useConversationalAgent, setUseConversationalAgent] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const pushToTalkMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const pushToTalkChunksRef = useRef<Blob[]>([]);
  const pushToTalkStartingRef = useRef(false);
  const pushToTalkStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const askEvaMutationRef = useRef<((question: string) => void) | null>(null);
  const queryClient = useQueryClient();

  // Check if user is asking about screen sharing (for voice commands)
  const checkScreenShareRequest = useCallback((text: string): boolean => {
    const lowerText = text.toLowerCase();
    const screenSharePatterns = [
      'share screen', 'screen share', 'share my screen', 'share the screen',
      'screen sharing', 'trigger.screen_share', 'start screen', 'observe screen',
      'screen observer', 'show my screen', 'share what i see', 'watch my screen',
      'see my screen', 'view my screen', 'look at my screen'
    ];
    return screenSharePatterns.some(pattern => lowerText.includes(pattern));
  }, []);

  // Handle voice command result
  const handleVoiceSpeechResult = useCallback((text: string) => {
    if (text.trim()) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Check if this is a screen share request
      if (checkScreenShareRequest(text)) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: "I'll switch you to the Screen Observer! Click 'Start Observing' to share your screen, and I'll help document what you're showing.",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // Trigger the screen observer panel
        if (onRequestScreenObserver) {
          onRequestScreenObserver();
        }
        return;
      }
      
      setIsTyping(true);
      askEvaMutationRef.current?.(text);
    }
  }, [checkScreenShareRequest, onRequestScreenObserver]);

  // Track wakeup call state to prevent rapid repeated triggers
  const wakeupInFlightRef = useRef(false);
  const lastWakeupTimeRef = useRef(0);
  const WAKEUP_DEBOUNCE_MS = 3000;

  // Play wakeup call greeting using ElevenLabs TTS
  const playWakeupCall = useCallback(async () => {
    const now = Date.now();
    
    // Debounce: skip if called too recently or already in flight
    if (wakeupInFlightRef.current || now - lastWakeupTimeRef.current < WAKEUP_DEBOUNCE_MS) {
      return;
    }
    
    wakeupInFlightRef.current = true;
    lastWakeupTimeRef.current = now;
    
    const greetings = [
      "Yes, I'm listening!",
      "I'm here!",
      "How can I help?",
      "Yes?",
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    try {
      const response = await fetch("/api/eva/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: greeting }),
      });
      
      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Stop any currently playing audio first
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        
        setIsPlaying(true);
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
          wakeupInFlightRef.current = false;
        };
        audioRef.current.onerror = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
          wakeupInFlightRef.current = false;
        };
        audioRef.current.play();
      } else {
        wakeupInFlightRef.current = false;
      }
    } catch (error) {
      console.error("Failed to play wakeup call:", error);
      wakeupInFlightRef.current = false;
    }
  }, []);

  // ElevenLabs-based audio transcription and wake word detection (legacy mode)
  const {
    isListening: isLegacyListening,
    isProcessing,
    startListening: startLegacyListening,
    stopListening: stopLegacyListening,
  } = useElevenLabsAudio({
    wakeWord: "hey eva",
    onWakeWordDetected: () => {
      console.log("[EVA] Wake word detected via ElevenLabs!");
      setWakeWordTriggered(true);
      setTimeout(() => setWakeWordTriggered(false), 2000);
      
      // Play ElevenLabs TTS wakeup call
      if (voiceEnabled) {
        playWakeupCall();
      }
    },
    onCommand: handleVoiceSpeechResult,
    enabled: wakeWordEnabled && !useConversationalAgent,
  });

  // ElevenLabs Conversational AI Agent (new mode - handles listening + responding)
  const {
    isConnected: isAgentConnected,
    isListening: isAgentListening,
    isSpeaking: isAgentSpeaking,
    connect: connectAgent,
    disconnect: disconnectAgent,
    startListening: startAgentListening,
    stopListening: stopAgentListening,
    stopAudio: stopAgentAudio,
  } = useElevenLabsAgent({
    onUserTranscript: (text) => {
      console.log("[EVA Agent] User said:", text);
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Check if this is a screen share request
      if (checkScreenShareRequest(text)) {
        if (onRequestScreenObserver) {
          onRequestScreenObserver();
        }
      }
    },
    onAgentResponse: (text) => {
      console.log("[EVA Agent] Response:", text);
      const aiMessage: Message = {
        id: Date.now().toString(),
        role: "ai",
        content: text,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
    },
    onError: (error) => {
      console.error("[EVA Agent] Error:", error);
    },
    enabled: useConversationalAgent,
  });

  // Unified listening state
  const isListening = useConversationalAgent ? isAgentListening : isLegacyListening;
  const startListening = useConversationalAgent ? startAgentListening : startLegacyListening;
  const stopListening = useConversationalAgent ? stopAgentListening : stopLegacyListening;

  // Fetch agenda
  const { data: agenda, isLoading: agendaLoading } = useQuery({
    queryKey: ["eva-agenda", meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/eva/meetings/${meetingId}/agenda`);
      return res.json();
    },
  });

  // Fetch notes
  const { data: notes = [], isLoading: notesLoading } = useQuery<MeetingNote[]>({
    queryKey: ["eva-notes", meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/eva/meetings/${meetingId}/notes`);
      return res.json();
    },
  });

  // Fetch files
  const { data: files = [], isLoading: filesLoading } = useQuery<MeetingFile[]>({
    queryKey: ["eva-files", meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/eva/meetings/${meetingId}/files`);
      return res.json();
    },
  });

  // Fetch summary
  const { data: summary, isLoading: summaryLoading } = useQuery<MeetingSummary | null>({
    queryKey: ["eva-summary", meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/eva/meetings/${meetingId}/summary`);
      const data = await res.json();
      return data;
    },
    enabled: meetingStatus === "completed",
  });

  // Update agenda mutation (now saves rich text HTML)
  const updateAgendaMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/eva/meetings/${meetingId}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eva-agenda", meetingId] });
    },
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (data: { content: string; speaker?: string; isImportant?: boolean }) => {
      const res = await fetch(`/api/eva/meetings/${meetingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eva-notes", meetingId] });
      setNewNoteContent("");
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const res = await fetch(`/api/eva/notes/${noteId}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eva-notes", meetingId] });
    },
  });

  // Ask EVA mutation
  const askEvaMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch("/api/eva/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          meetingId, 
          question,
          sopContent: currentSopContent,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to get response from EVA");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      const aiMessage: Message = {
        id: Date.now().toString(),
        role: "ai",
        content: data.response || "I couldn't generate a response. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);

      // Play voice response if enabled
      if (voiceEnabled && data.response) {
        playVoiceResponse(data.response);
      }
    },
    onError: (error) => {
      console.error("EVA error:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "ai",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsTyping(false);
    },
  });

  // Set the ref for voice activation to use
  useEffect(() => {
    askEvaMutationRef.current = (question: string) => {
      askEvaMutation.mutate(question);
    };
  }, [askEvaMutation]);

  // Play voice response using ElevenLabs
  const playVoiceResponse = async (text: string) => {
    try {
      setIsPlaying(true);
      const response = await fetch("/api/eva/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.substring(0, 500) }), // Limit text length
      });
      
      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        if (audioRef.current) {
          audioRef.current.pause();
        }
        
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => setIsPlaying(false);
        audioRef.current.play();
      }
    } catch (error) {
      console.error("Failed to play voice response:", error);
    } finally {
      setIsPlaying(false);
    }
  };

  const stopVoice = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  // Push-to-talk: Toggle recording on/off with a single click
  const togglePushToTalk = useCallback(async () => {
    // If already recording, stop it
    if (isPushToTalkActive) {
      // Clear starting ref to prevent race conditions
      pushToTalkStartingRef.current = false;
      
      if (pushToTalkMediaRecorderRef.current && pushToTalkMediaRecorderRef.current.state === 'recording') {
        pushToTalkMediaRecorderRef.current.stop();
      }
      setIsPushToTalkActive(false);
      return;
    }
    
    // Guard against re-entry (prevent multiple concurrent recordings)
    if (pushToTalkStartingRef.current || 
        (pushToTalkMediaRecorderRef.current && pushToTalkMediaRecorderRef.current.state === 'recording')) {
      return;
    }
    
    pushToTalkStartingRef.current = true;
    
    try {
      // Stop wake word listening temporarily to avoid conflicts
      if (wakeWordEnabled && isListening) {
        stopListening();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pushToTalkStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      pushToTalkChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          pushToTalkChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Stop all tracks to release microphone
        if (pushToTalkStreamRef.current) {
          pushToTalkStreamRef.current.getTracks().forEach(track => track.stop());
          pushToTalkStreamRef.current = null;
        }
        
        // Create audio blob and send for transcription
        const audioBlob = new Blob(pushToTalkChunksRef.current, { type: 'audio/webm' });
        
        if (audioBlob.size > 0) {
          // Convert to base64 and send for transcription
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            
            try {
              const response = await fetch('/api/eva/stt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: base64Audio, mimeType: 'audio/webm' }),
              });
              
              if (response.ok) {
                const data = await response.json();
                if (data.text && data.text.trim() && data.text !== '[music]') {
                  // Send the transcribed text to EVA
                  const userMessage: Message = {
                    id: Date.now().toString(),
                    role: "user",
                    content: data.text,
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, userMessage]);
                  
                  // Check if this is a screen share request (same as voice/text handlers)
                  const lowerText = data.text.toLowerCase();
                  const screenSharePatterns = [
                    'share screen', 'screen share', 'share my screen', 'share the screen',
                    'screen sharing', 'trigger.screen_share', 'start screen', 'observe screen',
                    'screen observer', 'show my screen', 'share what i see', 'watch my screen',
                    'see my screen', 'view my screen', 'look at my screen'
                  ];
                  const isScreenShareReq = screenSharePatterns.some(pattern => lowerText.includes(pattern));
                  
                  if (isScreenShareReq && onRequestScreenObserver) {
                    const aiMessage: Message = {
                      id: (Date.now() + 1).toString(),
                      role: "ai",
                      content: "I'll switch you to the Screen Observer! Click 'Start Observing' to share your screen, and I'll help document what you're showing.",
                      timestamp: new Date(),
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    onRequestScreenObserver();
                  } else {
                    setIsTyping(true);
                    askEvaMutationRef.current?.(data.text);
                  }
                }
              }
            } catch (error) {
              console.error("Transcription failed:", error);
            }
          };
          reader.readAsDataURL(audioBlob);
        }
        
        // Resume wake word listening if it was enabled
        if (wakeWordEnabled) {
          startListening();
        }
        
        pushToTalkMediaRecorderRef.current = null;
      };
      
      pushToTalkMediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsPushToTalkActive(true);
      pushToTalkStartingRef.current = false;
    } catch (error) {
      console.error("Failed to start push-to-talk:", error);
      pushToTalkStartingRef.current = false;
      // Resume wake word listening if it was enabled
      if (wakeWordEnabled) {
        startListening();
      }
    }
  }, [isPushToTalkActive, wakeWordEnabled, isListening, stopListening, startListening, onRequestScreenObserver]);

  // Handle sending message to EVA
  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Check if this is a screen share request
    if (checkScreenShareRequest(inputValue)) {
      // Add a helpful response and trigger screen observer
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: "I'll switch you to the Screen Observer! Click 'Start Observing' to share your screen, and I'll help document what you're showing.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setInputValue("");
      
      // Trigger the screen observer panel
      if (onRequestScreenObserver) {
        onRequestScreenObserver();
      }
      return;
    }
    
    setInputValue("");
    setIsTyping(true);
    askEvaMutation.mutate(inputValue);
  };

  // Handle agenda content change
  const handleAgendaChange = useCallback((content: string) => {
    setAgendaContent(content);
  }, []);

  // Save agenda content (called on blur for auto-save)
  const handleSaveAgenda = useCallback(() => {
    const trimmedContent = agendaContent.trim();
    if (trimmedContent && trimmedContent !== '<p></p>') {
      updateAgendaMutation.mutate(agendaContent);
    }
  }, [agendaContent, updateAgendaMutation]);

  // Sync agenda content from fetched data
  useEffect(() => {
    if (agenda?.content && typeof agenda.content === 'string') {
      setAgendaContent(agenda.content);
    }
  }, [agenda]);

  // Handle note creation
  const handleCreateNote = (isImportant: boolean = false) => {
    if (!newNoteContent.trim()) return;
    createNoteMutation.mutate({
      content: newNoteContent,
      isImportant,
    });
  };

  // File upload handler - uses base64 encoding for binary files (PDF, DOCX)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const base64Content = dataUrl.split(',')[1] || '';
      
      try {
        const res = await fetch(`/api/eva/meetings/${meetingId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: `${Date.now()}-${file.name}`,
            originalName: file.name,
            mimeType: file.type,
            size: file.size.toString(),
            content: base64Content,
            encoding: 'base64',
          }),
        });
        
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["eva-files", meetingId] });
        } else {
          console.error("File upload failed:", await res.text());
        }
      } catch (error) {
        console.error("Failed to upload file:", error);
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  
  return (
    <div className={cn("flex flex-col h-full bg-background border-l", className)}>
      {/* Header */}
      <div className="p-3 border-b bg-gradient-to-r from-purple-600/10 to-blue-600/10">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold text-sm">EVA Meeting Assistant</h3>
              <p className="text-xs text-muted-foreground">Hey EVA - ask me anything</p>
              {/* Voice status badges on third line */}
              <div className="flex items-center gap-1 flex-wrap">
                {/* Wake word status - ElevenLabs STT */}
                {!useConversationalAgent && isListening && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs px-2 transition-colors",
                      wakeWordTriggered 
                        ? "bg-green-500/20 text-green-500 border-green-500" 
                        : isProcessing
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-purple-500/10 text-purple-500"
                    )}
                  >
                    <Radio className={cn("w-3 h-3 mr-1", (wakeWordTriggered || isProcessing) && "animate-pulse")} />
                    {wakeWordTriggered ? "Listening..." : isProcessing ? "Processing..." : "Say 'Hey EVA'"}
                  </Badge>
                )}
                {/* Conversational Agent Status Badge */}
                {useConversationalAgent && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-normal",
                      isAgentListening
                        ? isAgentSpeaking
                          ? "bg-purple-500/10 text-purple-500"
                          : "bg-green-500/10 text-green-500"
                        : isAgentConnected
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-gray-500/10 text-gray-500"
                    )}
                  >
                    <Phone className={cn("w-3 h-3 mr-1", isAgentListening && "animate-pulse")} />
                    {isAgentSpeaking ? "EVA Speaking..." : isAgentListening ? "Listening..." : isAgentConnected ? "Connected" : "Click to talk"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Voice Agent Toggle - Call EVA */}
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                if (useConversationalAgent) {
                  if (isAgentListening) {
                    stopAgentListening();
                    disconnectAgent();
                  } else {
                    await connectAgent();
                    await startAgentListening();
                  }
                } else {
                  if (wakeWordEnabled) {
                    stopListening();
                    setWakeWordEnabled(false);
                  } else {
                    setWakeWordEnabled(true);
                    startListening();
                  }
                }
              }}
              className={cn(
                "h-8 w-8",
                useConversationalAgent 
                  ? isAgentConnected && isAgentListening 
                    ? "text-green-500 animate-pulse" 
                    : isAgentConnected 
                      ? "text-green-400"
                      : ""
                  : wakeWordEnabled && isListening && "text-green-500"
              )}
              data-testid="button-toggle-voice-agent"
              title={
                useConversationalAgent 
                  ? isAgentListening 
                    ? "End conversation with EVA" 
                    : "Start conversation with EVA"
                  : wakeWordEnabled 
                    ? "Disable wake word" 
                    : "Enable wake word"
              }
            >
              {useConversationalAgent ? (
                isAgentConnected && isAgentListening ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />
              ) : (
                wakeWordEnabled && isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />
              )}
            </Button>
            {/* Speaking indicator */}
            {isAgentSpeaking && (
              <Button
                variant="ghost"
                size="icon"
                onClick={stopAgentAudio}
                className="h-8 w-8 text-purple-500 animate-pulse"
                data-testid="button-stop-agent-audio"
                title="Stop EVA speaking"
              >
                <Volume2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={cn("h-8 w-8", voiceEnabled && "text-purple-500")}
              data-testid="button-toggle-voice"
              title={voiceEnabled ? "Disable voice responses" : "Enable voice responses"}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            {isPlaying && (
              <Button
                variant="ghost"
                size="icon"
                onClick={stopVoice}
                className="h-8 w-8 text-red-500"
                data-testid="button-stop-voice"
              >
                <Square className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="grid w-full grid-cols-5 h-10 rounded-none border-b">
          <TabsTrigger value="ask" className="text-xs" data-testid="tab-ask-eva">
            <MessageSquare className="w-3 h-3 mr-1" />
            Ask
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs" data-testid="tab-notes">
            <FileText className="w-3 h-3 mr-1" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="agenda" className="text-xs" data-testid="tab-agenda">
            <List className="w-3 h-3 mr-1" />
            Agenda
          </TabsTrigger>
          <TabsTrigger value="files" className="text-xs" data-testid="tab-files">
            <Files className="w-3 h-3 mr-1" />
            Files
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-xs" data-testid="tab-summary">
            <ClipboardList className="w-3 h-3 mr-1" />
            Summary
          </TabsTrigger>
        </TabsList>

        {/* Ask EVA Tab */}
        <TabsContent value="ask" className="flex-1 flex flex-col overflow-hidden m-0">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {/* Welcome message */}
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <Bot className="w-12 h-12 mx-auto mb-3 text-purple-500/50" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Hi! I'm EVA, your meeting assistant.
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    {useConversationalAgent 
                      ? "Click the phone button above to start a voice conversation with me!"
                      : "Just say \"Hey EVA\" followed by your question - I'm always listening!"}
                  </p>
                  <div className="space-y-2">
                    {[
                      "What's this meeting about?",
                      "Did we miss anything from the agenda?",
                      "What decisions were made?",
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setInputValue(suggestion);
                        }}
                        data-testid={`suggestion-${suggestion.substring(0, 20)}`}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-2",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "ai" && (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {message.role === "ai" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {/* Input with push-to-talk button */}
          <div className="p-3 border-t">
            <div className="flex gap-2 items-center">
              {/* Push-to-talk button - click to start, click again to stop */}
              <Button
                variant={isPushToTalkActive ? "default" : "outline"}
                size="icon"
                className={cn(
                  "flex-shrink-0 transition-all duration-200",
                  isPushToTalkActive && "bg-red-500 hover:bg-red-600 animate-pulse"
                )}
                onClick={togglePushToTalk}
                disabled={isTyping}
                data-testid="button-push-to-talk"
                title={isPushToTalkActive ? "Click to stop recording" : "Click to start speaking to EVA"}
              >
                <Mic className={cn("w-4 h-4", isPushToTalkActive && "text-white")} />
              </Button>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isPushToTalkActive ? "Listening..." : "Ask EVA..."}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={isPushToTalkActive}
                data-testid="input-ask-eva"
              />
              <Button 
                onClick={handleSend} 
                disabled={!inputValue.trim() || isTyping || isPushToTalkActive}
                data-testid="button-send-eva"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {isPushToTalkActive && (
              <p className="text-xs text-center text-muted-foreground mt-2 animate-pulse">
                Recording... Click the mic button again when done.
              </p>
            )}
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="flex-1 flex flex-col overflow-hidden m-0">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {notesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notes yet. Add notes during the meeting.</p>
                  <p className="text-xs mt-1">Say "Hey EVA, take note of this"</p>
                </div>
              ) : (
                notes.map((note) => (
                  <Card key={note.id} className={cn(note.isImportant && "border-amber-500/50")}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm">{note.content}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {note.speaker && (
                              <span className="text-xs text-muted-foreground">
                                {note.speaker}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(note.createdAt), "h:mm a")}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteNoteMutation.mutate(note.id)}
                          data-testid={`button-delete-note-${note.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
          
          {/* Add note input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Add a note..."
                className="min-h-[60px] text-sm"
                data-testid="input-new-note"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => handleCreateNote(false)}
                disabled={!newNoteContent.trim()}
                data-testid="button-add-note"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Note
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-amber-500 border-amber-500/50"
                onClick={() => handleCreateNote(true)}
                disabled={!newNoteContent.trim()}
                data-testid="button-add-important-note"
              >
                <Plus className="w-3 h-3 mr-1" />
                Important
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Agenda Tab - Rich Text Editor */}
        <TabsContent value="agenda" className="flex-1 flex flex-col overflow-hidden m-0">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 flex-1 overflow-hidden">
              <RichTextEditor
                content={agendaContent}
                onChange={handleAgendaChange}
                onBlur={handleSaveAgenda}
                placeholder="Add meeting agenda items..."
                className="h-full"
              />
            </div>
            <div className="px-3 pb-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {updateAgendaMutation.isPending ? "Saving..." : "Auto-saves on blur"}
              </span>
              <Button
                size="sm"
                onClick={handleSaveAgenda}
                disabled={updateAgendaMutation.isPending}
                data-testid="button-save-agenda"
              >
                {updateAgendaMutation.isPending ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Check className="w-3 h-3 mr-1" />
                )}
                Save
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="flex-1 flex flex-col overflow-hidden m-0">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {filesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Files className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No files uploaded yet.</p>
                  <p className="text-xs mt-1">Upload documents for EVA to analyze</p>
                </div>
              ) : (
                files.map((file) => (
                  <Card key={file.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(file.uploadedAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
          
          {/* File upload */}
          <div className="p-3 border-t">
            <label className="block">
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.txt,.md"
                data-testid="input-file-upload"
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={isUploading}
                asChild
              >
                <span>
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Upload Document
                </span>
              </Button>
            </label>
          </div>
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary" className="flex-1 flex flex-col overflow-hidden m-0">
          <ScrollArea className="flex-1">
            <div className="p-3">
              {meetingStatus !== "completed" ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Meeting summary will be available after the meeting ends.</p>
                </div>
              ) : summaryLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : summary ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Summary</h4>
                    <div className="prose prose-sm dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {summary.fullSummary || summary.purpose || "No summary available."}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {summary.decisions && summary.decisions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Decisions & Action Items</h4>
                      <ul className="space-y-1">
                        {summary.decisions.map((item: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <Checkbox className="mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summary.keyTopics && summary.keyTopics.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Key Topics</h4>
                      <div className="flex flex-wrap gap-1">
                        {summary.keyTopics.map((topic: string, idx: number) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No summary available yet.</p>
                </div>
              )}
            </div>
          </ScrollArea>
          
          {/* Voice playback for summary */}
          {(summary?.fullSummary || summary?.purpose) && (
            <div className="p-3 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => playVoiceResponse(summary.fullSummary || summary.purpose || "")}
                disabled={isPlaying}
                data-testid="button-play-summary"
              >
                {isPlaying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Playing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Play Summary
                  </>
                )}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
