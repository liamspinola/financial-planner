# Golden Outputs

These files capture AI responses from the existing Claude CLI integration,
used as a quality baseline when migrating to Gemini (Plan 3).

During Plan 3 prompt regression testing, run the same 3 questions through
the new Gemini provider and compare output quality manually. Gemini output
should be comparable in accuracy, depth, and tone before Plan 3 is marked done.

Do NOT gitignore this directory — these files are the regression baseline.

Scenarios:
- scenario-1.txt: "What's my best strategy for paying off my debts?"
- scenario-2.txt: "How much interest will I save using the avalanche strategy compared to minimum payments?"
- scenario-3.txt: "If I put an extra £200 a month toward debt, when will I be debt-free?"

## How to capture

1. Start the app: `npm start` from the project root (uses SQLite + Claude CLI)
2. Open http://localhost:3000 with your real data loaded
3. Use the AI advisor to ask each question above
4. Copy the full response into the corresponding scenario-N.txt file
5. Commit: `git add server/ai/prompts/golden-outputs/ && git commit -m "chore: save golden AI output scenarios for Gemini regression testing"`
