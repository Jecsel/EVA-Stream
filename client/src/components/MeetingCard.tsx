import { useState, type MouseEvent } from "react";
import { Play, Calendar, Clock, MoreVertical, Share2, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteRecording(recording.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      setShowDeleteDialog(false);
      toast.success("Recording deleted");
    },
    onError: () => {
      toast.error("Failed to delete recording. Please try again.");
      setShowDeleteDialog(false);
    },
  });

  const handleCardClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-dropdown-trigger]') || target.closest('[role="menu"]')) {
      return;
    }
    setLocation(`/recording/${recording.id}`);
  };

  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  return (
    <>
      <div 
        className="group relative bg-card hover:bg-muted/30 border border-border rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/20 cursor-pointer"
        onClick={handleCardClick}
        data-testid={`card-recording-${recording.id}`}
      >
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
                      <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => setLocation(`/recording/${recording.id}`)}>
                          <FileText className="w-3.5 h-3.5 mr-2" /> View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-xs text-destructive focus:text-destructive cursor-pointer"
                        onClick={handleDeleteClick}
                        data-testid={`button-delete-${recording.id}`}
                      >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
          </div>

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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{recording.title}"? This will permanently remove the recording and its SOP content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-card"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
