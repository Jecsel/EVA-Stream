import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { JitsiMeeting } from "@/components/JitsiMeeting";
import { AIChatPanel } from "@/components/AIChatPanel";
import { SOPFlowchart } from "@/components/SOPFlowchart";
import { simulateGeminiAnalysis } from "@/lib/gemini";
import { MessageSquare, Video, Mic, MonitorUp, ChevronLeft, FileText, GitGraph } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isSOPOpen, setIsSOPOpen] = useState(false);
  const [isFlowchartOpen, setIsFlowchartOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content: "Hello! I'm your Gemini meeting assistant. I'm ready to transcribe, analyze shared screens, and answer questions about the meeting context.",
      timestamp: new Date(),
    }
  ]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [jitsiApi, setJitsiApi] = useState<any>(null);
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

  // Simulate random screen sharing events if we don't have real hooks from Jitsi yet
  useEffect(() => {
    const interval = setInterval(() => {
      // In a real app, this would be driven by Jitsi events
      // For demo, we toggle it occasionally or keep it off until user "starts" it (simulated)
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleJitsiApiReady = (api: any) => {
    setJitsiApi(api);
    
    // Listen for screen sharing events
    api.addEventListeners({
      screenSharingStatusChanged: (payload: { on: boolean }) => {
        setIsScreenSharing(payload.on);
        if (payload.on) {
          addSystemMessage("Screen sharing started. I'm now analyzing the visual content.");
        } else {
          addSystemMessage("Screen sharing ended.");
        }
      },
      videoConferenceLeft: () => {
        // Handle leaving
      }
    });
  };

  const addSystemMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "ai",
      content,
      timestamp: new Date(),
      context: "System Event"
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = async (content: string) => {
    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Get AI response
    try {
      setIsSopUpdating(true);
      const response = await simulateGeminiAnalysis(content, isScreenSharing);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: response.message,
        timestamp: new Date(),
        context: isScreenSharing ? "Screen Analysis" : undefined
      };
      setMessages(prev => [...prev, aiMsg]);
      
      if (response.sopUpdate && !sopContent.includes(response.sopUpdate.trim())) {
          // Simulate appending new content to SOP
          setTimeout(() => {
            setSopContent(prev => prev + "\n" + response.sopUpdate);
            setIsSopUpdating(false);
          }, 1000);
      } else {
          setIsSopUpdating(false);
      }
    } catch (error) {
      console.error("Failed to get AI response", error);
      setIsSopUpdating(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Left Sidebar / Nav (Optional, kept minimal for Google Meet style) */}
      
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
              messages={messages} 
              onSendMessage={handleSendMessage}
              isScreenSharing={isScreenSharing}
              className="h-full"
            />
          </div>

          {/* New Column: SOP Document */}
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

          {/* New Column: SOP Flowchart */}
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
                  {/* Simulate triggering Jitsi screen share */}
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
                <TooltipContent>Toggle Gemini Assistant</TooltipContent>
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
