# Severity & risk scales

**Bug severity:** `critical` = data loss/leak, broken key flow, or security hole; `high` = a major feature doesn't work; `medium` = degraded UX; `low` = cosmetic.

**Architect risk** (consolidation refactors) runs on its OWN scale (low / medium / high blast-radius) and is never merged into bug severity — a "high-risk refactor" is not a "critical bug".
