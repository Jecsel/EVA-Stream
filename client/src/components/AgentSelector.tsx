import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, ChevronDown, Loader2, MessageSquare, Eye } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { Agent } from "@shared/schema";

interface AgentSelectorProps {
  meetingId: string;
  roomId: string;
  selectedAgents: string[];
  onAgentsChange: (agentIds: string[]) => void;
  isMeetingAssistantEnabled?: boolean;
  onMeetingAssistantChange?: (enabled: boolean) => void;
  isScreenObserverEnabled?: boolean;
  onScreenObserverChange?: (enabled: boolean) => void;
  className?: string;
}

export function AgentSelector({ 
  meetingId, 
  roomId,
  selectedAgents, 
  onAgentsChange,
  isMeetingAssistantEnabled = true,
  onMeetingAssistantChange,
  isScreenObserverEnabled = false,
  onScreenObserverChange,
  className = ""
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
  });

  const updateMutation = useMutation({
    mutationFn: (agentIds: string[]) => api.updateMeetingAgents(meetingId, agentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", roomId] });
    },
  });

  useEffect(() => {
    if (agents.length > 0 && selectedAgents.length === 0) {
      const defaultAgentIds = agents
        .filter(agent => agent.isDefault)
        .map(agent => agent.id);
      
      if (defaultAgentIds.length > 0) {
        onAgentsChange(defaultAgentIds);
      }
    }
  }, [agents]);

  const toggleAgent = (agentId: string) => {
    const newSelection = selectedAgents.includes(agentId)
      ? selectedAgents.filter(id => id !== agentId)
      : [...selectedAgents, agentId];
    
    onAgentsChange(newSelection);
    updateMutation.mutate(newSelection);
  };

  const getAgentIcon = (iconName: string | null | undefined) => {
    if (!iconName) return Bot;
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent || Bot;
  };

  const selectedCount = selectedAgents.length;
  const selectedAgentNames = agents
    .filter(a => selectedAgents.includes(a.id))
    .map(a => a.name)
    .slice(0, 2);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className={`gap-2 ${className}`}
          data-testid="button-agent-selector"
        >
          <Bot className="h-4 w-4" />
          <span className="hidden sm:inline">
            {selectedCount === 0 
              ? "Select Agents" 
              : selectedCount === 1 
                ? selectedAgentNames[0]
                : `${selectedAgentNames.join(", ")}${selectedCount > 2 ? ` +${selectedCount - 2}` : ""}`
            }
          </span>
          <span className="sm:hidden">
            {selectedCount > 0 ? selectedCount : "0"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b border-border">
          <h4 className="font-medium text-sm">Meeting Agents</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Select which AI agents to include in this call
          </p>
        </div>
        
        {/* EVA Assistant Toggles */}
        {onMeetingAssistantChange && onScreenObserverChange && (
          <div className="p-2 border-b border-border bg-muted/20">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2.5 mb-2">
              EVA Assistant
            </div>
            <div className="space-y-1">
              <div 
                className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${isMeetingAssistantEnabled ? 'bg-purple-500/10' : 'hover:bg-muted/50'}`}
                data-testid="toggle-meeting-assistant-row"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded flex items-center justify-center ${isMeetingAssistantEnabled ? 'bg-purple-500/20 text-purple-500' : 'bg-muted text-muted-foreground'}`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-medium text-sm">Meeting Assistant</span>
                    <p className="text-[10px] text-muted-foreground">Voice commands & Q&A</p>
                  </div>
                </div>
                <Switch
                  checked={isMeetingAssistantEnabled}
                  onCheckedChange={onMeetingAssistantChange}
                  className="scale-90"
                  data-testid="toggle-meeting-assistant"
                />
              </div>
              <div 
                className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${isScreenObserverEnabled ? 'bg-blue-500/10' : 'hover:bg-muted/50'}`}
                data-testid="toggle-screen-observer-row"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded flex items-center justify-center ${isScreenObserverEnabled ? 'bg-blue-500/20 text-blue-500' : 'bg-muted text-muted-foreground'}`}>
                    <Eye className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-medium text-sm">SOP Agent</span>
                    <p className="text-[10px] text-muted-foreground">Analyzes shared screens</p>
                  </div>
                </div>
                <Switch
                  checked={isScreenObserverEnabled}
                  onCheckedChange={onScreenObserverChange}
                  className="scale-90"
                  data-testid="toggle-screen-observer"
                />
              </div>
            </div>
          </div>
        )}
        
        <ScrollArea className="max-h-[280px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No agents available
            </div>
          ) : (
            <div className="p-2">
              {agents.map(agent => {
                const Icon = getAgentIcon(agent.icon);
                const isSelected = selectedAgents.includes(agent.id);
                
                return (
                  <div
                    key={agent.id}
                    className={`
                      flex items-start gap-3 p-2.5 rounded-lg cursor-pointer
                      transition-colors hover:bg-muted/50
                      ${isSelected ? "bg-primary/10" : ""}
                    `}
                    onClick={() => toggleAgent(agent.id)}
                    data-testid={`agent-option-${agent.id}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => toggleAgent(agent.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`
                          w-6 h-6 rounded flex items-center justify-center
                          ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}
                        `}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-medium text-sm">{agent.name}</span>
                        {agent.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      {agent.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {agent.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        
        {agents.length > 0 && (
          <div className="p-2 border-t border-border flex justify-between">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs"
              onClick={() => {
                onAgentsChange([]);
                updateMutation.mutate([]);
              }}
            >
              Clear All
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs"
              onClick={() => {
                const allIds = agents.map(a => a.id);
                onAgentsChange(allIds);
                updateMutation.mutate(allIds);
              }}
            >
              Select All
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
