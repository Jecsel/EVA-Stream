import { storage } from "./storage";

const defaultAgents = [
  {
    name: "SOP Generator",
    type: "sop",
    description: "Generates Standard Operating Procedures from meeting discussions and decisions",
    capabilities: ["Document generation", "Process documentation", "Step-by-step guides"],
    icon: "FileText",
    status: "active" as const,
    isDefault: true,
  },
  {
    name: "Flowchart Creator",
    type: "flowchart",
    description: "Creates visual flowcharts and process diagrams based on meeting content",
    capabilities: ["Visual diagrams", "Process flows", "Decision trees"],
    icon: "GitBranch",
    status: "active" as const,
    isDefault: false,
  },
  {
    name: "Meeting Analyst",
    type: "analysis",
    description: "Analyzes meeting content for insights, action items, and key decisions",
    capabilities: ["Sentiment analysis", "Key points extraction", "Action item tracking"],
    icon: "BarChart",
    status: "active" as const,
    isDefault: false,
  },
  {
    name: "Transcription Assistant",
    type: "transcription",
    description: "Provides accurate meeting transcription with speaker identification",
    capabilities: ["Real-time transcription", "Speaker diarization", "Timestamp tracking"],
    icon: "Mic",
    status: "active" as const,
    isDefault: false,
  },
];

function seedLog(message: string): void {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [seed] ${message}`);
}

export async function seedAgents(): Promise<void> {
  try {
    const existingAgents = await storage.listAgents();
    
    if (existingAgents.length > 0) {
      seedLog(`Found ${existingAgents.length} existing agents, skipping seed`);
      return;
    }

    seedLog("No agents found, seeding default agents...");
    
    for (const agent of defaultAgents) {
      await storage.createAgent(agent);
      seedLog(`Created agent: ${agent.name}`);
    }
    
    seedLog(`Successfully seeded ${defaultAgents.length} default agents`);
  } catch (error) {
    console.error("Failed to seed agents:", error);
  }
}
