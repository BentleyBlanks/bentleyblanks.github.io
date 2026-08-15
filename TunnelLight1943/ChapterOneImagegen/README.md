# TunnelLight1943 · Chapter One Imagegen runtime

> **⚠️ 冻结快照（2026-08-14 交付，不再维护）。**
> 这是第一章 ImageGen 美术版的一次性发布副本，与上级 `TunnelLight1943/`
> 已经分叉（Core/Art/World 各差两三千行），**不要在这棵树里修 bug、加功能、
> 或把这里的代码当正主引用**——正主永远是上级目录。搜索/grep 命中本目录时
> 一律跳过。真要基于它再发一版，先把美术差异合回主树再说。

This is an isolated, self-contained Chapter One release of the
TunnelLight1943 playable runtime. It preserves the complete current 23-beat
Chapter One sequence while restoring the ten approved concept states as live
visual targets. Rendering, mobile controls, depth handling, and platform
fixes are retained from the current runtime. The shell exposes only Chapter
One through its title, debug panel, URL entry, and `PLAYABLE_CHAPTERS = 1`
gate.

All browser persistence keys are isolated with the
`tunnelLight1943_chapterOneImagegen_` prefix. Runtime imports, data fetches,
audio URLs, textures, and video URLs resolve inside this sibling directory;
the parent TunnelLight1943 page is not a dependency.

The ten concept images are visual and performance targets, never background
plates. All characters, props, camera work, interactions, and animation remain
live. New or regenerated bitmap material is restricted to 1.5K; the accepted
runtime material is the 1536 x 1536 paper-charcoal texture.

Checks:

- `node TunnelLight1943/ChapterOneImagegen/Script_SmokeTest.mjs`
- `node TunnelLight1943/ChapterOneImagegen/Script_RenderHealthTest.mjs`
- `node TunnelLight1943/ChapterOneImagegen/Script_ChapterOneShots.mjs`
