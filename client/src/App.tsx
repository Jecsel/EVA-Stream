import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MeetingRoom from "@/pages/MeetingRoom";
import Dashboard from "@/pages/Dashboard";
import RecordingDetail from "@/pages/RecordingDetail";
import Admin from "@/pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/admin" component={Admin} />
      <Route path="/meeting/:id" component={MeetingRoom} />
      <Route path="/recording/:id" component={RecordingDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
