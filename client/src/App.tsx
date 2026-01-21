import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import MeetingRoom from "@/pages/MeetingRoom";
import Dashboard from "@/pages/Dashboard";
import RecordingDetail from "@/pages/RecordingDetail";
import Admin from "@/pages/Admin";
import Calendar from "@/pages/Calendar";

function ProtectedMeetingRoom() {
  return (
    <ProtectedRoute>
      <MeetingRoom />
    </ProtectedRoute>
  );
}

function ProtectedRecordingDetail() {
  return (
    <ProtectedRoute>
      <RecordingDetail />
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute>
          <Calendar />
        </ProtectedRoute>
      </Route>
      <Route path="/meeting/:id" component={ProtectedMeetingRoom} />
      <Route path="/recording/:id" component={ProtectedRecordingDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
