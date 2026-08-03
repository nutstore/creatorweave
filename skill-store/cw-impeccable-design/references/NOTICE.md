# Notice

This skill is a port of [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Copyright (c) Paul Bakaus and contributors), licensed under Apache License 2.0. The original work, including its design philosophy, the 23 command system, the anti-pattern detector rules, and the design critique framework, is the intellectual property of its original authors.

A copy of the Apache License 2.0 can be found in the upstream repository: https://github.com/pbakaus/impeccable/blob/main/LICENSE

In addition, portions of the iOS and Android platform design references are derived from [ehmo/platform-design-skills](https://github.com/ehmo/platform-design-skills) (MIT License).

## Modifications for CreatorWeave

This port:

- Replaces the `npx impeccable install` CLI flow with a pure-prompt skill.
- Replaces provider hooks (Claude Code / Cursor / Codex) with no-equivalent — CreatorWeave has no PostToolUse hook system, so detector rules are surfaced as design principles for the LLM to apply during review instead of being auto-run on edit.
- Replaces `npx impeccable live` browser iteration with the note that CreatorWeave is itself a browser IDE — the user opens files directly.
- Keeps the 23 commands, the 4 modes (Persuade/Operate/Read/Experience), the craft-floor absolute bans, and the anti-pattern list as the load-bearing content.
- Frontmatter adapted from Claude Code Skill format to CreatorWeave Skill format (name/description/category/tags/triggers).

## License

This port is distributed under the same Apache License 2.0 as the original. Attribution to Paul Bakaus and contributors is preserved.

## Port author

CreatorWeave AI assistant, 2026-07-31
