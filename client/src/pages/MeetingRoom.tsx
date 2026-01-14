import { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { JitsiMeeting } from "@/components/JitsiMeeting";
import { AIChatPanel } from "@/components/AIChatPanel";
import { SOPDocument } from "@/components/SOPDocument";
import { SOPFlowchart } from "@/components/SOPFlowchart";
import { MessageSquare, Video, Mic, MonitorUp, ChevronLeft, FileText, GitGraph, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEvaLive } from "@/hooks/useEvaLive";
import type { ChatMessage } from "@shared/schema";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  context?: string;
}

export default function MeetingRoom() {
  const [, params] = useRoute("/meeting/:id");
  const roomId = params?.id || "demo-room";
  const queryClient = useQueryClient();
  
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isSOPOpen, setIsSOPOpen] = useState(false);
  const [isFlowchartOpen, setIsFlowchartOpen] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [jitsiApi, setJitsiApi] = useState<any>(null);
  const [evaStatus, setEvaStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [sopContent, setSopContent] = useState(`# Project Kickoff SOP

## 1. Meeting Objective
- Define core goals for Q3
- Assign roles and responsibilities

## 2. Attendees
- Project Manager
- Design Lead
- Lead Developer
`);
  const [isSopUpdating, setIsSopUpdating] = useState(false);

  // Load meeting data
  const { data: meeting } = useQuery({
    queryKey: ["meeting", roomId],
    queryFn: () => api.getMeetingByRoomId(roomId),
  });

  // Load chat messages
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["messages", meeting?.id],
    queryFn: () => api.getChatMessages(meeting!.id),
    enabled: !!meeting?.id,
    refetchInterval: 3000, // Refresh every 3 seconds for live updates
  });

  // EVA Live connection for real-time screen analysis
  const handleEvaMessage = useCallback((message: { type: string; content: string }) => {
    if (message.type === "text" && message.content && meeting?.id) {
      // Save AI message to database
      api.createChatMessage(meeting.id, {
        role: "ai",
        content: message.content,
        context: "Screen Analysis",
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["messages", meeting.id] });
      });
    }
  }, [meeting?.id, queryClient]);

  const handleSopUpdate = useCallback((content: string) => {
    setSopContent(prev => prev + "\n" + content);
  }, []);

  const {
    isConnected: evaConnected,
    isObserving,
    startObserving,
    stopObserving,
    startScreenCapture,
    stopScreenCapture,
    sendTextMessage,
  } = useEvaLive({
    meetingId: meeting?.id || "",
    onMessage: handleEvaMessage,
    onSopUpdate: handleSopUpdate,
    onStatusChange: setEvaStatus,
  });

  // Convert database messages to UI format
  const messages: Message[] = chatMessages.map(msg => ({
    id: msg.id,
    role: msg.role as "user" | "ai",
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    context: msg.context || undefined,
  }));

  // Add welcome message if no messages exist
  const displayMessages = messages.length === 0 ? [{
    id: "welcome",
    role: "ai" as const,
    content: "Hello! I'm EVA, your AI SOP assistant. I can observe your screen share and help document processes in real-time. Click the eye icon to start screen analysis.",
    timestamp: new Date(),
  }] : messages;

  // Mutation to save chat messages
  const saveChatMessage = useMutation({
    mutationFn: (data: { role: string; content: string; context?: string }) =>
      api.createChatMessage(meeting!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", meeting?.id] });
    },
  });

  const handleJitsiApiReady = (api: any) => {
    setJitsiApi(api);
    
    // Listen for screen sharing events
    api.addEventListeners({
      screenSharingStatusChanged: async (payload: { on: boolean }) => {
        setIsScreenSharing(payload.on);
        
        if (payload.on) {
          addSystemMessage("Screen sharing started. EVA is now analyzing the visual content.");
          
          // Start EVA observation when screen sharing starts
          if (evaConnected && isObserving) {
            // Request screen capture directly from browser
            // Note: This will prompt user to select screen again, but ensures we get the stream
            try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { frameRate: 1 } 
              });
              startScreenCapture(stream);
              addSystemMessage("EVA is now observing your shared screen.");
            } catch (e) {
              console.log("Could not start screen capture for EVA:", e);
              addSystemMessage("Could not access screen for EVA observation. Please enable EVA observation manually.");
            }
          }
        } else {
          addSystemMessage("Screen sharing ended.");
          stopScreenCapture();
        }
      },
      videoConferenceLeft: () => {
        stopObserving();
        stopScreenCapture();
      }
    });
  };

  const addSystemMessage = (content: string) => {
    if (!meeting?.id) return;
    saveChatMessage.mutate({
      role: "ai",
      content,
      context: "System Event",
    });
  };

  const handleSendMessage = async (content: string) => {
    if (!meeting?.id) return;

    // Get AI response from backend (which also saves messages)
    try {
      setIsSopUpdating(true);
      const response = await api.sendAIChat(meeting.id, content, isScreenSharing);
      
      // Refresh messages after AI response
      queryClient.invalidateQueries({ queryKey: ["messages", meeting.id] });
      
      if (response.sopUpdate && !sopContent.includes(response.sopUpdate.trim())) {
          setSopContent(prev => prev + "\n" + response.sopUpdate);
      }
      setIsSopUpdating(false);
    } catch (error) {
      console.error("Failed to get AI response", error);
      setIsSopUpdating(false);
    }
  };

  const toggleEvaObservation = async () => {
    if (isObserving) {
      stopObserving();
      stopScreenCapture();
      addSystemMessage("EVA stopped observing the screen.");
    } else {
      startObserving();
      
      // If already screen sharing, prompt for screen capture
      if (isScreenSharing) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: { frameRate: 1 } 
          });
          startScreenCapture(stream);
          addSystemMessage("EVA is now observing your shared screen in real-time.");
        } catch (e) {
          console.log("Could not start screen capture:", e);
          addSystemMessage("EVA is ready to observe. Please share your screen to enable real-time analysis.");
        }
      } else {
        addSystemMessage("EVA is ready to observe. Share your screen to enable real-time analysis.");
      }
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative">
        {/* Top Bar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-background z-10">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="mr-2 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">Meeting</h1>
              <p className="text-xs text-muted-foreground">{roomId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             {/* EVA Status Indicator */}
             <div className={`bg-card/50 border px-3 py-1.5 rounded-full flex items-center gap-2 ${
               evaConnected ? 'border-green-500/50' : 'border-border'
             }`}>
                <span className={`w-2 h-2 rounded-full ${
                  evaStatus === "connected" ? "bg-green-500 animate-pulse" :
                  evaStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
                  "bg-gray-500"
                }`} />
                <span className="text-xs font-medium text-muted-foreground">
                  EVA {evaStatus === "connected" ? (isObserving ? "Observing" : "Ready") : evaStatus}
                </span>
             </div>
             <div className="bg-card/50 border border-border px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-muted-foreground">00:12:45</span>
             </div>
          </div>
        </header>

        {/* Video Area */}
        <div className="flex-1 p-4 relative flex gap-4 overflow-hidden">
          <div className={`flex-1 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300`}>
             <JitsiMeeting 
               roomName={`VideoAI-${roomId}`}
               displayName="User"
               onApiReady={handleJitsiApiReady}
               className="bg-zinc-900"
             />
          </div>

          {/* Right Panel - AI Chat */}
          <div 
            className={`
              transition-all duration-500 ease-in-out transform origin-right
              ${isChatOpen ? 'w-[350px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden hidden'}
              rounded-2xl overflow-hidden shadow-xl border border-border
            `}
          >
            <AIChatPanel 
              messages={displayMessages} 
              onSendMessage={handleSendMessage}
              isScreenSharing={isScreenSharing}
              className="h-full"
            />
          </div>

          {/* SOP Document */}
          <div 
            className={`
              transition-all duration-500 ease-in-out transform origin-right
              ${isSOPOpen ? 'w-[400px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden hidden'}
              rounded-2xl overflow-hidden shadow-xl border border-border
            `}
          >
            <SOPDocument 
                content={sopContent}
                isUpdating={isSopUpdating}
                className="h-full"
            />
          </div>

          {/* SOP Flowchart */}
          <div 
            className={`
              transition-all duration-500 ease-in-out transform origin-right
              ${isFlowchartOpen ? 'w-[400px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden hidden'}
              rounded-2xl overflow-hidden shadow-xl border border-border
            `}
          >
            <SOPFlowchart 
                sopContent={sopContent}
                className="h-full"
            />
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="h-20 flex items-center justify-center gap-4 px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border/50">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-12 w-12 rounded-full border-2 border-border bg-card hover:bg-muted">
                    <Mic className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mute</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-12 w-12 rounded-full border-2 border-border bg-card hover:bg-muted">
                    <Video className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stop Video</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isScreenSharing ? "default" : "outline"}
                    size="icon" 
                    className={`h-12 w-12 rounded-full border-2 ${isScreenSharing ? 'bg-green-600 border-green-600 hover:bg-green-700' : 'border-border bg-card hover:bg-muted'}`}
                    onClick={() => {
                        if (jitsiApi) {
                            jitsiApi.executeCommand('toggleShareScreen');
                        }
                    }}
                  >
                    <MonitorUp className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share Screen</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="w-px h-8 bg-border mx-2" />

            {/* EVA Observation Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isObserving ? "default" : "outline"} 
                    size="icon" 
                    className={`h-12 w-12 rounded-full border-2 ${isObserving ? 'bg-purple-600 border-purple-600 hover:bg-purple-700' : 'border-border bg-card hover:bg-muted'}`}
                    onClick={toggleEvaObservation}
                    disabled={!evaConnected}
                  >
                    {isObserving ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isObserving ? "Stop EVA Observation" : "Start EVA Observation"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isChatOpen ? "default" : "outline"} 
                    size="icon" 
                    className={`h-12 w-12 rounded-full border-2 ${isChatOpen ? 'bg-primary border-primary hover:bg-primary/90' : 'border-border bg-card hover:bg-muted'}`}
                    onClick={() => setIsChatOpen(!isChatOpen)}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle EVA SOP Assistant</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isSOPOpen ? "default" : "outline"} 
                    size="icon" 
                    className={`h-12 w-12 rounded-full border-2 ${isSOPOpen ? 'bg-secondary border-secondary hover:bg-secondary/90' : 'border-border bg-card hover:bg-muted'}`}
                    onClick={() => setIsSOPOpen(!isSOPOpen)}
                  >
                    <FileText className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle SOP Document</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isFlowchartOpen ? "default" : "outline"} 
                    size="icon" 
                    className={`h-12 w-12 rounded-full border-2 ${isFlowchartOpen ? 'bg-orange-500 border-orange-500 hover:bg-orange-600 text-white' : 'border-border bg-card hover:bg-muted'}`}
                    onClick={() => setIsFlowchartOpen(!isFlowchartOpen)}
                  >
                    <GitGraph className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle SOP Flowchart</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <Button variant="destructive" size="icon" className="h-12 w-16 rounded-full ml-4">
              <span className="sr-only">End Call</span>
              <div className="w-4 h-4 bg-white rounded-sm" />
            </Button>
        </div>
      </main>
    </div>
  );
}
