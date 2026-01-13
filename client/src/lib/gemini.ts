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

export function simulateGeminiAnalysis(content: string, isScreenSharing: boolean): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!isScreenSharing) {
        resolve("I'm listening. Since no screen is shared currently, I can only help with general questions or meeting notes.");
        return;
      }

      const keywords = content.toLowerCase();
      let responses = MOCK_GEMINI_RESPONSES.default;
      
      if (keywords.includes("code") || keywords.includes("bug") || keywords.includes("function")) {
        responses = MOCK_GEMINI_RESPONSES.code;
      } else if (keywords.includes("design") || keywords.includes("color") || keywords.includes("layout")) {
        responses = MOCK_GEMINI_RESPONSES.design;
      }

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      resolve(randomResponse);
    }, 1500);
  });
}
