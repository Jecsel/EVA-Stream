import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquareCode, Send, X, Minimize2, Maximize2, Bot, User, Wrench, ChevronDown, Loader2, Terminal, Database, FileCode, FolderTree, Search, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
}

interface ToolCall {
  name: string;
  input: Record<string, any>;
  result?: string;
  status: "running" | "done";
}

const TOOL_ICONS: Record<string, any> = {
  read_file: FileCode,
  list_files: FolderTree,
  search_code: Search,
  query_database: Database,
  get_database_schema: Database,
  read_logs: ScrollText,
  get_project_overview: Terminal,
};

const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading file",
  list_files: "Listing files",
  search_code: "Searching code",
  query_database: "Querying database",
  get_database_schema: "Getting schema",
  read_logs: "Reading logs",
  get_project_overview: "Getting project info",
};

export function DevAgentWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const getCurrentScreenContext = (): string => {
    const path = window.location.pathname;
    const title = document.title;
    return `Page: ${path}, Title: ${title}, URL: ${window.location.href}`;
  };

  const toggleToolExpanded = (id: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendMessage = async (directMessage?: string) => {
    const messageText = directMessage || inputValue.trim();
    if (!messageText || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue("");
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      const apiMessages = updatedMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/dev-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          screenContext: getCurrentScreenContext(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case "text":
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.content }
                      : m
                  )
                );
                break;

              case "tool_use":
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? {
                          ...m,
                          toolCalls: [
                            ...(m.toolCalls || []),
                            { name: event.tool, input: event.input, status: "running" as const },
                          ],
                        }
                      : m
                  )
                );
                break;

              case "tool_result":
                setMessages(prev =>
                  prev.map(m => {
                    if (m.id !== assistantId) return m;
                    const tools = [...(m.toolCalls || [])];
                    const lastRunning = tools.findLastIndex(t => t.status === "running");
                    if (lastRunning >= 0) {
                      tools[lastRunning] = {
                        ...tools[lastRunning],
                        result: event.result,
                        status: "done" as const,
                      };
                    }
                    return { ...m, toolCalls: tools };
                  })
                );
                break;

              case "done":
                break;

              case "error":
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, content: m.content + `\n\nError: ${event.content}` }
                      : m
                  )
                );
                break;
            }
          } catch {}
        }
      }
    } catch (error: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Sorry, something went wrong: ${error.message}` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const widgetSize = isMaximized
    ? "fixed inset-4 z-[9999]"
    : "fixed bottom-6 right-6 w-[440px] h-[600px] z-[9999]";

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            data-testid="button-open-dev-agent"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg shadow-violet-500/25 flex items-center justify-center hover:shadow-violet-500/40 transition-shadow"
          >
            <MessageSquareCode className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={`${widgetSize} flex flex-col rounded-2xl border border-border/50 bg-zinc-950 shadow-2xl shadow-black/50 overflow-hidden`}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600/10 to-indigo-600/10 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white" data-testid="text-agent-title">Dev Agent</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] text-zinc-400">Claude powered</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  data-testid="button-toggle-maximize"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/10"
                  onClick={() => setIsMaximized(!isMaximized)}
                >
                  {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  data-testid="button-close-dev-agent"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/10"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-700/20 flex items-center justify-center">
                    <MessageSquareCode className="w-8 h-8 text-violet-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1" data-testid="text-welcome-title">Developer AI Agent</h4>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      I can read your source code, query your database, and check logs. Ask me anything about this project.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
                    {[
                      "What does this project do?",
                      "Show me the database tables",
                      "Find all API endpoints",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        data-testid={`button-suggestion-${suggestion.slice(0, 20).replace(/\s/g, "-")}`}
                        onClick={() => sendMessage(suggestion)}
                        className="text-left text-xs px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                    msg.role === "user"
                      ? "bg-blue-600/20 text-blue-400"
                      : "bg-violet-600/20 text-violet-400"
                  }`}>
                    {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`flex-1 min-w-0 ${msg.role === "user" ? "text-right" : ""}`}>
                    {msg.role === "user" ? (
                      <div className="inline-block text-sm text-white bg-blue-600/20 border border-blue-600/30 rounded-xl rounded-tr-sm px-3.5 py-2 max-w-[85%] text-left" data-testid={`text-user-msg-${msg.id}`}>
                        {msg.content}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="space-y-1.5">
                            {msg.toolCalls.map((tool, i) => {
                              const ToolIcon = TOOL_ICONS[tool.name] || Wrench;
                              const toolId = `${msg.id}-tool-${i}`;
                              const isExpanded = expandedTools.has(toolId);
                              return (
                                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                                  <button
                                    onClick={() => toggleToolExpanded(toolId)}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-zinc-800/50 transition-colors"
                                    data-testid={`button-tool-${tool.name}-${i}`}
                                  >
                                    {tool.status === "running" ? (
                                      <Loader2 className="w-3 h-3 text-amber-400 animate-spin flex-shrink-0" />
                                    ) : (
                                      <ToolIcon className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                    )}
                                    <span className="text-[11px] text-zinc-400 flex-1 truncate">
                                      {TOOL_LABELS[tool.name] || tool.name}
                                      {tool.input?.file_path && `: ${tool.input.file_path}`}
                                      {tool.input?.pattern && `: "${tool.input.pattern}"`}
                                      {tool.input?.query && `: ${tool.input.query.slice(0, 50)}...`}
                                    </span>
                                    <ChevronDown className={`w-3 h-3 text-zinc-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>
                                  {isExpanded && tool.result && (
                                    <div className="px-3 py-2 border-t border-zinc-800 max-h-40 overflow-auto">
                                      <pre className="text-[10px] text-zinc-500 whitespace-pre-wrap font-mono leading-relaxed" data-testid={`text-tool-result-${tool.name}-${i}`}>
                                        {tool.result}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {msg.content && (
                          <div className="text-sm text-zinc-300 prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-code:text-violet-400 prose-headings:text-white prose-p:text-zinc-300 prose-li:text-zinc-300 prose-a:text-violet-400" data-testid={`text-assistant-msg-${msg.id}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {!msg.content && msg.toolCalls?.every(t => t.status === "running") && (
                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analyzing...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-border/50 bg-zinc-950">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  data-testid="input-dev-agent-message"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? "Agent is thinking..." : "Ask about code, database, logs..."}
                  disabled={isStreaming}
                  rows={1}
                  className="flex-1 resize-none bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 disabled:opacity-50 min-h-[40px] max-h-[120px]"
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 120) + "px";
                  }}
                />
                <Button
                  data-testid="button-send-message"
                  onClick={() => sendMessage()}
                  disabled={!inputValue.trim() || isStreaming}
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 text-white disabled:opacity-30 flex-shrink-0"
                >
                  {isStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
