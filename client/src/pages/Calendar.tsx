import { useState, useMemo } from "react";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, getDay, addDays, addWeeks, addYears } from "date-fns";
import { ScheduleMeetingDialog } from "@/components/ScheduleMeetingDialog";
import { useAuth } from "@/contexts/AuthContext";
import type { Meeting } from "@shared/schema";

export default function Calendar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const { data: upcomingMeetings = [] } = useQuery({
    queryKey: ["upcomingMeetings"],
    queryFn: () => api.getUpcomingMeetings(),
  });

  const { data: pastMeetings = [] } = useQuery({
    queryKey: ["pastMeetings"],
    queryFn: () => api.getPastMeetings(50),
  });

  const rawMeetings = [...upcomingMeetings, ...pastMeetings];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDayOfWeek = monthStart.getDay();
  const paddingDays = Array(startDayOfWeek).fill(null);

  const allMeetings = useMemo(() => {
    const expanded: typeof rawMeetings = [];
    const addedOriginals = new Set<string>();

    for (const meeting of rawMeetings) {
      const recurrence = (meeting as any).recurrence || "none";
      if (recurrence === "none" || recurrence === "custom") {
        expanded.push(meeting);
        continue;
      }

      const originalDate = meeting.scheduledDate
        ? new Date(meeting.scheduledDate)
        : meeting.createdAt
          ? new Date(meeting.createdAt)
          : null;
      if (!originalDate) {
        expanded.push(meeting);
        continue;
      }

      const recurrenceEnd = (meeting as any).recurrenceEndDate
        ? new Date((meeting as any).recurrenceEndDate)
        : null;

      const endBound = recurrenceEnd && recurrenceEnd < monthEnd ? recurrenceEnd : monthEnd;
      const iterStart = monthStart > originalDate ? monthStart : originalDate;

      if (iterStart > endBound) {
        if (isSameMonth(originalDate, currentMonth)) {
          expanded.push(meeting);
        }
        continue;
      }

      let cursor = new Date(iterStart);

      while (cursor <= endBound) {
        const isOriginalDay = isSameDay(cursor, originalDate);
        const shouldInclude = (() => {
          if (isOriginalDay) return true;
          switch (recurrence) {
            case "daily":
              return true;
            case "weekdays": {
              const dow = getDay(cursor);
              return dow >= 1 && dow <= 5;
            }
            case "weekly":
              return getDay(cursor) === getDay(originalDate);
            case "monthly":
              return cursor.getDate() === originalDate.getDate();
            case "annually":
              return cursor.getDate() === originalDate.getDate() &&
                     cursor.getMonth() === originalDate.getMonth();
            default:
              return false;
          }
        })();

        if (shouldInclude) {
          if (isOriginalDay) {
            expanded.push(meeting);
            addedOriginals.add(meeting.id);
          } else {
            expanded.push({
              ...meeting,
              scheduledDate: new Date(cursor) as any,
              endDate: meeting.endDate
                ? new Date(
                    new Date(cursor).getTime() +
                    (new Date(meeting.endDate as any).getTime() - originalDate.getTime())
                  ) as any
                : meeting.endDate,
            });
          }
        }

        cursor = addDays(cursor, 1);
      }
    }

    return expanded;
  }, [rawMeetings, monthStart, monthEnd, currentMonth]);

  const getMeetingsForDay = (date: Date) => {
    return allMeetings.filter(meeting => {
      const dateToUse = meeting.scheduledDate || meeting.createdAt || meeting.updatedAt;
      if (!dateToUse) return false;
      const meetingDate = new Date(dateToUse);
      return isSameDay(meetingDate, date);
    });
  };

  const selectedDayMeetings = selectedDate ? getMeetingsForDay(selectedDate) : [];

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };

  const openGoogleCalendar = () => {
    window.open("https://calendar.google.com", "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary" />
                Calendar
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={openGoogleCalendar}
                className="gap-2"
                data-testid="button-open-google-calendar"
              >
                <ExternalLink className="w-4 h-4" />
                Open Google Calendar
              </Button>
              <Button 
                size="sm" 
                onClick={() => setScheduleDialogOpen(true)}
                className="gap-2"
                data-testid="button-schedule-meeting"
              >
                <Plus className="w-4 h-4" />
                Schedule Meeting
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-foreground">
                  {format(currentMonth, "MMMM yyyy")}
                </h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={goToToday}>
                    Today
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {paddingDays.map((_, index) => (
                  <div key={`padding-${index}`} className="aspect-square" />
                ))}
                {daysInMonth.map((day) => {
                  const dayMeetings = getMeetingsForDay(day);
                  const hasMeetings = dayMeetings.length > 0;
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isTodayDate = isToday(day);
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        aspect-square flex flex-col items-center justify-center rounded-lg text-sm
                        transition-all duration-200 relative
                        ${isSelected 
                          ? "bg-primary text-primary-foreground" 
                          : isTodayDate 
                            ? "bg-primary/10 text-primary font-semibold" 
                            : "hover:bg-muted/50 text-foreground"
                        }
                        ${!isSameMonth(day, currentMonth) ? "text-muted-foreground/50" : ""}
                      `}
                      data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                    >
                      <span>{day.getDate()}</span>
                      {hasMeetings && (
                        <div className="flex gap-0.5 mt-1">
                          {dayMeetings.slice(0, 3).map((_, i) => (
                            <div 
                              key={i} 
                              className={`w-1 h-1 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border border-border p-6 sticky top-24">
              <h3 className="font-semibold text-foreground mb-4">
                {selectedDate 
                  ? format(selectedDate, "EEEE, MMMM d") 
                  : "Select a date"}
              </h3>
              
              {selectedDate ? (
                selectedDayMeetings.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDayMeetings.map((meeting) => {
                      const dateToUse = meeting.scheduledDate || meeting.createdAt || meeting.updatedAt;
                      if (!dateToUse) return null;
                      const meetingDate = new Date(dateToUse);
                      return (
                        <div 
                          key={meeting.id}
                          className="p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <h4 className="font-medium text-foreground mb-1">{meeting.title}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                            <Clock className="w-3 h-3" />
                            {format(meetingDate, "h:mm a")}
                            {meeting.endDate && typeof meeting.endDate === 'object' && (
                              <> - {format(meeting.endDate, "h:mm a")}</>
                            )}
                          </div>
                          <Link href={`/meeting/${meeting.roomId}`}>
                            <Button size="sm" className="w-full" data-testid={`button-join-${meeting.id}`}>
                              Join Meeting
                            </Button>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No meetings scheduled</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4"
                      onClick={() => setScheduleDialogOpen(true)}
                    >
                      Schedule a meeting
                    </Button>
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Click on a date to see meetings</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <ScheduleMeetingDialog 
        open={scheduleDialogOpen} 
        onOpenChange={setScheduleDialogOpen}
        initialDate={selectedDate || undefined}
        onSuccess={() => {
          setScheduleDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["upcomingMeetings"] });
          queryClient.invalidateQueries({ queryKey: ["pastMeetings"] });
        }}
      />
    </div>
  );
}
