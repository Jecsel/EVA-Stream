import { useCallback, useEffect, useState } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Connection,
  Edge,
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitGraph, RefreshCw, ZoomIn, ZoomOut, Maximize, Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface SOPFlowchartProps {
  sopContent: string;
  className?: string;
}

// Initial mock nodes
const initialNodes = [
  { 
    id: '1', 
    position: { x: 100, y: 50 }, 
    data: { label: 'Start Meeting' },
    type: 'input',
    style: { 
        background: 'hsl(var(--primary))', 
        color: 'white', 
        border: 'none', 
        borderRadius: '8px',
        width: 150,
        fontSize: '12px',
        fontWeight: 'bold'
    }
  },
  { 
    id: '2', 
    position: { x: 100, y: 150 }, 
    data: { label: 'Define Objectives' },
    style: { 
        background: 'hsl(var(--card))', 
        color: 'hsl(var(--foreground))', 
        border: '1px solid hsl(var(--border))', 
        borderRadius: '8px',
        width: 150,
        fontSize: '12px'
    }
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: 'hsl(var(--muted-foreground))' } },
];

export function SOPFlowchart({ sopContent, className }: SOPFlowchartProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isUpdating, setIsUpdating] = useState(false);

  // Parse SOP content to generate nodes (Simple Mock Parser)
  useEffect(() => {
    if (!sopContent) return;
    
    setIsUpdating(true);
    const timeout = setTimeout(() => {
        const lines = sopContent.split('\n');
        const newNodes = [];
        const newEdges = [];
        
        let yPos = 50;
        let lastNodeId: string | null = null;
        let idCounter = 1;

        // Always start with "Start"
        newNodes.push({
            id: 'start',
            position: { x: 100, y: yPos },
            data: { label: 'Start Meeting' },
            type: 'input',
            style: { 
                background: 'hsl(var(--primary))', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                width: 150,
                fontSize: '12px',
                fontWeight: 'bold'
            }
        });
        lastNodeId = 'start';
        yPos += 100;

        // Parse headers as major steps
        lines.forEach(line => {
            if (line.startsWith('## ')) {
                const label = line.replace('## ', '').trim();
                const id = `node-${idCounter++}`;
                
                newNodes.push({
                    id,
                    position: { x: 100, y: yPos },
                    data: { label },
                    style: { 
                        background: 'hsl(var(--card))', 
                        color: 'hsl(var(--foreground))', 
                        border: '1px solid hsl(var(--border))', 
                        borderRadius: '8px',
                        width: 150,
                        fontSize: '12px'
                    }
                });

                if (lastNodeId) {
                    newEdges.push({
                        id: `e${lastNodeId}-${id}`,
                        source: lastNodeId,
                        target: id,
                        animated: true,
                        style: { stroke: 'hsl(var(--muted-foreground))' },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: 'hsl(var(--muted-foreground))',
                        },
                    });
                }

                lastNodeId = id;
                yPos += 100;
            }
        });

        // Add "End" node
        const endId = 'end';
        newNodes.push({
            id: endId,
            position: { x: 100, y: yPos },
            data: { label: 'Next Steps' },
            type: 'output',
            style: { 
                background: 'hsl(var(--secondary))', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                width: 150,
                fontSize: '12px',
                fontWeight: 'bold'
            }
        });

        if (lastNodeId) {
            newEdges.push({
                id: `e${lastNodeId}-${endId}`,
                source: lastNodeId,
                target: endId,
                animated: true,
                style: { stroke: 'hsl(var(--muted-foreground))' },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: 'hsl(var(--muted-foreground))',
                },
            });
        }

        setNodes(newNodes);
        setEdges(newEdges);
        setIsUpdating(false);
    }, 1000); // Delay to visualize update

    return () => clearTimeout(timeout);
  }, [sopContent, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

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
                    <p className="text-xs text-orange-500">Syncing...</p>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">Live View</p>
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
      <div className="flex-1 bg-background/50 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="hsl(var(--muted-foreground))" gap={16} size={1} className="opacity-10" />
          <Controls className="bg-card border border-border text-foreground fill-foreground" />
        </ReactFlow>
      </div>
    </div>
  );
}
