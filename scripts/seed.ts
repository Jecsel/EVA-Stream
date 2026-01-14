import { db } from "../db";
import { meetings, recordings } from "@shared/schema";

async function seed() {
  console.log("🌱 Seeding database...");

  // Create sample meetings
  const sampleMeetings = await db.insert(meetings).values([
    {
      title: "Q1 Planning Meeting",
      roomId: "q1-planning-2024",
      scheduledDate: new Date(Date.now() + 86400000), // Tomorrow
      status: "scheduled",
    },
    {
      title: "Product Design Review",
      roomId: "design-review-jan",
      scheduledDate: new Date(Date.now() + 172800000), // 2 days from now
      status: "scheduled",
    },
    {
      title: "Client Onboarding Call",
      roomId: "client-onboarding-acme",
      scheduledDate: new Date(Date.now() - 86400000), // Yesterday
      status: "completed",
    },
    {
      title: "Weekly Team Sync",
      roomId: "weekly-sync-jan-10",
      scheduledDate: new Date(Date.now() - 172800000), // 2 days ago
      status: "completed",
    },
  ]).returning();

  console.log(`✅ Created ${sampleMeetings.length} meetings`);

  // Create sample recordings for completed meetings
  const completedMeetings = sampleMeetings.filter(m => m.status === "completed");
  
  await db.insert(recordings).values([
    {
      meetingId: completedMeetings[0].id,
      title: completedMeetings[0].title,
      duration: "45:23",
      summary: "Discussed onboarding process for new client. Key decisions: implement 2-week training schedule, assign dedicated account manager, and schedule follow-up for next month.",
      sopContent: `# Client Onboarding SOP

## 1. Initial Contact
- Welcome email sent within 24 hours
- Schedule kickoff call
- Gather requirements

## 2. Training Schedule
- Week 1: Platform basics
- Week 2: Advanced features
- Ongoing support

## 3. Account Setup
- Assign account manager
- Configure permissions
- Set up integrations`,
    },
    {
      meetingId: completedMeetings[1].id,
      title: completedMeetings[1].title,
      duration: "32:15",
      summary: "Quick team updates on current sprint. No blockers reported. Next sprint planning scheduled for Friday.",
      sopContent: `# Weekly Sync SOP

## 1. Sprint Updates
- Each member shares progress
- Identify blockers
- Adjust timeline if needed

## 2. Planning
- Review upcoming tasks
- Set priorities
- Assign responsibilities`,
    },
  ]);

  console.log(`✅ Created ${completedMeetings.length} recordings`);
  console.log("🎉 Seeding completed!");
  
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
