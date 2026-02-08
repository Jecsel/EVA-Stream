import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL!,
});

const PROJECT_ROOT = process.cwd();

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".cache", "dist", ".upm",
  ".config", ".local", "attached_assets",
]);

function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(PROJECT_ROOT, filePath);
  return resolved.startsWith(PROJECT_ROOT) && !resolved.includes("node_modules");
}

function listFilesRecursive(dir: string, prefix = "", maxDepth = 4, depth = 0): string[] {
  if (depth >= maxDepth) return [];
  if (!isPathSafe(dir || ".")) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(path.join(PROJECT_ROOT, dir), { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          results.push(`${relPath}/`);
          results.push(...listFilesRecursive(path.join(dir, entry.name), relPath, maxDepth, depth + 1));
        }
      } else {
        results.push(relPath);
      }
    }
  } catch {}
  return results;
}

const tools: Anthropic.Messages.Tool[] = [
  {
    name: "list_files",
    description: "List all files and directories in the project, or in a specific subdirectory. Returns file tree structure.",
    input_schema: {
      type: "object" as const,
      properties: {
        directory: {
          type: "string",
          description: "Subdirectory to list (e.g., 'server', 'client/src'). Leave empty for project root.",
        },
      },
      required: [],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a source code file. Use this to understand code, find bugs, or analyze implementation details.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file relative to project root (e.g., 'server/routes.ts', 'client/src/App.tsx')",
        },
        start_line: {
          type: "number",
          description: "Optional: start reading from this line number (1-indexed)",
        },
        end_line: {
          type: "number",
          description: "Optional: stop reading at this line number",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "search_code",
    description: "Search for a text pattern or regex across all source code files in the project. Returns matching lines with file paths and line numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Text or regex pattern to search for",
        },
        file_glob: {
          type: "string",
          description: "Optional: limit search to files matching this glob (e.g., '*.ts', '*.tsx')",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "query_database",
    description: "Execute a READ-ONLY SQL query against the PostgreSQL development database. Use this to inspect data, check table contents, or debug database issues. Only SELECT queries are allowed.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "SQL SELECT query to execute. Only SELECT and information_schema queries are allowed.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_database_schema",
    description: "Get the database schema - lists all tables, their columns, and data types.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "read_logs",
    description: "Read the most recent application logs from the server. Shows recent API requests, errors, and system messages.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "number",
          description: "Number of recent log lines to retrieve (default: 50, max: 200)",
        },
        filter: {
          type: "string",
          description: "Optional: filter logs containing this text (e.g., 'error', 'POST /api')",
        },
      },
      required: [],
    },
  },
  {
    name: "get_project_overview",
    description: "Get a high-level overview of the project including package.json details, directory structure, and key configuration files.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  switch (name) {
    case "list_files": {
      const dir = input.directory || "";
      if (dir && !isPathSafe(dir)) return "Error: Access denied - path is outside project.";
      const files = listFilesRecursive(dir, dir);
      if (files.length === 0) return "No files found in the specified directory.";
      return files.join("\n");
    }

    case "read_file": {
      const filePath = input.file_path;
      if (!isPathSafe(filePath)) return "Error: Access denied - path is outside project.";
      const fullPath = path.join(PROJECT_ROOT, filePath);
      if (!fs.existsSync(fullPath)) return `Error: File not found: ${filePath}`;
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      const start = (input.start_line || 1) - 1;
      const end = input.end_line || lines.length;
      const slice = lines.slice(start, end);
      const numbered = slice.map((line, i) => `${start + i + 1}: ${line}`);
      if (numbered.length > 500) {
        return `File has ${lines.length} lines. Showing lines ${start + 1}-${Math.min(start + 500, end)}:\n\n${numbered.slice(0, 500).join("\n")}\n\n... (truncated, use start_line/end_line for more)`;
      }
      return numbered.join("\n");
    }

    case "search_code": {
      const { pattern, file_glob } = input;
      try {
        const { execFileSync } = await import("child_process");
        const args = ["-rn"];
        if (file_glob && /^[\w.*?]+$/.test(file_glob)) {
          args.push(`--include=${file_glob}`);
        } else {
          args.push("--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.jsx", "--include=*.json", "--include=*.css", "--include=*.html");
        }
        args.push("--exclude-dir=node_modules", "--exclude-dir=.git", "--exclude-dir=dist", "--exclude-dir=.cache");
        args.push("--", pattern, PROJECT_ROOT);
        const result = execFileSync("grep", args, { encoding: "utf-8", timeout: 10000, maxBuffer: 1024 * 1024 });
        const lines = result.split("\n").slice(0, 50);
        const cleaned = lines.join("\n").replace(new RegExp(PROJECT_ROOT + "/", "g"), "");
        return cleaned || "No matches found.";
      } catch {
        return "No matches found.";
      }
    }

    case "query_database": {
      const query = input.query.trim().toUpperCase();
      if (!query.startsWith("SELECT") && !query.startsWith("WITH") && !query.startsWith("EXPLAIN")) {
        return "Error: Only SELECT, WITH, and EXPLAIN queries are allowed for safety.";
      }
      try {
        const result = await db.execute(sql.raw(input.query));
        const rows = Array.isArray(result) ? result : (result as any).rows || [];
        if (rows.length === 0) return "Query returned 0 rows.";
        return JSON.stringify(rows.slice(0, 50), null, 2) + (rows.length > 50 ? `\n... (${rows.length - 50} more rows)` : "");
      } catch (error: any) {
        return `SQL Error: ${error.message}`;
      }
    }

    case "get_database_schema": {
      try {
        const result = await db.execute(sql`
          SELECT table_name, column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `);
        const rows = Array.isArray(result) ? result : (result as any).rows || [];
        const tables: Record<string, any[]> = {};
        for (const row of rows) {
          const tableName = (row as any).table_name;
          if (!tables[tableName]) tables[tableName] = [];
          tables[tableName].push({
            column: (row as any).column_name,
            type: (row as any).data_type,
            nullable: (row as any).is_nullable,
            default: (row as any).column_default,
          });
        }
        return JSON.stringify(tables, null, 2);
      } catch (error: any) {
        return `Error fetching schema: ${error.message}`;
      }
    }

    case "read_logs": {
      const maxLines = Math.min(input.lines || 50, 200);
      const filter = input.filter || "";
      try {
        const logFiles = ["/tmp/logs"];
        let logContent = "";
        
        const { execSync } = await import("child_process");
        try {
          const recentLogs = execSync(
            `journalctl --user -n ${maxLines} --no-pager 2>/dev/null || echo "No journal logs available"`,
            { encoding: "utf-8", timeout: 5000 }
          );
          logContent += recentLogs;
        } catch {}

        for (const logDir of logFiles) {
          if (fs.existsSync(logDir)) {
            const files = fs.readdirSync(logDir).filter(f => f.endsWith(".log")).sort().reverse();
            for (const file of files.slice(0, 3)) {
              const content = fs.readFileSync(path.join(logDir, file), "utf-8");
              const lines = content.split("\n");
              logContent += `\n--- ${file} ---\n`;
              logContent += lines.slice(-maxLines).join("\n");
            }
          }
        }

        if (filter && logContent) {
          const filtered = logContent.split("\n").filter(line => 
            line.toLowerCase().includes(filter.toLowerCase())
          );
          return filtered.length > 0 ? filtered.join("\n") : `No log lines matching "${filter}" found.`;
        }

        return logContent || "No logs available. The application logs are written to stdout/stderr.";
      } catch (error: any) {
        return `Error reading logs: ${error.message}`;
      }
    }

    case "get_project_overview": {
      const parts: string[] = [];

      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8"));
        parts.push("## package.json");
        parts.push(`Name: ${pkg.name || "N/A"}`);
        parts.push(`Scripts: ${Object.keys(pkg.scripts || {}).join(", ")}`);
        parts.push(`Dependencies: ${Object.keys(pkg.dependencies || {}).join(", ")}`);
        parts.push(`Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).join(", ")}`);
      } catch {}

      parts.push("\n## Project Structure");
      const topLevel = listFilesRecursive("", "", 2);
      parts.push(topLevel.join("\n"));

      if (fs.existsSync(path.join(PROJECT_ROOT, "replit.md"))) {
        const replitMd = fs.readFileSync(path.join(PROJECT_ROOT, "replit.md"), "utf-8");
        parts.push("\n## replit.md (first 100 lines)");
        parts.push(replitMd.split("\n").slice(0, 100).join("\n"));
      }

      return parts.join("\n");
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

const SYSTEM_PROMPT = `You are a Developer AI Agent for the VideoAI (EVA Stream) project. You are an expert software engineer embedded directly in the codebase with full access to:

1. **Source Code** - You can read any file, search code, and list the project structure
2. **Database** - You can query the PostgreSQL database to inspect data, check tables, and debug issues
3. **Logs** - You can read application logs to diagnose runtime issues
4. **Project Context** - You understand the full project architecture

## Your Capabilities:
- Read and analyze source code files
- Search across the codebase for patterns, function definitions, or bugs
- Query the database to inspect data and schema
- Read application logs for debugging
- Explain code architecture and suggest improvements
- Help debug issues by correlating code, data, and logs
- Provide code suggestions and best practices

## Important Guidelines:
- Always use your tools to look at actual code before answering questions about the codebase
- When asked about data, query the database rather than guessing
- Be specific and reference actual file paths and line numbers
- If you're unsure, say so rather than making things up
- Keep responses concise but thorough
- Format code blocks with appropriate language tags
- When the user mentions what they see on screen, correlate it with the actual code and data

## Project Context:
This is a Jitsi-powered video conferencing platform (VideoAI/EVA Stream) with:
- React 18 frontend with TypeScript, Tailwind CSS, shadcn/ui
- Node.js/Express backend with TypeScript
- PostgreSQL database with Drizzle ORM
- AI integrations (Gemini for analysis, ElevenLabs for voice)
- WebSocket for real-time AI communication
- Admin panel for managing agents, prompts, users`;

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamCallbacks {
  onText: (text: string) => void;
  onToolUse: (toolName: string, input: Record<string, any>) => void;
  onToolResult: (toolName: string, result: string) => void;
  onDone: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

export async function runDevAgent(
  messages: AgentMessage[],
  screenContext: string | null,
  callbacks: StreamCallbacks
): Promise<void> {
  const systemPrompt = screenContext
    ? `${SYSTEM_PROMPT}\n\n## Current Screen Context:\nThe user is currently looking at: ${screenContext}`
    : SYSTEM_PROMPT;

  const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  let fullResponse = "";
  let continueLoop = true;

  while (continueLoop) {
    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        tools,
        messages: anthropicMessages,
      });

      let currentToolName = "";
      let currentToolInput = "";
      let currentToolId = "";
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      let hasToolUse = false;

      const response = await stream.finalMessage();

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          callbacks.onText(block.text);
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          currentToolName = block.name;
          currentToolId = block.id;
          const toolInput = block.input as Record<string, any>;
          
          callbacks.onToolUse(currentToolName, toolInput);

          const result = await executeTool(currentToolName, toolInput);
          callbacks.onToolResult(currentToolName, result);

          toolResults.push({
            type: "tool_result",
            tool_use_id: currentToolId,
            content: result,
          });
        }
      }

      if (hasToolUse) {
        anthropicMessages.push({ role: "assistant", content: response.content });
        anthropicMessages.push({ role: "user", content: toolResults });
      } else {
        continueLoop = false;
      }

      if (response.stop_reason === "end_turn") {
        continueLoop = false;
      }
    } catch (error: any) {
      callbacks.onError(error);
      continueLoop = false;
    }
  }

  callbacks.onDone(fullResponse);
}
