import { useState } from "react";
import { Check, AlertTriangle, FileText, GitBranch, AlertCircle, CheckCircle2, Clock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Sop } from "@shared/schema";
import { cn } from "@/lib/utils";

interface SOPViewerProps {
  sop: Sop;
  className?: string;
  onClose?: () => void;
}

type SopStatus = "draft" | "reviewed" | "approved";

const STATUS_CONFIG: Record<SopStatus, { icon: React.ComponentType<{ className?: string }>; label: string; color: string; bgColor: string }> = {
  draft: {
    icon: Pencil,
    label: "Draft",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  reviewed: {
    icon: Clock,
    label: "Reviewed",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  approved: {
    icon: CheckCircle2,
    label: "Approved",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
};

export function SOPViewer({ sop, className, onClose }: SOPViewerProps) {
  const queryClient = useQueryClient();
  const [currentStatus, setCurrentStatus] = useState<SopStatus>((sop.status || "draft") as SopStatus);
  const statusConfig = STATUS_CONFIG[currentStatus];
  const StatusIcon = statusConfig.icon;

  const mainFlow = (sop.mainFlow as { step: number; action: string; details?: string }[] | null) || [];
  const decisionPoints = (sop.decisionPoints as { condition: string; action: string }[] | null) || [];
  const exceptions = (sop.exceptions as { case: string; handling: string }[] | null) || [];
  const lowConfidenceSections = sop.lowConfidenceSections || [];
  const assumptions = sop.assumptions || [];

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: SopStatus) => api.updateSop(sop.id, { status: newStatus }),
    onSuccess: (updatedSop) => {
      setCurrentStatus((updatedSop.status || "draft") as SopStatus);
      queryClient.invalidateQueries({ queryKey: ["sops"] });
    },
  });

  const advanceStatus = () => {
    const nextStatus: Record<SopStatus, SopStatus> = {
      draft: "reviewed",
      reviewed: "approved",
      approved: "approved",
    };
    updateStatusMutation.mutate(nextStatus[currentStatus]);
  };

  return (
    <div className={cn("flex flex-col h-full bg-card", className)}>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg truncate">{sop.title}</h2>
          <Badge className={cn(statusConfig.bgColor, statusConfig.color, "border-0")}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Version {sop.version}</span>
          <span>•</span>
          <span>Last updated {new Date(sop.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {(lowConfidenceSections.length > 0 || assumptions.length > 0) && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-500">
              Human Review Required
            </span>
          </div>
          {lowConfidenceSections.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">Low confidence sections:</p>
              <ul className="text-xs space-y-1">
                {lowConfidenceSections.map((section, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                    <span>{section}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {assumptions.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Assumptions made:</p>
              <ul className="text-xs space-y-1">
                {assumptions.map((assumption, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-amber-500">•</span>
                    <span>{assumption}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {sop.goal && (
            <Section title="Goal" icon="🎯">
              <p className="text-sm">{sop.goal}</p>
            </Section>
          )}

          {sop.whenToUse && (
            <Section title="When to Use" icon="⏰">
              <p className="text-sm">{sop.whenToUse}</p>
            </Section>
          )}

          {sop.whoPerforms && (
            <Section title="Who Performs" icon="👤">
              <p className="text-sm">{sop.whoPerforms}</p>
            </Section>
          )}

          {sop.toolsRequired && sop.toolsRequired.length > 0 && (
            <Section title="Tools Required" icon="🛠️">
              <div className="flex flex-wrap gap-2">
                {sop.toolsRequired.map((tool, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {tool}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {mainFlow.length > 0 && (
            <Section title="Main Flow" icon="📋">
              <ol className="space-y-3">
                {mainFlow.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center shrink-0">
                      {step.step || i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{step.action}</p>
                      {step.details && (
                        <p className="text-xs text-muted-foreground mt-0.5">{step.details}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {decisionPoints.length > 0 && (
            <Section title="Decision Points" icon="⚖️" highlight>
              <div className="space-y-3">
                {decisionPoints.map((dp, i) => (
                  <Card key={i} className="bg-background/50">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GitBranch className="w-4 h-4 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm">
                            <span className="font-medium text-amber-500">If</span>{" "}
                            {dp.condition}
                          </p>
                          <p className="text-sm mt-1">
                            <span className="font-medium text-green-500">→</span>{" "}
                            {dp.action}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </Section>
          )}

          {exceptions.length > 0 && (
            <Section title="Exceptions" icon="⚠️">
              <div className="space-y-2">
                {exceptions.map((ex, i) => (
                  <div key={i} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <p className="text-sm font-medium text-red-400">{ex.case}</p>
                    <p className="text-xs text-muted-foreground mt-1">→ {ex.handling}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {sop.qualityCheck && (
            <Section title="Quality Check" icon="✅">
              <p className="text-sm">{sop.qualityCheck}</p>
            </Section>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            {(["draft", "reviewed", "approved"] as SopStatus[]).map((s, i) => {
              const config = STATUS_CONFIG[s];
              const Icon = config.icon;
              const isActive = s === currentStatus;
              const isPast = (["draft", "reviewed", "approved"] as SopStatus[]).indexOf(currentStatus) > i;
              
              return (
                <div key={s} className="flex items-center">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    isActive && config.bgColor,
                    isPast && "bg-green-500/20",
                    !isActive && !isPast && "bg-muted"
                  )}>
                    {isPast ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Icon className={cn("w-3 h-3", isActive ? config.color : "text-muted-foreground")} />
                    )}
                  </div>
                  {i < 2 && (
                    <div className={cn(
                      "w-4 h-0.5 mx-0.5",
                      isPast ? "bg-green-500" : "bg-muted"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {currentStatus !== "approved" && (
          <Button 
            onClick={advanceStatus} 
            size="sm" 
            disabled={updateStatusMutation.isPending}
            data-testid="button-advance-status"
          >
            {updateStatusMutation.isPending ? "Updating..." : (currentStatus === "draft" ? "Mark as Reviewed" : "Approve SOP")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({ 
  title, 
  icon, 
  children, 
  highlight 
}: { 
  title: string; 
  icon: string; 
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "space-y-2",
      highlight && "p-3 -mx-1 rounded-lg bg-primary/5 border border-primary/20"
    )}>
      <h3 className="text-sm font-medium flex items-center gap-2">
        <span>{icon}</span>
        {title}
        {highlight && (
          <Badge className="bg-primary/20 text-primary border-0 text-xs">
            Critical
          </Badge>
        )}
      </h3>
      {children}
    </div>
  );
}
