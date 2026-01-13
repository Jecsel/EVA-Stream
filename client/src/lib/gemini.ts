export const MOCK_GEMINI_RESPONSES = {
  default: [
    "I can help you with that. Based on the screen, it looks like you're discussing quarterly goals.",
    "That's an interesting point. Would you like me to summarize the key takeaways so far?",
    "I've noticed a chart on the shared screen. It seems to show a 15% increase in Q3.",
    "Could you clarify what the 'Project Alpha' timeline refers to in this context?",
  ],
  code: [
    "The code snippet on screen seems to be a React component. You might want to wrap that `useEffect` dependency array.",
    "I see a potential performance issue in the loop on line 45. Consider memoizing that value.",
    "Here's a quick refactor suggestion for the shared function:\n```javascript\nconst simplified = () => {\n  return data.filter(Boolean);\n}\n```"
  ],
  design: [
    "The contrast ratio on that button might be too low for accessibility standards.",
    "Try adding more whitespace around the headline to improve readability.",
    "The color palette matches the brand guidelines perfectly. Nice work!"
  ]
};

const MOCK_SOP_TEMPLATES = {
    initial: `# Project Kickoff SOP

## 1. Meeting Objective
- Define core goals for Q3
- Assign roles and responsibilities

## 2. Attendees
- Project Manager
- Design Lead
- Lead Developer
`,
    update1: `
## 3. Key Decisions
- **Technology Stack**: React + Node.js selected for the MVP.
- **Design System**: Material UI will be used as the base.

## 4. Action Items
- [ ] Setup repo (Dev)
- [ ] Create Figma mockups (Design)
`
};

export function simulateGeminiAnalysis(content: string, isScreenSharing: boolean): Promise<{ message: string, sopUpdate?: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const keywords = content.toLowerCase();
      let message = MOCK_GEMINI_RESPONSES.default[Math.floor(Math.random() * MOCK_GEMINI_RESPONSES.default.length)];
      let sopUpdate = undefined;

      if (!isScreenSharing) {
        resolve({ 
            message: "I'm listening. Since no screen is shared currently, I can only help with general questions or meeting notes." 
        });
        return;
      }

      if (keywords.includes("code") || keywords.includes("bug") || keywords.includes("function")) {
        message = MOCK_GEMINI_RESPONSES.code[Math.floor(Math.random() * MOCK_GEMINI_RESPONSES.code.length)];
      } else if (keywords.includes("design") || keywords.includes("color") || keywords.includes("layout")) {
        message = MOCK_GEMINI_RESPONSES.design[Math.floor(Math.random() * MOCK_GEMINI_RESPONSES.design.length)];
      }

      // Simulate SOP updates based on "trigger" words or random chance for demo
      if (keywords.includes("record") || keywords.includes("note") || Math.random() > 0.7) {
          sopUpdate = MOCK_SOP_TEMPLATES.update1;
      }

      resolve({ message, sopUpdate });
    }, 1500);
  });
}
