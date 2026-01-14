import type { MouseEvent } from "react";
import { Play, Calendar, Clock, MoreVertical, Share2, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

interface MeetingRecording {
  id: string;
  title: string;
  date: string;
  duration: string;
  summary: string;
  thumbnailColor: string;
}

interface MeetingCardProps {
  recording: MeetingRecording;
}

export function MeetingCard({ recording }: MeetingCardProps) {
  const [, setLocation] = useLocation();

  const handleCardClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-dropdown-trigger]') || target.closest('[role="menu"]')) {
      return;
    }
    setLocation(`/recording/${recording.id}`);
  };

  return (
    <div 
      className="group relative bg-card hover:bg-muted/30 border border-border rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/20 cursor-pointer"
      onClick={handleCardClick}
      data-testid={`card-recording-${recording.id}`}
    >
      {/* Thumbnail Area */}
      <div className={`h-32 w-full ${recording.thumbnailColor} relative p-4 flex flex-col justify-end`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="relative z-10 flex items-center justify-between">
            <span className="px-2 py-0.5 rounded bg-black/50 backdrop-blur-sm text-[10px] font-medium text-white flex items-center gap-1">
                <Play className="w-3 h-3 fill-current" />
                Play Recording
            </span>
            <span className="text-[10px] text-white/80 font-medium bg-black/30 px-1.5 py-0.5 rounded">
                {recording.duration}
            </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
            <div>
                <h3 className="font-medium text-foreground text-sm line-clamp-1 group-hover:text-primary transition-colors">
                    {recording.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {recording.date}
                </p>
            </div>
            
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-muted-foreground hover:text-foreground" data-dropdown-trigger>
                        <MoreVertical className="w-4 h-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 bg-popover border-border">
                    <DropdownMenuItem className="text-xs cursor-pointer">
                        <Share2 className="w-3.5 h-3.5 mr-2" /> Share
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs cursor-pointer">
                        <FileText className="w-3.5 h-3.5 mr-2" /> View Transcript
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs text-destructive focus:text-destructive cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* AI Summary Snippet */}
        <div className="bg-muted/30 rounded-lg p-2.5 mt-3 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-4 h-4 rounded-full bg-accent/20 flex items-center justify-center">
                    <SparklesIcon className="w-2.5 h-2.5 text-accent" />
                </div>
                <span className="text-[10px] font-semibold text-accent">AI Summary</span>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                {recording.summary}
            </p>
        </div>
      </div>
    </div>
  );
}

function SparklesIcon({ className }: { className?: string }) {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <path d="M5 3v4" />
            <path d="M9 3v4" />
            <path d="M3 5h4" />
            <path d="M3 9h4" />
        </svg>
    )
}
