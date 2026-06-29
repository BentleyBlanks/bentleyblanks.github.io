# Repository Guidelines

## Commit Message Format

Use the project-prefixed commit subject style shown in the existing Sophia history.

For changes to `sophia-awakening`, commit subjects must use:

```text
Sophia: short change summary
```

Examples:

```text
Sophia: core-loop refactor - deterministic outcomes, 3 levers, option gates
Sophia: stage-scoped milestone list + center the version tag
Sophia: purge player-facing T0-T4 residue
```

Rules:

- Start with `Sophia:` exactly, including the colon and one following space.
- Keep the subject concise and action-oriented.
- Do not use Conventional Commit prefixes such as `feat:` or `fix:` for Sophia changes.
- Do not end the subject with a period.
- If a commit touches multiple areas, summarize the player-facing or highest-impact change first.
