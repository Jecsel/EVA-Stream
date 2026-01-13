import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { GitGraph, RefreshCw, Maximize, Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface SOPFlowchartProps {
  sopContent: string;
  className?: string;
}

export function SOPFlowchart({ sopContent, className }: SOPFlowchartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'Google Sans, Roboto, sans-serif',
      flowchart: {
        curve: 'basis',
        padding: 20,
        nodeSpacing: 50,
        rankSpacing: 50,
        htmlLabels: true,
        useMaxWidth: true,
      }
    });
  }, []);

  // Convert SOP markdown to Mermaid syntax
  const generateMermaidSyntax = (content: string): string => {
    if (!content) return 'graph TD\nStart[Start]';

    const lines = content.split('\n');
    let graphDefinition = 'graph TD\n';
    
    // Add Start Node
    graphDefinition += `    Start(("Start Meeting"))\n`;
    graphDefinition += `    style Start fill:#1967D2,stroke:none,color:#fff\n`;
    
    let previousNodeId = 'Start';
    let idCounter = 1;

    lines.forEach(line => {
      // Look for H2 headers as main process steps
      if (line.trim().startsWith('## ')) {
        const label = line.replace('## ', '').trim();
        // Sanitize label for mermaid (remove special chars)
        const safeLabel = label.replace(/["'()]/g, '');
        const nodeId = `Step${idCounter}`;
        
        graphDefinition += `    ${nodeId}["${safeLabel}"]\n`;
        graphDefinition += `    ${previousNodeId} --> ${nodeId}\n`;
        
        // Add styling for standard nodes
        graphDefinition += `    style ${nodeId} fill:#292A2D,stroke:#3c4043,color:#E8EAED\n`;
        
        previousNodeId = nodeId;
        idCounter++;
      }
      // Look for bullet points as sub-actions or decisions
      else if (line.trim().startsWith('- ')) {
         const itemLabel = line.replace('- ', '').trim();
         // Optionally add these as sub-nodes or notes, keeping it simple for now as notes on the previous node would be complex
         // For a flowchart, let's keep it high-level based on headers to avoid clutter
      }
    });

    // Add End Node
    graphDefinition += `    End(("End"))\n`;
    graphDefinition += `    style End fill:#34A853,stroke:none,color:#fff\n`;
    graphDefinition += `    ${previousNodeId} --> End\n`;

    return graphDefinition;
  };

  useEffect(() => {
    if (!sopContent || !containerRef.current) return;

    const renderChart = async () => {
      setIsUpdating(true);
      try {
        const syntax = generateMermaidSyntax(sopContent);
        // Generate a unique ID for the SVG
        const id = `mermaid-${Date.now()}`;
        
        // Render the diagram
        const { svg } = await mermaid.render(id, syntax);
        setSvgContent(svg);
      } catch (error) {
        console.error('Failed to render mermaid chart:', error);
        // In case of error, we could show a fallback or retry
      } finally {
        setIsUpdating(false);
      }
    };

    // Debounce the rendering slightly to avoid flicker on fast typing
    const timeoutId = setTimeout(renderChart, 500);
    return () => clearTimeout(timeoutId);

  }, [sopContent]);

  return (
    <div className={`flex flex-col h-full bg-card border-l border-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <GitGraph className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">SOP Flow</h2>
            <div className="flex items-center gap-1.5">
                {isUpdating ? (
                    <>
                    <RefreshCw className="w-3 h-3 text-orange-500 animate-spin" />
                    <p className="text-xs text-orange-500">Rendering...</p>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">Mermaid.js</p>
                )}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Share2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Maximize className="w-4 h-4" />
            </Button>
        </div>
      </div>

      {/* Flowchart Area */}
      <div 
        ref={containerRef}
        className="flex-1 bg-background/50 relative overflow-auto p-4 flex items-center justify-center"
      >
        {svgContent && (
            <div 
                className="w-full h-full flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity"
                dangerouslySetInnerHTML={{ __html: svgContent }} 
            />
        )}
      </div>
    </div>
  );
}
