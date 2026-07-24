# Repository Guidelines

## Project-wide Naming Conventions

These rules apply to all project-owned files, scripts, functions, and assets in this repository.

- Use English-only names for scripts, source files, and assets. Player-facing text may remain localized.
- Use PascalCase for file stems, project-owned function names, and descriptive asset-name segments.
- Use lowerCamelCase for variables, parameters, and local bindings.
- Do not use hyphens (`-`) in project-owned names. When a separator is necessary, use an underscore (`_`).
- Asset filenames must expose their category with the form `<Category>_<DescriptivePascalCase>.<ext>`.
- Use these category prefixes unless a more specific category is agreed first: `Model_`, `Texture_`, `Icon_`, `AudioBgm_`, `AudioSfx_`, `Scene_`, `Script_`, `Shader_`, `Material_`, `Animation_`, `Font_`, and `Data_`.
- Keep the extension lowercase unless a tool requires otherwise.
- Before introducing a new asset category, agree on its English prefix and document it here.
- Engine-mandated callbacks, virtual methods, signal handlers, generated metadata, and third-party/vendor files may retain the exact spelling required by their owner. Do not rename those in a way that breaks engine discovery, imports, or licenses.
- Apply these conventions to every new name and to any project-owned name being deliberately renamed. Do not perform unrelated bulk renames without validating every reference and import.

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

## GravityTank / GitHub Pages

- Site deploys from **`master` only** (`https://bentleyblanks.github.io/GravityTank/`). Draft PR stacks do not ship.
- GravityTank commit subjects use `GravityTank: short change summary` (same style as Sophia: prefix + space, no Conventional Commit prefixes, no trailing period).
- Bump `GravityTank/index.html` cache-bust (`Script_Game.mjs?v=…`) whenever game scripts/assets change for Pages.

### Small requests: merge to master yourself

- For small player-facing / copy / balance / bugfix asks (blurbs, RULE text, cache-bust, minor tweaks): **do not leave work sitting in an open draft PR**.
- Agent workflow: branch → commit → push → open PR → **merge into `master` yourself** → confirm Pages is live (or at least that the merge landed) before treating the task as done.
- Do not wait for the user to merge “小需求”. Unmerged draft stacks that block Pages have already burned trust—avoid repeating that.
- Larger multi-feature stacks may still use PRs for review, but unique shippable work must still reach `master` (port/merge) rather than rotting on stacked draft branches.

### Agent map

- GravityTank file ownership + symbol shortcuts: see `GravityTank/AGENTS.md` (prefer that over dumping `Script_Game.mjs`).

## BehindTheLines Documentation

- `BehindTheLines/` is the public documentation namespace for the private BehindTheLines Godot repository. Its canonical URL is `https://bentleyblanks.github.io/BehindTheLines/`.
- Keep `BehindTheLines/index.html` as the documentation home. Add future topic pages at `BehindTheLines/<EnglishPascalCase>/index.html` and link every new topic from the home page.
- Publish human-facing manuals as responsive HTML pages, not copied Markdown files from the private repository.
- Documentation pages must be self-contained or use public-safe assets already tracked in this website repository. Never copy or publish BehindTheLines `assets/audio/` content or any other restricted reference assets.
- Validate internal links and both desktop and mobile layout before publishing documentation updates.
