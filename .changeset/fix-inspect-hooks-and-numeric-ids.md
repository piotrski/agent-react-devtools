---
"agent-react-devtools": patch
---

Fix inspectElement crash and make deep components accessible via find

Two bug fixes:

- **Dehydrated hooks crash**: `inspectElement` crashed with "hooks.map is not a function" when
  the React DevTools backend sent hooks as a dehydrated object
  `{ data: [...], cleaned: [...], unserializable: [...] }` instead of a plain array.
  This caused `get component` to silently time out for all components on affected apps.
  Fixed by extracting the array from either format before parsing.

- **Unresolved component labels**: `find` results showed `@c?` for components deep in the tree
  (beyond the labeled range), which could not be passed to `get component`. Now shows
  `@c?(id:667)` and `resolveId` handles this format, so `get component @c?(id:667)` works.
