# AI Development Team

This project uses a team of specialized AI agents coordinated by a Manager. Agents are defined as slash commands in `.claude/commands/`.

## Usage in Claude Code

```bash
# Start with the Manager for any task:
/project:manager "Add a settings page with user preferences"

# Or call specialists directly:
/project:frontend "Create a new SettingsPage component"
/project:backend  "Design the user preferences API endpoint"
/project:qa       "Review the SettingsPage for accessibility"
/project:docs     "Update CLAUDE.md with the new route"
```

## Agent Roles

| Agent | Command | Responsibility |
|-------|---------|---------------|
| **Manager** | `/project:manager` | Orchestrates tasks, creates execution plans, delegates to specialists |
| **Frontend Dev** | `/project:frontend` | React components, Tailwind styling, routing, UI/UX |
| **Backend Dev** | `/project:backend` | API design, database, auth, integrations |
| **QA Engineer** | `/project:qa` | Code review, testing, accessibility, performance |
| **Tech Writer** | `/project:docs` | CLAUDE.md, README, .cursorrules, JSDoc |
| **GitOps Engineer** | `/project:gitops` | Commits, branches, PRs, pipeline CI/CD, GitHub Actions |

## Workflow

1. Describe the task to the **Manager**
2. Manager creates an execution plan with phases
3. Each phase is executed by the appropriate specialist
4. QA reviews the output
5. Docs updates documentation if needed
