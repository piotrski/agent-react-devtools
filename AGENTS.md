# AGENTS.md

## Skills

A skill is a set of local instructions stored in a `SKILL.md` file.

### Available skills

- react-devtools: React DevTools CLI for AI agents. Use when debugging a React or React Native app at runtime, inspecting component props/state/hooks, diagnosing re-renders, or profiling performance. (file: `packages/agent-react-devtools/skills/react-devtools/SKILL.md`)

### How to use skills

- Trigger rule: Use `react-devtools` when the task is React runtime debugging or performance analysis.
- Invocation: Read `packages/agent-react-devtools/skills/react-devtools/SKILL.md` and follow its core workflow and command guidance.
