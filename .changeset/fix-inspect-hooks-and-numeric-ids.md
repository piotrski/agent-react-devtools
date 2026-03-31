---
"agent-react-devtools": patch
---

Fix component inspection crash and unresolvable find results

- Fixed a crash in hook parsing that caused `get component` to silently time out on all components in affected apps
- Components outside the labeled tree range now show a usable ID (e.g. `@c?(id:667)`) in `find` results
