import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bot, ChevronDown, MessageSquare, FileText } from "lucide-react";

interface AgentSelectorProps {
  meetingId: string;
  roomId: string;
  selectedAgents: string[];
  onAgentsChange: (agentIds: string[]) => void;
  isScreenObserverEnabled?: boolean;
  onScreenObserverChange?: (enabled: boolean) => void;
  isCROEnabled?: boolean;
  onCROChange?: (enabled: boolean) => void;
  className?: string;
}

export function AgentSelector({ 
  isScreenObserverEnabled = false,
  onScreenObserverChange,
  isCROEnabled = false,
  onCROChange,
  className = ""
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);

  const getButtonText = () => {
    const enabledGenerators: string[] = [];
    if (isScreenObserverEnabled) enabledGenerators.push("SOP");
    if (isCROEnabled) enabledGenerators.push("CRO");
    
    if (enabledGenerators.length === 0) {
      return "Generators";
    } else if (enabledGenerators.length === 1) {
      return `${enabledGenerators[0]} Generator`;
    } else {
      return enabledGenerators.join(", ");
    }
  };

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
            {getButtonText()}
          </span>
          <span className="sm:hidden">
            {(isScreenObserverEnabled ? 1 : 0) + (isCROEnabled ? 1 : 0)}
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
        
        {/* EVA Assistant - Always On */}
        <div className="p-2 border-b border-border bg-muted/20">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2.5 mb-2">
            EVA Assistant
          </div>
          <div className="space-y-1">
            <div 
              className="flex items-center justify-between p-2.5 rounded-lg bg-purple-500/10"
              data-testid="toggle-meeting-assistant-row"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded flex items-center justify-center bg-purple-500/20 text-purple-500">
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="font-medium text-sm">Meeting Assistant</span>
                  <p className="text-[10px] text-muted-foreground">Voice commands & Q&A</p>
                </div>
              </div>
              <div className="px-2 py-0.5 bg-purple-500/20 text-purple-500 text-[10px] font-medium rounded-full">
                Always On
              </div>
            </div>
          </div>
        </div>
        
        {/* Generator Toggles */}
        {(onScreenObserverChange || onCROChange) && (
          <div className="p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2.5 mb-2">
              Generators
            </div>
            <div className="space-y-1">
              {onScreenObserverChange && (
                <div 
                  className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${isScreenObserverEnabled ? 'bg-blue-500/10' : 'hover:bg-muted/50'}`}
                  data-testid="toggle-screen-observer-row"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${isScreenObserverEnabled ? 'bg-blue-500/20 text-blue-500' : 'bg-muted text-muted-foreground'}`}>
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="font-medium text-sm">SOP Generator</span>
                      <p className="text-[10px] text-muted-foreground">Creates procedures from screens</p>
                    </div>
                  </div>
                  <Switch
                    checked={isScreenObserverEnabled}
                    onCheckedChange={onScreenObserverChange}
                    className="scale-90"
                    data-testid="toggle-screen-observer"
                  />
                </div>
              )}
              
              {onCROChange && (
                <div 
                  className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${isCROEnabled ? 'bg-green-500/10' : 'hover:bg-muted/50'}`}
                  data-testid="toggle-cro-agent-row"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${isCROEnabled ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="font-medium text-sm">CRO Generator</span>
                      <p className="text-[10px] text-muted-foreground">Creates role outcomes</p>
                    </div>
                  </div>
                  <Switch
                    checked={isCROEnabled}
                    onCheckedChange={onCROChange}
                    className="scale-90"
                    data-testid="toggle-cro-agent"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
