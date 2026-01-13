import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Video, 
  Keyboard, 
  Plus, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  Search,
  Grid,
  List,
  Clock,
  Settings,
  HelpCircle,
  Menu,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { MeetingCard } from "@/components/MeetingCard";
import { MeetingsList } from "@/components/MeetingsList";

// Mock Data
const RECORDINGS = [
  {
    id: "1",
    title: "Product Design Review - Q3",
    date: "Today, 10:30 AM",
    duration: "45:12",
    summary: "Discussed the new navigation patterns. Agreed to move forward with the sidebar layout. AI noted 3 action items regarding accessibility.",
    thumbnailColor: "bg-blue-900/40"
  },
  {
    id: "2",
    title: "Weekly Team Sync",
    date: "Yesterday, 2:00 PM",
    duration: "28:05",
    summary: "Team updates on the sprint progress. Blocker identified in the backend integration. Scheduled a follow-up for Friday.",
    thumbnailColor: "bg-emerald-900/40"
  },
  {
    id: "3",
    title: "Client Discovery Call",
    date: "Jan 10, 4:15 PM",
    duration: "1:02:30",
    summary: "Client outlined their core requirements for the MVP. Budget constraints were discussed. AI highlighted 5 key feature requests.",
    thumbnailColor: "bg-purple-900/40"
  },
  {
    id: "4",
    title: "Marketing Strategy Brainstorm",
    date: "Jan 8, 11:00 AM",
    duration: "55:00",
    summary: "Brainstorming session for the upcoming launch. Generated 10+ campaign ideas. AI grouped ideas into 'Social', 'Content', and 'Ads'.",
    thumbnailColor: "bg-orange-900/40"
  }
];

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const [meetingCode, setMeetingCode] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const handleCreateInstant = () => {
    const randomId = Math.random().toString(36).substring(7);
    setLocation(`/meeting/${randomId}`);
  };

  const handleCreateForLater = () => {
    const link = `https://videoai.app/meet/${Math.random().toString(36).substring(7)}`;
    setGeneratedLink(link);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation */}
      <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background sticky top-0 z-50">
        <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                    <Video className="w-5 h-5" />
                </div>
                <span className="text-xl font-medium tracking-tight hidden md:block">VideoAI</span>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center text-sm text-muted-foreground mr-4">
                <span className="px-2">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <HelpCircle className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <Settings className="w-5 h-5" />
            </Button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent border border-white/10" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8">
        {/* Hero / Action Section */}
        <div className="grid md:grid-cols-2 gap-8 mb-12 items-center">
            <div className="space-y-6">
                <h1 className="text-3xl md:text-4xl font-normal tracking-tight text-foreground">
                    Premium video meetings. <br />
                    <span className="text-muted-foreground">Now free for everyone.</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                    We re-engineered the service we built for secure business meetings, Google Meet, to make it free and available for all.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="lg" className="bg-primary hover:bg-primary/90 text-white gap-2 h-12 px-6 text-base shadow-lg shadow-primary/20">
                                <Video className="w-5 h-5" />
                                New meeting
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64 p-2">
                            <DropdownMenuItem onClick={handleCreateForLater} className="gap-3 py-3 cursor-pointer">
                                <LinkIcon className="w-4 h-4" />
                                Create a meeting for later
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleCreateInstant} className="gap-3 py-3 cursor-pointer">
                                <Plus className="w-4 h-4" />
                                Start an instant meeting
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-3 py-3 cursor-pointer">
                                <Calendar className="w-4 h-4" />
                                Schedule in Calendar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input 
                                placeholder="Enter a code or link" 
                                className="pl-10 h-12 bg-background border-border focus-visible:ring-primary"
                                value={meetingCode}
                                onChange={(e) => setMeetingCode(e.target.value)}
                            />
                        </div>
                        <Button 
                            variant="ghost" 
                            className={`h-12 px-4 ${meetingCode ? 'text-primary' : 'text-muted-foreground opacity-50 cursor-not-allowed'}`}
                            disabled={!meetingCode}
                            onClick={() => setLocation(`/meeting/${meetingCode}`)}
                        >
                            Join
                        </Button>
                    </div>
                </div>
            </div>

            {/* Illustration / Visual */}
            <div className="hidden md:flex justify-center relative">
                <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full opacity-50" />
                <div className="relative bg-card border border-border rounded-2xl p-6 shadow-2xl max-w-sm w-full transform rotate-1 hover:rotate-0 transition-transform duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex -space-x-2">
                            {[1,2,3].map(i => (
                                <div key={i} className={`w-8 h-8 rounded-full border-2 border-card bg-zinc-700 flex items-center justify-center text-[10px]`}>
                                    User
                                </div>
                            ))}
                        </div>
                        <span className="text-xs text-green-500 font-medium bg-green-500/10 px-2 py-1 rounded-full animate-pulse">Live</span>
                    </div>
                    <div className="space-y-3">
                        <div className="h-2 w-3/4 bg-muted rounded animate-pulse" />
                        <div className="h-2 w-full bg-muted rounded animate-pulse" />
                        <div className="h-2 w-5/6 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="mt-6 flex gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <div className="w-4 h-4 rounded-full bg-primary/50" />
                        </div>
                        <div className="flex-1 bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
                            Gemini is analyzing the screen...
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Generated Link Dialog */}
        <Dialog open={!!generatedLink} onOpenChange={(open) => !open && setGeneratedLink("")}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Here's the link to your meeting</DialogTitle>
                    <DialogDescription>
                        Copy this link and send it to people you want to meet with. Be sure to save it so you can use it later, too.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 bg-muted/50 p-3 rounded-md mt-2">
                    <span className="text-sm flex-1 truncate font-mono text-muted-foreground">{generatedLink}</span>
                    <Button variant="ghost" size="icon" onClick={copyLink} className="h-8 w-8">
                        {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                </div>
                <DialogFooter className="sm:justify-start">
                    <DialogClose asChild>
                         <Button type="button" variant="secondary">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Recordings Section */}
        <div className="mt-12 md:mt-16 grid lg:grid-cols-3 gap-8 lg:gap-12">
            {/* Left Column: Recordings Grid (Takes up 2/3 space on large screens) */}
            <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-foreground">Past Recordings</h2>
                        <p className="text-sm text-muted-foreground">Access your AI-analyzed meeting history</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative hidden sm:block">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Search recordings..." className="pl-9 w-48 h-9 text-sm bg-card border-border" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {RECORDINGS.map(rec => (
                        <MeetingCard key={rec.id} recording={rec} />
                    ))}
                </div>
                
                <div className="mt-8 flex justify-center">
                    <Button variant="outline" className="text-muted-foreground border-border hover:bg-muted">
                        View older recordings
                    </Button>
                </div>
            </div>

            {/* Right Column: Meetings List (Takes up 1/3 space on large screens) */}
            <div className="lg:col-span-1 lg:pl-8 lg:border-l border-border/50">
                <MeetingsList />
            </div>
        </div>
      </main>
    </div>
  );
}
