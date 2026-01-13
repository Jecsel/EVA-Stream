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

interface Meeting {
  id: string;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  attendees: string[];
  type: "upcoming" | "past";
  summary?: string;
  status?: "scheduled" | "live" | "completed" | "cancelled";
}

// Mock Data
const MEETINGS: Meeting[] = [
  {
    id: "m1",
    title: "Q1 Roadmap Review",
    date: new Date(new Date().setHours(14, 0, 0, 0)), // Today 2 PM
    startTime: "2:00 PM",
    endTime: "3:00 PM",
    attendees: ["https://i.pravatar.cc/150?u=1", "https://i.pravatar.cc/150?u=2", "https://i.pravatar.cc/150?u=3"],
    type: "upcoming",
    status: "scheduled"
  },
  {
    id: "m2",
    title: "Design System Sync",
    date: new Date(new Date().setDate(new Date().getDate() + 1)), // Tomorrow
    startTime: "10:30 AM",
    endTime: "11:15 AM",
    attendees: ["https://i.pravatar.cc/150?u=4", "https://i.pravatar.cc/150?u=1"],
    type: "upcoming",
    status: "scheduled"
  },
  {
    id: "m3",
    title: "Client Onboarding",
    date: new Date(new Date().setDate(new Date().getDate() - 1)), // Yesterday
    startTime: "4:00 PM",
    endTime: "5:00 PM",
    attendees: ["https://i.pravatar.cc/150?u=5", "https://i.pravatar.cc/150?u=6"],
    type: "past",
    status: "completed",
    summary: "Client approved the initial timeline. Action items: Send contract by Friday."
  },
  {
    id: "m4",
    title: "Weekly Standup",
    date: new Date(new Date().setDate(new Date().getDate() - 2)), // 2 days ago
    startTime: "9:00 AM",
    endTime: "9:15 AM",
    attendees: ["https://i.pravatar.cc/150?u=1", "https://i.pravatar.cc/150?u=2", "https://i.pravatar.cc/150?u=3", "https://i.pravatar.cc/150?u=4"],
    type: "past",
    status: "completed",
    summary: "Quick updates. No blockers reported."
  }
];

export function MeetingsList() {
  const upcomingMeetings = MEETINGS.filter(m => m.type === "upcoming");
  const pastMeetings = MEETINGS.filter(m => m.type === "past");

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
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary">
            View Calendar <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        
        <div className="space-y-3">
          {upcomingMeetings.map((meeting) => (
            <div 
              key={meeting.id}
              className="group flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/30 hover:border-primary/20 transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-muted/50 border border-border group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">{formatDate(meeting.date)}</span>
                  <span className="text-sm font-bold text-foreground">
                    {meeting.date.getDate()}
                  </span>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {meeting.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 mr-1" />
                      {meeting.startTime} - {meeting.endTime}
                    </span>
                    <div className="flex -space-x-1.5">
                      {meeting.attendees.map((avatar, i) => (
                        <img 
                          key={i} 
                          src={avatar} 
                          alt="Attendee" 
                          className="w-4 h-4 rounded-full border border-card"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/meeting/${meeting.id}`}>
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
          ))}
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
          {pastMeetings.map((meeting) => (
            <div 
              key={meeting.id}
              className="flex items-start justify-between p-4 rounded-xl border border-transparent hover:bg-muted/30 hover:border-border transition-all duration-200"
            >
              <div className="flex gap-4">
                 <div className="mt-1 w-2 h-2 rounded-full bg-muted-foreground/30" />
                 <div>
                    <h3 className="font-medium text-foreground text-sm">{meeting.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 mb-2">
                      <span>{formatDate(meeting.date)}</span>
                      <span>•</span>
                      <span>{meeting.startTime}</span>
                    </div>
                    
                    {meeting.summary && (
                      <div className="bg-muted/30 p-2 rounded-md border border-border/50 max-w-md">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-accent flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                            AI Recap
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {meeting.summary}
                        </p>
                      </div>
                    )}
                 </div>
              </div>

              <div className="flex items-center">
                 <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                    View Recording <ExternalLink className="w-3 h-3 ml-1" />
                 </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
