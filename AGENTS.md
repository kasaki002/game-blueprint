# Project Documentation Rules

These rules apply to all changes in this repository.

## Documentation Check After Complete Changes

- After completing a coherent feature update, behavior change, bug fix, deployment change, API change, or configuration change, check whether `README.md` and `功能更新与问题修复.md` need synchronization.
- Before ending the task, explicitly tell the user whether documentation was updated. If it was not updated, ask whether they want the two documents synchronized.
- Update `README.md` only when the current usage, capabilities, architecture, setup, configuration, routes, or limitations described there have changed. Do not add chronological change history to `README.md`.
- Record feature updates and bug fixes in `功能更新与问题修复.md`. Every record must belong to an explicit `YYYY-MM-DD` date section.
- Keep date sections in reverse chronological order, with the newest date first. Append new entries inside today's existing section instead of creating duplicate date sections.
- Under each date, use only the applicable categories: `功能更新`, `问题修复`, `兼容性或配置变化`, and `验证结果`.
- Bug-fix entries must state the observed problem and the corrected behavior. Do not place undated bug fixes elsewhere in the document.
- If a task only reads, reviews, explains, or diagnoses without changing project behavior or files, no documentation prompt is required.

