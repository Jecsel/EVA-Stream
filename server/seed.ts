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
    name: "Scrum Master",
    type: "scrum",
    description: "AI Scrum Master for daily standups and sprint meetings. Guides standup format, extracts per-person updates, tracks blockers, and generates structured action items.",
    capabilities: ["Standup facilitation", "Blocker tracking", "Action item extraction", "Per-person updates", "Sprint progress tracking", "Meeting summary"],
    icon: "Users",
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
    const existingNames = existingAgents.map(a => a.name);
    
    const agentsToCreate = defaultAgents.filter(a => !existingNames.includes(a.name));
    
    if (agentsToCreate.length === 0) {
      seedLog(`All ${defaultAgents.length} default agents already exist, skipping seed`);
      return;
    }

    seedLog(`Seeding ${agentsToCreate.length} new agent(s)...`);
    
    for (const agent of agentsToCreate) {
      await storage.createAgent(agent);
      seedLog(`Created agent: ${agent.name}`);
    }
    
    seedLog(`Successfully seeded ${agentsToCreate.length} agent(s)`);
  } catch (error) {
    console.error("Failed to seed agents:", error);
  }
}
