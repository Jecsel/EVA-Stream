import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { GitGraph, RefreshCw, Maximize, Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface SOPFlowchartProps {
  sopContent: string;
  className?: string;
}

export function SOPFlowchart({ sopContent, className }: SOPFlowchartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
  const [lastProcessedContent, setLastProcessedContent] = useState<string>('');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

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

  const renderMermaidChart = useCallback(async (mermaidCode: string) => {
    try {
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, mermaidCode);
      setSvgContent(svg);
    } catch (error) {
      console.error('Failed to render mermaid chart:', error);
    }
  }, []);

  const generateFlowchartFromAPI = useCallback(async (content: string) => {
    if (!content || content.trim().length < 20) {
      const defaultChart = 'graph TD\n    Start(("Start Meeting"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> End';
      await renderMermaidChart(defaultChart);
      setLastProcessedContent(content);
      return;
    }

    setIsUpdating(true);
    try {
      const response = await api.generateFlowchart(content);
      await renderMermaidChart(response.mermaidCode);
    } catch (error) {
      console.error('Failed to generate flowchart:', error);
      const errorChart = 'graph TD\n    Start(("Start"))\n    style Start fill:#1967D2,stroke:none,color:#fff\n    Error["Error generating flowchart"]\n    style Error fill:#EA4335,stroke:none,color:#fff\n    End(("End"))\n    style End fill:#34A853,stroke:none,color:#fff\n    Start --> Error --> End';
      await renderMermaidChart(errorChart);
    } finally {
      setLastProcessedContent(content);
      setIsUpdating(false);
    }
  }, [renderMermaidChart]);

  useEffect(() => {
    if (!containerRef.current) return;
    
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
  }, [sopContent, lastProcessedContent, generateFlowchartFromAPI]);

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
