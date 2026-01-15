import { useState, useEffect } from "react";
import { FileText, Save, Download, RefreshCw, Edit3, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { motion } from "framer-motion";

interface SOPDocumentProps {
  content: string;
  className?: string;
  isUpdating?: boolean;
  onContentChange?: (content: string) => void;
}

export function SOPDocument({ content, className, isUpdating, onContentChange }: SOPDocumentProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [localContent, setLocalContent] = useState(content);

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  const handleContentChange = (newContent: string) => {
    setLocalContent(newContent);
    if (onContentChange) {
      onContentChange(newContent);
    }
  };

  const displayContent = onContentChange ? content : localContent;

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  return (
    <div className={`flex flex-col h-full bg-card border-l border-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-secondary/10 rounded-lg">
            <FileText className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Live SOP</h2>
            <div className="flex items-center gap-1.5">
              {isUpdating ? (
                <>
                  <RefreshCw className="w-3 h-3 text-secondary animate-spin" />
                  <p className="text-xs text-secondary">Updating...</p>
                </>
              ) : isEditMode ? (
                <p className="text-xs text-blue-400">Editing</p>
              ) : (
                <p className="text-xs text-muted-foreground">Auto-generated</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className={`h-8 w-8 ${isEditMode ? 'text-blue-400 bg-blue-400/10' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={toggleEditMode}
              data-testid="sop-edit-toggle"
            >
              {isEditMode ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Save className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Download className="w-4 h-4" />
            </Button>
        </div>
      </div>

      {/* Document Area */}
      <ScrollArea className="flex-1 p-6 bg-background/50">
        <div className="max-w-prose mx-auto bg-card border border-border/50 shadow-sm rounded-lg p-8 min-h-[500px]">
          {isEditMode ? (
            <Textarea
              value={displayContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Write your SOP content here... (Markdown supported)"
              className="w-full h-full min-h-[500px] bg-transparent border-none resize-none focus-visible:ring-0 text-sm font-mono"
              data-testid="sop-editor"
            />
          ) : (
            <article className="prose prose-invert prose-sm max-w-none">
                {displayContent ? (
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                    >
                        {displayContent}
                    </ReactMarkdown>
                ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground space-y-2 opacity-50">
                        <FileText className="w-8 h-8" />
                        <p>Waiting for meeting context...</p>
                    </div>
                )}
                
                {isUpdating && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }}
                        className="mt-4 flex items-center gap-2 text-xs text-secondary"
                    >
                        <span className="w-1 h-4 bg-secondary animate-pulse"/>
                        Generating new section...
                    </motion.div>
                )}
            </article>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
