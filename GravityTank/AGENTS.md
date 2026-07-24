# GravityTank — Agent Map

Canonical play URL: `https://bentleyblanks.github.io/GravityTank/`  
Deploy branch: **`master` only**. Small fixes: branch → PR → **merge yourself**.

## Version

- Code: `GAME_VERSION` / `GAME_VERSION_LABEL` in `Script_Game.mjs`
- UI: `#gameVersion` (logo badge) + `#creditVersion` in `index.html`
- Bump both the constant and visible `vX.Y` text together; also bump `?v=` cache on `Script_Game.mjs` / `Style_Game.css` in `index.html`

## File map (read the smallest file that owns the change)

| Path | Own |
|------|-----|
| `index.html` | Shell UI, RULE copy, logo, cache-bust `?v=` |
| `Style_Game.css` | Layout, RULE list, logo version badge, touch HUD |
| `Script_Game.mjs` | Runtime: loop, tanks, bullets, roulette, bosses, FX (~7k lines — search symbols, don’t dump whole file) |
| `Data_Stages.mjs` | Stage maps, counts, barricade teach, flip HQ helpers |
| `Data_Upgrades.mjs` | Upgrade card pools + recommend flags |
| `Script_GenerateUpgradeArt.mjs` | Offline icon generator (not loaded by the game page) |
| `Script_GenerateCardFrames.mjs` | Offline card-frame generator |
| `assets/` | `Texture_*`, `Icon_*`, `Audio*`, fonts — naming per root `AGENTS.md` |

## High-traffic symbols in `Script_Game.mjs`

- Roulette: `ROULETTE_POOL`, `OpenRoulette`, `ResolveRoulette`, `DrawRoulette`, `ApplyPowerup`, `POWER_FX`
- Fort / HQ: `FortifyBase`, `BreakBaseFort`, `GetBaseFortCells`, `StartEagleAlly`, `StartEagleStroll`
- Barricades: `carryBlocks`, `carriedBlock`, `WantsInteract`, barricade teach stage id
- Bosses: `UpdateBoss`, `UpdateTankKing`, `UpdateTankMan`, `ArmBossSkill`
- Version: `GAME_VERSION`

## Do / don’t

- **Do** grep for a symbol / stage id before reading large chunks of `Script_Game.mjs`
- **Do** keep player-facing RULE text spoiler-free (no “第N关 Boss名” dumps)
- **Don’t** leave shippable GravityTank work on draft PR stacks off `master`
- **Don’t** split `Script_Game.mjs` casually mid-hotfix — module splits need import wiring + Pages smoke check

## Optional future splits (only when touching that area)

Suggested seams if/when the monolith must shrink: `Script_Roulette.mjs`, `Script_Bosses.mjs`, `Script_Barricade.mjs`, `Script_PowerFx.mjs` — extract with behavior-identical move, not a rewrite.
