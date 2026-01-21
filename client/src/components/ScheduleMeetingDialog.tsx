import { useState, useEffect } from "react";
import { Calendar, Clock, Users, Mail, X, ExternalLink, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface GoogleStatus {
  connected: boolean;
  email: string | null;
}

interface ScheduleMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (meetingLink: string) => void;
}

export function ScheduleMeetingDialog({ open, onOpenChange, onSuccess }: ScheduleMeetingDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ connected: false, email: null });
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isLoadingGoogleStatus, setIsLoadingGoogleStatus] = useState(true);

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

  const handleSchedule = async () => {
    if (!title || !date || !startTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in the meeting title, date, and start time.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const scheduledDate = new Date(`${date}T${startTime}`);
      const endDate = endTime ? new Date(`${date}T${endTime}`) : undefined;

      const result = await api.scheduleWithCalendar({
        title,
        scheduledDate: scheduledDate.toISOString(),
        endDate: endDate?.toISOString(),
        attendeeEmails: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        description: description || undefined,
        userId: user?.uid,
        userEmail: user?.email || undefined,
      });

      toast({
        title: "Meeting Scheduled!",
        description: result.calendarEventCreated 
          ? "Calendar invitations have been sent to attendees." 
          : "Meeting created successfully.",
      });

      setTitle("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setDescription("");
      setAttendeeEmails([]);
      onOpenChange(false);
      onSuccess?.(result.link);
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Schedule a Meeting
          </DialogTitle>
          <DialogDescription>
            Create a meeting and optionally send calendar invitations to attendees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Meeting Title</Label>
            <Input
              id="title"
              placeholder="Weekly Team Standup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-meeting-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-meeting-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-time">Start Time</Label>
              <Input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                data-testid="input-meeting-start-time"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-time">End Time (optional)</Label>
            <Input
              id="end-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              data-testid="input-meeting-end-time"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Meeting agenda or notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="input-meeting-description"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Attendees
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="email@example.com"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyPress={handleKeyPress}
                data-testid="input-attendee-email"
              />
              <Button type="button" variant="outline" onClick={addAttendee} data-testid="button-add-attendee">
                Add
              </Button>
            </div>
            {attendeeEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attendeeEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-sm"
                  >
                    <Mail className="w-3 h-3" />
                    <span>{email}</span>
                    <button
                      onClick={() => removeAttendee(email)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-remove-attendee-${email}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-medium">Google Calendar</span>
              </div>
              {isLoadingGoogleStatus ? (
                <span className="text-sm text-muted-foreground">Loading...</span>
              ) : googleStatus.connected ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{googleStatus.email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnectGoogle}
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
                  data-testid="button-connect-google"
                >
                  {isConnectingGoogle ? "Connecting..." : "Connect"}
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
            
            {googleStatus.connected ? (
              <div className="flex items-start gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 p-2 rounded">
                <Check className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Calendar event will be created and invitations sent to attendees.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Connect Google Calendar to automatically create events and send invitations.</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={isLoading} data-testid="button-schedule-meeting">
            {isLoading ? "Scheduling..." : "Schedule Meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
