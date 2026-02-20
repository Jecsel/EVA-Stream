import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Download, Clock, Calendar, ArrowLeft, Share2, Check, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
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

const decodeHtmlEntities = (text: string): string => {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };
  return text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (match) => entities[match] || match);
};

interface PublicSOP {
  id: string;
  title: string;
  sopContent: string | null;
  flowchartCode: string | null;
  recordedAt: string;
  duration: string;
}

export default function SOPView() {
  const [, params] = useRoute("/sop/:id");
  const shareToken = params?.id || "";
  const flowchartRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("sop");
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: sop, isLoading, error } = useQuery<PublicSOP>({
    queryKey: ["public-sop", shareToken],
    queryFn: async () => {
      const res = await fetch(`/api/public/sop/${shareToken}`);
      if (!res.ok) throw new Error("SOP not found");
      return res.json();
    },
    enabled: !!shareToken,
  });

  useEffect(() => {
    if (sop?.flowchartCode && flowchartRef.current && activeTab === "flowchart") {
      const decoded = decodeHtmlEntities(sop.flowchartCode);
      flowchartRef.current.innerHTML = "";
      mermaid.render("flowchart-svg", decoded).then((result) => {
        if (flowchartRef.current) {
          flowchartRef.current.innerHTML = result.svg;
        }
      }).catch((err) => {
        console.error("Mermaid render error:", err);
        if (flowchartRef.current) {
          flowchartRef.current.innerHTML = `<p class="text-red-400">Failed to render flowchart</p>`;
        }
      });
    }
  }, [sop?.flowchartCode, activeTab]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleDownloadPDF = () => {
    if (!sop?.sopContent) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${sop.title} - SOP</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
            h1, h2, h3 { color: #1a1a2e; margin-top: 24px; }
            h1 { border-bottom: 2px solid #1967D2; padding-bottom: 8px; }
            ul, ol { padding-left: 24px; }
            li { margin: 8px 0; }
            code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; }
            pre { background: #f4f4f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
            blockquote { border-left: 4px solid #1967D2; margin: 16px 0; padding-left: 16px; color: #666; }
            table { border-collapse: collapse; width: 100%; margin: 16px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f4f4f5; }
          </style>
        </head>
        <body>
          <h1>${sop.title}</h1>
          <p style="color: #666; margin-bottom: 24px;">Generated: ${format(new Date(sop.recordedAt), "MMMM d, yyyy 'at' h:mm a")}</p>
          ${sop.sopContent.replace(/^# .+\n/, '').replace(/\n/g, '<br>')}
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleDownloadMD = () => {
    if (!sop?.sopContent) return;
    const blob = new Blob([sop.sopContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sop.title.replace(/\s+/g, "_")}_SOP.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SOP downloaded as Markdown");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#202124] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1967D2]"></div>
      </div>
    );
  }

  if (error || !sop) {
    return (
      <div className="min-h-screen bg-[#202124] flex flex-col items-center justify-center gap-4 p-4">
        <FileText className="w-16 h-16 text-gray-500" />
        <h1 className="text-2xl font-semibold text-white">SOP Not Found</h1>
        <p className="text-gray-400 text-center max-w-md">
          This SOP document may have been deleted or the link is invalid.
        </p>
        <Link href="/">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const hasContent = sop.sopContent && !sop.sopContent.includes("*Waiting for screen observations...*");

  return (
    <div className="min-h-screen bg-[#202124]">
      <header className="bg-[#292A2D] border-b border-[#3c4043] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#1967D2] flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{sop.title}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(sop.recordedAt), "MMM d, yyyy")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {sop.duration}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="border-[#3c4043] text-gray-300 hover:bg-[#3c4043]"
                data-testid="button-copy-sop-link"
              >
                {linkCopied ? <Check className="w-4 h-4 mr-1.5 text-green-500" /> : <Share2 className="w-4 h-4 mr-1.5" />}
                {linkCopied ? "Copied!" : "Share"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                className="border-[#3c4043] text-gray-300 hover:bg-[#3c4043]"
                disabled={!hasContent}
                data-testid="button-download-pdf"
              >
                <Download className="w-4 h-4 mr-1.5" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadMD}
                className="border-[#3c4043] text-gray-300 hover:bg-[#3c4043]"
                disabled={!hasContent}
                data-testid="button-download-md"
              >
                <Download className="w-4 h-4 mr-1.5" />
                MD
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-[#292A2D] border border-[#3c4043] mb-4">
            <TabsTrigger value="sop" className="data-[state=active]:bg-[#1967D2]" data-testid="tab-sop">
              <FileText className="w-4 h-4 mr-2" />
              SOP Document
            </TabsTrigger>
            {sop.flowchartCode && (
              <TabsTrigger value="flowchart" className="data-[state=active]:bg-[#1967D2]" data-testid="tab-flowchart">
                <GitBranch className="w-4 h-4 mr-2" />
                Flowchart
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="sop" className="mt-0">
            <div className="bg-[#292A2D] rounded-xl border border-[#3c4043] p-6">
              {hasContent ? (
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white prose-code:bg-[#3c4043] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-[#1f2937] prose-blockquote:border-l-[#1967D2] prose-blockquote:text-gray-400">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {sop.sopContent || ""}
                    </ReactMarkdown>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="w-16 h-16 text-gray-500 mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No SOP Content Yet</h3>
                  <p className="text-gray-400 max-w-md">
                    The SOP document hasn't been generated yet. It will appear here once the meeting includes screen observations.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {sop.flowchartCode && (
            <TabsContent value="flowchart" className="mt-0">
              <div className="bg-[#292A2D] rounded-xl border border-[#3c4043] p-6">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div 
                    ref={flowchartRef} 
                    className="flex items-center justify-center min-h-[400px] [&_svg]:max-w-full"
                  />
                </ScrollArea>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>

      <footer className="text-center py-4 text-sm text-gray-500">
        <p>Powered by VideoAI</p>
      </footer>
    </div>
  );
}
