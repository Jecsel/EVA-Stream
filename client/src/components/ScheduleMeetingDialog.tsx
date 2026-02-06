import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Users, Mail, X, ExternalLink, Check, AlertCircle, Repeat, ChevronDown, Paperclip, FileText, Trash2, List, Upload, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format, getDay, getDate, getMonth, getYear } from "date-fns";

interface GoogleStatus {
  connected: boolean;
  email: string | null;
}

interface EditMeetingData {
  id: string;
  title: string;
  scheduledDate: string | null;
  endDate: string | null;
  attendeeEmails: string[] | null;
  selectedAgents: string[] | null;
  recurrence: string | null;
  eventType: string | null;
  isAllDay: boolean | null;
  description?: string | null;
}

interface ScheduleMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (meetingLink: string) => void;
  initialDate?: Date;
  editMeeting?: EditMeetingData | null;
}

type EventType = "event" | "task";
type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "annually" | "weekdays" | "custom";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinalSuffixes = ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"];

function getOrdinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  return ordinalSuffixes[n % 10] || "th";
}

function getWeekOfMonth(date: Date): number {
  const dayOfMonth = getDate(date);
  return Math.ceil(dayOfMonth / 7);
}

function getWeekOrdinal(week: number): string {
  const ordinals = ["first", "second", "third", "fourth", "fifth"];
  return ordinals[week - 1] || `${week}${getOrdinalSuffix(week)}`;
}

