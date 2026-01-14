import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ArrowLeft, Clock, Calendar, FileText, GitBranch, Play, Sparkles, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#1967D2",
    primaryTextColor: "#fff",
    primaryBorderColor: "#3b82f6",
    lineColor: "#6b7280",
    secondaryColor: "#374151",
    tertiaryColor: "#1f2937",
  },
});

export default function RecordingDetail() {
  const [, params] = useRoute("/recording/:id");
  const recordingId = params?.id || "";
  const flowchartRef = useRef<HTMLDivElement>(null);
  const [renderedSopContent, setRenderedSopContent] = useState<string | null>(null);

  const { data: recording, isLoading, error } = useQuery({
    queryKey: ["recording", recordingId],
    queryFn: () => api.getRecording(recordingId),
    enabled: !!recordingId,
  });

  const generateFlowchartFromSOP = (sopContent: string): string => {
    const lines = sopContent.split("\n");
    const steps: string[] = [];
    let currentSection = "";
    
    for (const line of lines) {
      if (line.startsWith("## ")) {
        currentSection = line.replace("## ", "").replace(/^\d+\.\s*/, "").trim();
        if (currentSection && steps.length < 8) {
          steps.push(currentSection);
        }
      }
    }
    
    if (steps.length < 2) {
      return `flowchart TD
    A[Start] --> B[Meeting Recorded]
    B --> C[SOP Generated]
    C --> D[End]`;
    }
    
    let mermaidCode = "flowchart TD\n";
    const nodeIds = "ABCDEFGHIJ".split("");
    
    steps.forEach((step, i) => {
      const cleanStep = step.replace(/[[\]{}()]/g, "").substring(0, 30);
      mermaidCode += `    ${nodeIds[i]}[${cleanStep}]\n`;
    });
    
    for (let i = 0; i < steps.length - 1; i++) {
      mermaidCode += `    ${nodeIds[i]} --> ${nodeIds[i + 1]}\n`;
    }
    
    return mermaidCode;
  };

  useEffect(() => {
    if (!flowchartRef.current) return;
    
    if (!recording?.sopContent) {
      flowchartRef.current.innerHTML = `<p class="text-muted-foreground italic">No SOP content available to generate flowchart.</p>`;
      setRenderedSopContent(null);
      return;
    }
    
    if (recording.sopContent !== renderedSopContent) {
      const renderFlowchart = async () => {
        try {
          const flowchartCode = generateFlowchartFromSOP(recording.sopContent || "");
          flowchartRef.current!.innerHTML = "";
          const uniqueId = `flowchart-${Date.now()}`;
          const { svg } = await mermaid.render(uniqueId, flowchartCode);
          flowchartRef.current!.innerHTML = svg;
          setRenderedSopContent(recording.sopContent);
        } catch (err) {
          console.error("Failed to render flowchart:", err);
          flowchartRef.current!.innerHTML = `<p class="text-muted-foreground">Could not generate flowchart</p>`;
        }
      };
      renderFlowchart();
    }
  }, [recording?.sopContent, renderedSopContent]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Recording not found</p>
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Play className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-medium" data-testid="text-recording-title">{recording.title}</h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(recording.recordedAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {recording.duration}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-download-sop">
            <Download className="w-4 h-4 mr-2" />
            Export SOP
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6">
        <div className="bg-card/50 border border-border rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">AI Summary</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-ai-summary">
                {recording.summary || "No summary available for this recording."}
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="sop" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="sop" className="flex items-center gap-2" data-testid="tab-sop">
              <FileText className="w-4 h-4" />
              SOP Document
            </TabsTrigger>
            <TabsTrigger value="flowchart" className="flex items-center gap-2" data-testid="tab-flowchart">
              <GitBranch className="w-4 h-4" />
              Flowchart
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sop" className="mt-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Standard Operating Procedure
                </h2>
              </div>
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="p-6 prose prose-invert prose-sm max-w-none" data-testid="content-sop">
                  {recording.sopContent ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {recording.sopContent}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground italic">No SOP content was generated for this meeting.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="flowchart" className="mt-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  Process Flowchart
                </h2>
              </div>
              <div className="p-6 min-h-[400px] flex items-center justify-center" data-testid="content-flowchart">
                <div ref={flowchartRef} className="w-full overflow-x-auto flex justify-center" />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
