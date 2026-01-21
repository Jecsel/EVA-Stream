import { 
  Calendar as CalendarIcon, 
  Clock, 
  Users, 
  MoreHorizontal, 
  Video, 
  ArrowRight,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";

export function MeetingsList() {
  // Fetch upcoming and past meetings
  const { data: upcomingMeetings = [] } = useQuery({
    queryKey: ["upcomingMeetings"],
    queryFn: () => api.getUpcomingMeetings(),
  });

  const { data: pastMeetings = [] } = useQuery({
    queryKey: ["pastMeetings"],
    queryFn: () => api.getPastMeetings(5),
  });

  const formatDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="space-y-8">
      {/* Upcoming Meetings Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-primary" />
            Upcoming
          </h2>
          <Link href="/calendar">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary" data-testid="link-view-calendar">
              View Calendar <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
        
        <div className="space-y-3">
          {upcomingMeetings.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No upcoming meetings scheduled
            </div>
          ) : (
            upcomingMeetings.map((meeting) => {
              const meetingDate = meeting.scheduledDate ? new Date(meeting.scheduledDate) : new Date();
              return (
                <div 
                  key={meeting.id}
                  className="group flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/30 hover:border-primary/20 transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-muted/50 border border-border group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">{formatDate(meetingDate)}</span>
                      <span className="text-sm font-bold text-foreground">
                        {meetingDate.getDate()}
                      </span>
                    </div>
                    
                    <div>
                      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {meeting.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 mr-1" />
                          {format(meetingDate, "h:mm a")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/meeting/${meeting.roomId}`}>
                      <Button size="sm" className="hidden group-hover:flex bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs">
                        Join
                      </Button>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Copy Invitation</DropdownMenuItem>
                        <DropdownMenuItem>Edit Details</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Cancel Meeting</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Past Meetings Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Recent History
          </h2>
        </div>
        
        <div className="space-y-3">
          {pastMeetings.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No past meetings
            </div>
          ) : (
            pastMeetings.map((meeting) => {
              const meetingDate = meeting.scheduledDate ? new Date(meeting.scheduledDate) : new Date(meeting.updatedAt);
              return (
                <div 
                  key={meeting.id}
                  className="flex items-start justify-between p-4 rounded-xl border border-transparent hover:bg-muted/30 hover:border-border transition-all duration-200"
                >
                  <div className="flex gap-4">
                     <div className="mt-1 w-2 h-2 rounded-full bg-muted-foreground/30" />
                     <div>
                        <h3 className="font-medium text-foreground text-sm">{meeting.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 mb-2">
                          <span>{formatDate(meetingDate)}</span>
                          <span>•</span>
                          <span>{format(meetingDate, "h:mm a")}</span>
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center">
                     <Link href={`/meeting/${meeting.roomId}`}>
                       <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                          View <ExternalLink className="w-3 h-3 ml-1" />
                       </Button>
                     </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