export function ScheduleMeetingDialog({ open, onOpenChange, onSuccess, initialDate, editMeeting }: ScheduleMeetingDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isEditMode = !!editMeeting;
  const [eventType, setEventType] = useState<EventType>("event");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDateStr, setEndDateStr] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceType>("none");
  const [description, setDescription] = useState("");
  const [agenda, setAgenda] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: string;
    content?: string;
  }>>([]);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ connected: false, email: null });
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isLoadingGoogleStatus, setIsLoadingGoogleStatus] = useState(true);

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
    enabled: open,
  });

  useEffect(() => {
    if (open && editMeeting) {
      setTitle(editMeeting.title || "");
      setEventType((editMeeting.eventType as EventType) || "event");
      setIsAllDay(editMeeting.isAllDay || false);
      setRecurrence((editMeeting.recurrence as RecurrenceType) || "none");
      setAttendeeEmails(editMeeting.attendeeEmails || []);
      setSelectedAgentIds(editMeeting.selectedAgents || []);
      setDescription(editMeeting.description || "");

      if (editMeeting.scheduledDate) {
        const sd = new Date(editMeeting.scheduledDate);
        setDate(format(sd, "yyyy-MM-dd"));
        if (!editMeeting.isAllDay) {
          setStartTime(format(sd, "HH:mm"));
        }
      }
      if (editMeeting.endDate) {
        const ed = new Date(editMeeting.endDate);
        if (editMeeting.isAllDay) {
          setEndDateStr(format(ed, "yyyy-MM-dd"));
        } else {
          setEndTime(format(ed, "HH:mm"));
        }
      }
    } else if (open && initialDate) {
      setDate(format(initialDate, "yyyy-MM-dd"));
    }
  }, [initialDate, open, editMeeting]);

  const recurrenceOptions = useMemo(() => {
    if (!date) {
      return [
        { value: "none", label: "No Repeat" },
        { value: "daily", label: "Daily" },
        { value: "weekly", label: "Weekly" },
        { value: "monthly", label: "Monthly" },
        { value: "annually", label: "Annually" },
        { value: "weekdays", label: "Weekdays" },
      ];
    }

    const selectedDate = new Date(date + "T12:00:00");
    const dayName = dayNames[getDay(selectedDate)];
    const dayOfMonth = getDate(selectedDate);
    const weekOfMonth = getWeekOfMonth(selectedDate);
    const weekOrdinal = getWeekOrdinal(weekOfMonth);
    const monthName = format(selectedDate, "MMMM");

    return [
      { value: "none", label: "No Repeat" },
      { value: "daily", label: "Daily" },
      { value: "weekly", label: `Weekly on ${dayName}` },
      { value: "monthly", label: `Monthly on ${weekOrdinal} ${dayName}` },
      { value: "annually", label: `Annually on ${monthName} ${dayOfMonth}` },
      { value: "weekdays", label: "Weekdays" },
    ];
  }, [date]);

  useEffect(() => {
    const checkGoogleStatus = async () => {
      if (!user?.uid) {
        setIsLoadingGoogleStatus(false);
        return;
      }
      
      try {
        const status = await api.getGoogleStatus(user.uid, user.email || undefined);
        setGoogleStatus(status);
      } catch (e) {
        console.error("Failed to get Google status");
      }
      setIsLoadingGoogleStatus(false);
    };

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("google_auth") === "success") {
      const email = urlParams.get("google_email");
      setGoogleStatus({ connected: true, email: email ? decodeURIComponent(email) : null });
      window.history.replaceState({}, "", window.location.pathname);
      toast({
        title: "Google Calendar Connected",
        description: email ? `Connected as ${email}` : "Successfully connected!",
      });
      setIsLoadingGoogleStatus(false);
    } else {
      checkGoogleStatus();
    }
  }, [user?.uid]);

  const handleConnectGoogle = async () => {
    if (!user?.uid) {
      toast({
        title: "Not Logged In",
        description: "Please log in to connect Google Calendar.",
        variant: "destructive",
      });
      return;
    }
    
    setIsConnectingGoogle(true);
    try {
      const { authUrl } = await api.getGoogleAuthUrl(user.uid);
      window.location.href = authUrl;
    } catch (error) {
      toast({
        title: "Google Calendar Not Available",
        description: "Google Calendar integration is not configured. Please contact your administrator.",
        variant: "destructive",
      });
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!user?.uid) return;
    
    try {
      await api.disconnectGoogle(user.uid, user.email || undefined);
      setGoogleStatus({ connected: false, email: null });
      toast({
        title: "Disconnected",
        description: "Google Calendar has been disconnected.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disconnect Google Calendar.",
        variant: "destructive",
      });
    }
  };

  const addAttendee = () => {
    const email = attendeeInput.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (!attendeeEmails.includes(email)) {
        setAttendeeEmails([...attendeeEmails, email]);
      }
      setAttendeeInput("");
    } else if (email) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
    }
  };

  const removeAttendee = (email: string) => {
    setAttendeeEmails(attendeeEmails.filter(e => e !== email));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addAttendee();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        const newFile = {
          filename: `${Date.now()}-${file.name}`,
          originalName: file.name,
          mimeType: file.type,
          size: file.size.toString(),
          content: file.type.startsWith('text/') ? content : undefined,
        };
        setAttachedFiles(prev => [...prev, newFile]);
      };
      if (file.type.startsWith('text/')) {
        reader.readAsText(file);
      } else {
        setAttachedFiles(prev => [...prev, {
          filename: `${Date.now()}-${file.name}`,
          originalName: file.name,
          mimeType: file.type,
          size: file.size.toString(),
        }]);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (filename: string) => {
    setAttachedFiles(prev => prev.filter(f => f.filename !== filename));
  };

  const formatFileSize = (size: string) => {
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSchedule = async () => {
    if (!title || !date) {
      toast({
        title: "Missing Information",
        description: "Please fill in the title and date.",
        variant: "destructive",
      });
      return;
    }

    if (!isAllDay && !startTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in the start time or mark as all-day event.",
        variant: "destructive",
      });
      return;
    }

    if (isAllDay && endDateStr && endDateStr < date) {
      toast({
        title: "Invalid Date Range",
        description: "End date cannot be before start date.",
        variant: "destructive",
      });
      return;
    }

    if (!isAllDay && startTime && endTime && endTime <= startTime) {
      toast({
        title: "Invalid Time Range",
        description: "End time must be after start time.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      let scheduledDate: Date;
      let endDate: Date | undefined;

      if (isAllDay) {
        scheduledDate = new Date(`${date}T00:00:00`);
        if (endDateStr) {
          endDate = new Date(`${endDateStr}T23:59:59`);
        } else {
          endDate = new Date(`${date}T23:59:59`);
        }
      } else {
        scheduledDate = new Date(`${date}T${startTime}`);
        endDate = endTime ? new Date(`${date}T${endTime}`) : undefined;
      }

      if (isEditMode && editMeeting) {
        await api.updateMeeting(editMeeting.id, {
          title,
          scheduledDate: scheduledDate.toISOString(),
          endDate: endDate ? endDate.toISOString() : null,
          attendeeEmails: attendeeEmails.length > 0 ? attendeeEmails : null,
          eventType,
          isAllDay,
          recurrence,
          selectedAgents: selectedAgentIds.length > 0 ? selectedAgentIds : null,
          description: description || null,
        } as any);

        toast({
          title: "Meeting Updated!",
          description: "Your changes have been saved.",
        });
      } else {
        const result = await api.scheduleWithCalendar({
          title,
          scheduledDate: scheduledDate.toISOString(),
          endDate: endDate?.toISOString(),
          attendeeEmails: attendeeEmails.length > 0 ? attendeeEmails : undefined,
          description: description || (agenda ? agenda.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : undefined),
          agenda: agenda || undefined,
          files: attachedFiles.length > 0 ? attachedFiles : undefined,
          userId: user?.uid,
          userEmail: user?.email || undefined,
          eventType,
          isAllDay,
          recurrence,
          selectedAgents: selectedAgentIds.length > 0 ? selectedAgentIds : undefined,
        });

        toast({
          title: eventType === "event" ? "Meeting Scheduled!" : "Task Created!",
          description: result.calendarEventCreated 
            ? "Calendar invitations have been sent to attendees." 
            : `${eventType === "event" ? "Meeting" : "Task"} created successfully.`,
        });
      }

      if (!isEditMode) {
        setTitle("");
        setDate("");
        setEndDateStr("");
        setStartTime("");
        setEndTime("");
        setIsAllDay(false);
        setRecurrence("none");
        setDescription("");
        setAgenda("");
        setAttachedFiles([]);
        setAttendeeEmails([]);
        setSelectedAgentIds([]);
        setEventType("event");
      }
      onOpenChange(false);
      onSuccess?.("");
    } catch (error) {
      toast({
        title: "Failed to Schedule",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 border-0 shadow-xl rounded-xl p-0">
        <DialogHeader className="p-6 pb-4 border-b border-gray-100 dark:border-zinc-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Calendar className="w-5 h-5 text-orange-500" />
            {isEditMode ? "Edit Meeting" : "Schedule Meeting"}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isEditMode ? "Update the meeting details below." : "Schedule a meeting with your client to discuss this task."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Meeting Title</Label>
            <Input
              placeholder="Enter meeting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg focus:border-orange-500 focus:ring-orange-500 focus-visible:ring-orange-500"
              data-testid="input-meeting-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Event Type</Label>
              <Select value={eventType} onValueChange={(value) => setEventType(value as EventType)}>
                <SelectTrigger className="h-11 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg" data-testid="select-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</Label>
              <Input
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg"
                data-testid="input-meeting-date"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">All Day Event</Label>
            <Switch
              checked={isAllDay}
              onCheckedChange={setIsAllDay}
              className="data-[state=checked]:bg-orange-500"
              data-testid="switch-all-day"
            />
          </div>

          {!isAllDay && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Start Time</Label>
                <div className="relative">
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-11 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg pl-10"
                    data-testid="input-meeting-start-time"
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">End Time</Label>
                <div className="relative">
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-11 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg pl-10"
                    data-testid="input-meeting-end-time"
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          )}

          {isAllDay && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">End Date (Optional)</Label>
              <Input
                type="date"
                min={date || today}
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="h-11 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg"
                data-testid="input-meeting-end-date"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-gray-400" />
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Recurrence</Label>
            </div>
            <Select value={recurrence} onValueChange={(value) => setRecurrence(value as RecurrenceType)}>
              <SelectTrigger className="h-11 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg" data-testid="select-recurrence">
                <SelectValue placeholder="No Repeat" />
              </SelectTrigger>
              <SelectContent className="z-[10000]" position="popper" sideOffset={4}>
                {recurrenceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {agents.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-gray-400" />
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Agent (Optional)</Label>
              </div>
              <div className="space-y-2">
                {agents.filter((a: any) => a.status === "active").map((agent: any) => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        setSelectedAgentIds(prev =>
                          isSelected
                            ? prev.filter(id => id !== agent.id)
                            : [...prev, agent.id]
                        );
                      }}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
                        isSelected
                          ? "border-orange-500 bg-orange-50 dark:bg-orange-900/10"
                          : "border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600"
                      }`}
                      data-testid={`button-select-agent-${agent.id}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? "bg-orange-500 text-white"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
                      }`}>
                        {agent.type === "scrum" ? (
                          <Users className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{agent.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-orange-500" />}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {agent.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description (Optional)</Label>
            <Textarea
              placeholder="Add any additional notes or context for the meeting..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg resize-none"
              data-testid="input-meeting-description"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <List className="w-4 h-4 text-gray-400" />
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Agenda (Optional)</Label>
            </div>
            <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
              <RichTextEditor
                content={agenda}
                onChange={setAgenda}
                placeholder="Add meeting agenda items..."
                minHeight="80px"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-gray-400" />
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Attachments (Optional)</Label>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file-upload"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-10 border-dashed border-gray-300 dark:border-zinc-600 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10"
              data-testid="button-attach-files"
            >
              <Upload className="w-4 h-4 mr-2" />
              Attach Files
            </Button>
            {attachedFiles.length > 0 && (
              <div className="space-y-2 mt-2">
                {attachedFiles.map((file) => (
                  <div
                    key={file.filename}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-zinc-800 rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="w-4 h-4 flex-shrink-0 text-orange-500" />
                      <span className="truncate text-gray-700 dark:text-gray-300">{file.originalName}</span>
                      <span className="text-xs text-gray-400">
                        ({formatFileSize(file.size)})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.filename)}
                      className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/20"
                      data-testid={`button-remove-file-${file.filename}`}
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(attendeeEmails.length > 0 || googleStatus.email) && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">Attendee:</span>
                <span className="text-sm">{attendeeEmails[0] || googleStatus.email}</span>
              </div>
              {attendeeEmails.length > 0 && (
                <div className="text-sm text-orange-600 dark:text-orange-300 ml-6">
                  ({attendeeEmails.join(", ")})
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Add Attendees</Label>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="email@example.com"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="h-10 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 rounded-lg"
                data-testid="input-attendee-email"
              />
              <Button 
                type="button" 
                variant="outline" 
                onClick={addAttendee} 
                className="h-10 px-4 border-gray-200 dark:border-zinc-700"
                data-testid="button-add-attendee"
              >
                Add
              </Button>
            </div>
            {attendeeEmails.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attendeeEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full text-sm"
                  >
                    <Mail className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 dark:text-gray-300">{email}</span>
                    <button
                      onClick={() => removeAttendee(email)}
                      className="ml-1 text-gray-400 hover:text-red-500"
                      data-testid={`button-remove-attendee-${email}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-gray-200 dark:border-zinc-700 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-medium text-gray-900 dark:text-white">Google Calendar</span>
              </div>
              {isLoadingGoogleStatus ? (
                <span className="text-sm text-gray-500">Loading...</span>
              ) : googleStatus.connected ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{googleStatus.email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnectGoogle}
                    className="h-8 px-2 text-gray-500 hover:text-red-500"
                    data-testid="button-disconnect-google"
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectGoogle}
                  disabled={isConnectingGoogle || !user}
                  className="h-8"
                  data-testid="button-connect-google"
                >
                  {isConnectingGoogle ? "Connecting..." : "Connect"}
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
            
            {googleStatus.connected ? (
              <div className="flex items-start gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 p-3 rounded-lg">
                <Check className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Calendar event will be created and invitations sent to attendees.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 dark:bg-zinc-800 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Connect Google Calendar to automatically create events and send invitations.</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-gray-100 dark:border-zinc-800 gap-3">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="h-11 px-6 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSchedule} 
            disabled={isLoading} 
            className="h-11 px-6 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
            data-testid="button-schedule-meeting"
          >
            <Calendar className="w-4 h-4 mr-2" />
            {isLoading ? (isEditMode ? "Saving..." : "Scheduling...") : (isEditMode ? "Save Changes" : "Schedule Meeting")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
