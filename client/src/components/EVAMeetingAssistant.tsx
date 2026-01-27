import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Send, Bot, User, Mic, MicOff, Volume2, VolumeX, 
  Plus, Trash2, Check, X, FileText, List, Files, 
  MessageSquare, ClipboardList, Loader2, Play, Square,
  Upload, File as FileIcon, ChevronDown, Radio
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
import { useVoiceActivation } from "@/hooks/useVoiceActivation";
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
}

export function EVAMeetingAssistant({
  meetingId,
  meetingTitle,
  meetingStatus,
  className,
}: EVAMeetingAssistantProps) {
  const [activeTab, setActiveTab] = useState<"ask" | "notes" | "agenda" | "files" | "summary">("ask");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [newAgendaItem, setNewAgendaItem] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [wakeWordTriggered, setWakeWordTriggered] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();

  // Voice activation hook
  const handleVoiceSpeechResult = useCallback((text: string) => {
    if (text.trim()) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setIsTyping(true);
      askEvaMutationRef.current?.(text);
    }
  }, []);

  const askEvaMutationRef = useRef<((question: string) => void) | null>(null);

  const {
    isListening,
    isHoldingToTalk,
    transcript,
    isSupported: voiceSupported,
    startListening,
    stopListening,
    startHoldToTalk,
    stopHoldToTalk,
    wakeWordMode,
  } = useVoiceActivation({
    wakeWord: "hey eva",
    onWakeWordDetected: () => {
      setWakeWordTriggered(true);
      setTimeout(() => setWakeWordTriggered(false), 2000);
    },
    onSpeechResult: handleVoiceSpeechResult,
    enabled: wakeWordEnabled,
  });

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

  // Update agenda mutation
  const updateAgendaMutation = useMutation({
    mutationFn: async (items: AgendaItem[]) => {
      const res = await fetch(`/api/eva/meetings/${meetingId}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
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
        body: JSON.stringify({ meetingId, question }),
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

  // Start listening for wake word on mount
  useEffect(() => {
    if (wakeWordEnabled && voiceSupported) {
      startListening();
    }
    return () => stopListening();
  }, [wakeWordEnabled, voiceSupported, startListening, stopListening]);

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
    setInputValue("");
    setIsTyping(true);
    askEvaMutation.mutate(inputValue);
  };

  // Handle adding agenda item
  const handleAddAgendaItem = () => {
    if (!newAgendaItem.trim()) return;
    
    const currentItems = (agenda?.items || []) as AgendaItem[];
    const newItem: AgendaItem = {
      id: Date.now().toString(),
      title: newAgendaItem,
      covered: false,
      order: currentItems.length,
    };
    
    updateAgendaMutation.mutate([...currentItems, newItem]);
    setNewAgendaItem("");
  };

  // Toggle agenda item covered status
  const toggleAgendaCovered = (itemId: string) => {
    const currentItems = (agenda?.items || []) as AgendaItem[];
    const updatedItems = currentItems.map(item =>
      item.id === itemId ? { ...item, covered: !item.covered } : item
    );
    updateAgendaMutation.mutate(updatedItems);
  };

  // Delete agenda item
  const deleteAgendaItem = (itemId: string) => {
    const currentItems = (agenda?.items || []) as AgendaItem[];
    const updatedItems = currentItems.filter(item => item.id !== itemId);
    updateAgendaMutation.mutate(updatedItems);
  };

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
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const agendaItems = (agenda?.items || []) as AgendaItem[];
  const coveredCount = agendaItems.filter(i => i.covered).length;

  return (
    <div className={cn("flex flex-col h-full bg-background border-l", className)}>
      {/* Header */}
      <div className="p-3 border-b bg-gradient-to-r from-purple-600/10 to-blue-600/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">EVA Meeting Assistant</h3>
              <p className="text-xs text-muted-foreground">Hey EVA - ask me anything</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Wake word status indicator */}
            {isListening && (
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs px-2 transition-colors",
                  wakeWordTriggered ? "bg-green-500/20 text-green-500 border-green-500" : "bg-purple-500/10 text-purple-500"
                )}
              >
                <Radio className="w-3 h-3 mr-1 animate-pulse" />
                {wakeWordTriggered ? "Listening..." : "Say 'Hey EVA'"}
              </Badge>
            )}
            {/* Wake word toggle */}
            {voiceSupported && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (wakeWordEnabled) {
                    stopListening();
                    setWakeWordEnabled(false);
                  } else {
                    setWakeWordEnabled(true);
                    startListening();
                  }
                }}
                className={cn("h-8 w-8", wakeWordEnabled && isListening && "text-green-500")}
                data-testid="button-toggle-wakeword"
                title={wakeWordEnabled ? "Disable wake word" : "Enable wake word"}
              >
                {wakeWordEnabled && isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
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
                  <p className="text-sm text-muted-foreground mb-4">
                    Hi! I'm EVA, your meeting assistant. Ask me anything about this meeting.
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

          {/* Hold to talk indicator */}
          {isHoldingToTalk && (
            <div className="px-3 py-2 bg-green-500/10 border-t border-green-500/20">
              <div className="flex items-center gap-2 text-green-500">
                <Radio className="w-4 h-4 animate-pulse" />
                <span className="text-sm font-medium">Listening...</span>
                {transcript && <span className="text-sm opacity-70">"{transcript}"</span>}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask EVA..."
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                data-testid="input-ask-eva"
              />
              {/* Hold-to-talk button */}
              {voiceSupported && (
                <Button
                  variant={isHoldingToTalk ? "default" : "outline"}
                  onMouseDown={startHoldToTalk}
                  onMouseUp={stopHoldToTalk}
                  onMouseLeave={stopHoldToTalk}
                  onTouchStart={startHoldToTalk}
                  onTouchEnd={stopHoldToTalk}
                  className={cn(
                    "transition-colors",
                    isHoldingToTalk && "bg-green-500 hover:bg-green-600"
                  )}
                  data-testid="button-hold-to-talk"
                  title="Hold to talk"
                >
                  <Mic className="w-4 h-4" />
                </Button>
              )}
              <Button 
                onClick={handleSend} 
                disabled={!inputValue.trim() || isTyping}
                data-testid="button-send-eva"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
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
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <p className="text-sm">{note.content}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {note.speaker && (
                              <Badge variant="outline" className="text-xs">
                                {note.speaker}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(note.createdAt), "HH:mm")}
                            </span>
                            {note.isImportant && (
                              <Badge className="bg-amber-500/20 text-amber-600 text-xs">
                                Important
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
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
          <div className="p-3 border-t space-y-2">
            <Textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Add a note..."
              className="min-h-[60px] text-sm"
              data-testid="input-new-note"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleCreateNote(false)}
                disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                className="flex-1"
                data-testid="button-add-note"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Note
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCreateNote(true)}
                disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                className="text-amber-600"
                data-testid="button-add-important-note"
              >
                ⭐ Important
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Agenda Tab */}
        <TabsContent value="agenda" className="flex-1 flex flex-col overflow-hidden m-0">
          {/* Progress bar */}
          {agendaItems.length > 0 && (
            <div className="px-3 pt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{coveredCount}/{agendaItems.length} covered</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
                  style={{ width: `${agendaItems.length ? (coveredCount / agendaItems.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {agendaLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : agendaItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No agenda items yet.</p>
                  <p className="text-xs mt-1">Add topics to discuss in this meeting.</p>
                </div>
              ) : (
                agendaItems.map((item, index) => (
                  <Card key={item.id} className={cn(item.covered && "bg-muted/50")}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={item.covered}
                          onCheckedChange={() => toggleAgendaCovered(item.id)}
                          data-testid={`checkbox-agenda-${item.id}`}
                        />
                        <span className={cn(
                          "flex-1 text-sm",
                          item.covered && "line-through text-muted-foreground"
                        )}>
                          {index + 1}. {item.title}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteAgendaItem(item.id)}
                          data-testid={`button-delete-agenda-${item.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Add agenda item */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                value={newAgendaItem}
                onChange={(e) => setNewAgendaItem(e.target.value)}
                placeholder="Add agenda item..."
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleAddAgendaItem()}
                data-testid="input-new-agenda"
              />
              <Button
                onClick={handleAddAgendaItem}
                disabled={!newAgendaItem.trim() || updateAgendaMutation.isPending}
                data-testid="button-add-agenda"
              >
                <Plus className="w-4 h-4" />
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
                  <p className="text-sm">No documents uploaded.</p>
                  <p className="text-xs mt-1">Upload PDF, DOCX, TXT files for EVA to reference.</p>
                </div>
              ) : (
                files.map((file) => (
                  <Card key={file.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <FileIcon className="w-8 h-8 text-blue-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {(parseInt(file.size) / 1024).toFixed(1)} KB • {format(new Date(file.uploadedAt), "MMM d, HH:mm")}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {file.mimeType.split("/")[1]?.toUpperCase() || "FILE"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Upload button */}
          <div className="p-3 border-t">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".txt,.pdf,.docx,.pptx,.md,.csv,.json"
                className="hidden"
                onChange={handleFileUpload}
                data-testid="input-file-upload"
              />
              <Button variant="outline" className="w-full" asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
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
                  <p className="text-sm">Summary will be available after the meeting ends.</p>
                </div>
              ) : summaryLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : summary ? (
                <div className="space-y-4">
                  {summary.purpose && (
                    <div>
                      <h4 className="font-medium text-sm mb-1">Purpose</h4>
                      <p className="text-sm text-muted-foreground">{summary.purpose}</p>
                    </div>
                  )}

                  {summary.keyTopics && summary.keyTopics.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">Key Topics</h4>
                      <ul className="space-y-1">
                        {summary.keyTopics.map((topic, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <Check className="w-4 h-4 text-green-500 mt-0.5" />
                            {topic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.decisions && summary.decisions.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">Decisions Made</h4>
                      <ul className="space-y-1">
                        {summary.decisions.map((decision, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-purple-500">→</span>
                            {decision}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.openQuestions && summary.openQuestions.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">Open Questions</h4>
                      <ul className="space-y-1">
                        {summary.openQuestions.map((question, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-amber-500">?</span>
                            {question}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.fullSummary && (
                    <div>
                      <h4 className="font-medium text-sm mb-1">Full Summary</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summary.fullSummary}</p>
                    </div>
                  )}

                  {/* Play summary button */}
                  {voiceEnabled && summary.fullSummary && (
                    <Button
                      variant="outline"
                      onClick={() => playVoiceResponse(summary.fullSummary || "")}
                      disabled={isPlaying}
                      className="w-full"
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
                          Listen to Summary
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No summary generated yet.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
