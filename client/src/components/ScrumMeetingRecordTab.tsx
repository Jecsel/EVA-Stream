import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Download, Copy, Check, Loader2, ChevronRight, Calendar, History } from "lucide-react";

interface ScrumMeetingRecordTabProps {
  meetingId: string;
}

export function ScrumMeetingRecordTab({ meetingId }: ScrumMeetingRecordTabProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [viewingRecordId, setViewingRecordId] = useState<string | null>(null);

  const { data: record, isLoading, error } = useQuery({
    queryKey: ["meetingRecord", meetingId],
    queryFn: () => api.getMeetingRecord(meetingId),
    enabled: !!meetingId,
    retry: (failureCount, error) => {
      if (error?.message?.includes("No meeting record found")) return false;
      return failureCount < 2;
    },
  });

  const is404 = error?.message?.includes("No meeting record found");

  const seriesId = record?.meetingSeriesId;
  const { data: seriesRecords = [] } = useQuery({
    queryKey: ["meetingRecordsSeries", seriesId],
    queryFn: () => api.getMeetingRecordsBySeries(seriesId!),
    enabled: !!seriesId,
  });

  const { data: viewingRecord } = useQuery({
    queryKey: ["meetingRecord", viewingRecordId],
    queryFn: () => api.getMeetingRecord(viewingRecordId!),
    enabled: !!viewingRecordId && viewingRecordId !== meetingId,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generateMeetingRecord(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetingRecord", meetingId] });
      toast.success("Meeting record generated successfully!");
    },
    onError: () => {
      toast.error("Failed to generate meeting record. Please try again.");
    },
  });

  const activeRecord = viewingRecordId && viewingRecordId !== meetingId ? viewingRecord : record;
  const documentContent = activeRecord?.document || activeRecord?.content || "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(documentContent);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([documentContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-record-${meetingId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Meeting record downloaded!");
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (is404 || (!record && !isLoading)) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden p-8">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
            <FileText className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">No Meeting Record Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Generate a Daily Scrum Meeting Record document from this meeting's data.
            </p>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
            data-testid="btn-generate-meeting-record"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generate Meeting Record
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  const showSeriesNav = seriesId && seriesRecords.length > 1 || record?.previousRecordId;

  return (
    <div className="space-y-4">
      {showSeriesNav && (
        <div
          className="bg-card border border-border rounded-xl overflow-hidden p-4"
          data-testid="meeting-series-nav"
        >
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold text-foreground">Meeting Series History</h4>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {seriesRecords.map((sr: any, idx: number) => {
              const isActive = viewingRecordId
                ? sr.meetingId === viewingRecordId
                : sr.meetingId === meetingId;
              const recordDate = sr.createdAt
                ? new Date(sr.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : `Record ${idx + 1}`;

              return (
                <div key={sr.id} className="flex items-center" data-testid={`meeting-record-item-${sr.id}`}>
                  {idx > 0 && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground mx-1 flex-shrink-0" />
                  )}
                  <button
                    onClick={() => setViewingRecordId(sr.meetingId)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                    }`}
                  >
                    <Calendar className="w-3 h-3" />
                    {recordDate}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-semibold text-foreground">Daily Scrum Meeting Record</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="text-xs"
              data-testid="btn-copy-meeting-record"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="text-xs"
              data-testid="btn-download-meeting-record"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[600px]">
          <div className="p-6" data-testid="meeting-record-content">
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground prose-table:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-th:border-border prose-td:border-border prose-hr:border-border">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {documentContent}
              </ReactMarkdown>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
