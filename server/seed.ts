import { storage } from "./storage";

const defaultAgents = [
  {
    name: "EVA Assistant",
    type: "eva",
    description: "Unified AI assistant that observes meetings, takes notes, generates SOPs, and answers questions in real-time",
    capabilities: ["Screen observation", "Meeting notes", "SOP generation", "Chat assistance", "Action item tracking"],
    icon: "Brain",
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
    name: "Meeting Transcriber",
    type: "transcription",
    description: "Provides accurate real-time speech-to-text transcription",
    capabilities: ["Real-time transcription", "Speaker identification", "Timestamp tracking"],
    icon: "Mic",
    status: "active" as const,
    isDefault: true,
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
