import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { GitGraph, RefreshCw, Maximize, Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface SOPFlowchartProps {
  sopContent: string;
  meetingId?: string;
  className?: string;
  liveFlowchartCode?: string;
}

export function SOPFlowchart({ sopContent, meetingId, className, liveFlowchartCode }: SOPFlowchartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
  const [lastProcessedContent, setLastProcessedContent] = useState<string>('');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Static fallback SVG for when mermaid fails
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <rect x="25" y="25" width="150" height="50" rx="25" fill="#1967D2"/>
    <text x="100" y="55" text-anchor="middle" fill="white" font-family="sans-serif" font-size="12">Waiting for content...</text>
  </svg>`;

  // Cleanup mermaid error elements from the DOM
  const cleanupMermaidErrors = useCallback(() => {
    if (containerRef.current) {
      // Clean within container
      containerRef.current.querySelectorAll('.error-icon, .error-text, [class*="error"]').forEach(el => el.remove());
    }
    // Clean any orphaned mermaid error elements from body
    document.body.querySelectorAll('#d[id^="d"]:not([id*="mermaid"])').forEach(el => {
      if (el.textContent?.includes('Syntax error')) {
        el.remove();
      }
    });
    // Remove any floating error containers mermaid creates
    document.querySelectorAll('div[id^="d"]:not([id*="mermaid"])').forEach(el => {
      const text = el.textContent || '';
      if (text.includes('Syntax error') || text.includes('mermaid version')) {
        el.remove();
      }
    });
  }, []);

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
    
    // Set up periodic cleanup to catch any async error elements
    const cleanupInterval = setInterval(cleanupMermaidErrors, 500);
    
    return () => {
      clearInterval(cleanupInterval);
      cleanupMermaidErrors();
    };
  }, [cleanupMermaidErrors]);

  const renderMermaidChart = useCallback(async (mermaidCode: string) => {
    // Clean up any leftover mermaid error elements before rendering
    cleanupMermaidErrors();
    
    try {
      // First validate the mermaid syntax using parse
      await mermaid.parse(mermaidCode);
      
      // If parse succeeds, render the chart
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, mermaidCode);
      setSvgContent(svg);
      
      // Clean up after successful render just in case
      cleanupMermaidErrors();
    } catch (error) {
      console.error('Failed to render mermaid chart:', error);
      // Clean up any error elements mermaid created
      cleanupMermaidErrors();
      // Use static fallback SVG - don't call mermaid.render again to avoid re-triggering errors
      setSvgContent(fallbackSvg);
    }
  }, [cleanupMermaidErrors, fallbackSvg]);

  const generateFlowchartFromAPI = useCallback(async (content: string) => {
    if (!content || content.trim().length < 20) {
      const defaultChart = 'graph TD\n    Start(("Start Meeting"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> End';
      await renderMermaidChart(defaultChart);
      setLastProcessedContent(content);
      return;
    }

    setIsUpdating(true);
    try {
      const response = await api.generateFlowchart(content, meetingId);
      await renderMermaidChart(response.mermaidCode);
    } catch (error) {
      console.error('Failed to generate flowchart:', error);
      const errorChart = 'graph TD\n    Start(("Start"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    Error["Error generating flowchart"]\n    style Error fill:#EA4335,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> Error --> End';
      await renderMermaidChart(errorChart);
    } finally {
      setLastProcessedContent(content);
      setIsUpdating(false);
    }
  }, [renderMermaidChart, meetingId]);

  // Handle live flowchart code from real-time SOP updates
  useEffect(() => {
    if (liveFlowchartCode && liveFlowchartCode.trim().length > 0) {
      renderMermaidChart(liveFlowchartCode);
      setLastProcessedContent(sopContent);
    }
  }, [liveFlowchartCode, renderMermaidChart, sopContent]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Skip API call if we have live flowchart code
    if (liveFlowchartCode && liveFlowchartCode.trim().length > 0) return;
    
    if (sopContent === lastProcessedContent) return;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      generateFlowchartFromAPI(sopContent);
    }, 1500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [sopContent, lastProcessedContent, generateFlowchartFromAPI, liveFlowchartCode]);

  const handleManualRefresh = () => {
    setLastProcessedContent('');
    generateFlowchartFromAPI(sopContent);
  };

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
                    <p className="text-xs text-orange-500">Generating...</p>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">AI-powered</p>
                )}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleManualRefresh}
              disabled={isUpdating}
              data-testid="flowchart-refresh"
            >
                <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
            </Button>
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
