## Skills
This repo expects agents to use local shared skills by reference (no vendored copies in this repo).

### Available skills (path references)
- cairo-contracts: /Users/kronosapiens/.agents/skills/cairo-contracts/SKILL.md
- cairo-deploy: /Users/kronosapiens/.agents/skills/cairo-deploy/SKILL.md
- cairo-testing: /Users/kronosapiens/.agents/skills/cairo-testing/SKILL.md
- cairo-security: /Users/kronosapiens/.agents/skills/cairo-security/SKILL.md
- cairo-optimization: /Users/kronosapiens/.agents/skills/cairo-optimization/SKILL.md
- controller-cli: /Users/kronosapiens/.agents/skills/controller-cli/SKILL.md
- frontend-design: /Users/kronosapiens/.agents/skills/frontend-design/SKILL.md
- find-skills: /Users/kronosapiens/.agents/skills/find-skills/SKILL.md

System skills (if present):
- skill-creator: /Users/kronosapiens/.codex/skills/.system/skill-creator/SKILL.md
- skill-installer: /Users/kronosapiens/.codex/skills/.system/skill-installer/SKILL.md

## Usage rules
- If a task clearly matches one of the skills above, use it.
- Read only the necessary sections of a skill file to complete the task.
- If a referenced skill path is missing/unreadable, continue with best-effort fallback and note it.

## Repository conventions for agents
- Favor minimal diffs and deterministic outputs.
- Keep generated artifacts out of git unless explicitly required.
- Prefer explicit scripts in `scripts/` over ad-hoc command sequences.
