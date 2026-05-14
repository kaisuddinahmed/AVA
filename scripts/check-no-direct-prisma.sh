#!/usr/bin/env bash
# ============================================================================
# CI guard — direct Prisma access must stay inside packages/db/.
#
# Enforces CLAUDE.md hard rule: "All DB access through repositories — never
# call Prisma directly from a service."
#
# Catches:
#   import { prisma } from "@ava/db"           // static client import
#   from "@prisma/client"                      // bypass via prisma package
#   await import("@ava/db")                    // dynamic client import
#   prisma.<model>.<verb>(                     // any call site (top-level
#                                                 prisma var, possibly aliased)
#
# Excludes packages/db/ (where direct access is legitimate), any *.test.ts
# (tests may need direct access for fixture setup), and the explicit legacy
# allowlist below. Each allowlisted file has an open task to refactor — see
# Phase 0.8 in MEMORY.md / TaskList.
# ============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Legacy violations grandfathered in while we refactor — DO NOT ADD NEW ENTRIES.
# Each file has a tracking task; once refactored, remove the entry here.
LEGACY_ALLOWLIST=()

is_allowlisted() {
  local path="$1"
  for entry in "${LEGACY_ALLOWLIST[@]}"; do
    if [ "$path" = "$entry" ]; then return 0; fi
  done
  return 1
}

violations=0

scan() {
  local pattern="$1"
  local label="$2"
  echo "[check] Scanning for $label outside packages/db/..."
  while IFS=: read -r file line content; do
    [ -z "$file" ] && continue
    case "$file" in
      packages/db/*) continue ;;
      */dist/*) continue ;;
      *.test.ts|*.test.tsx) continue ;;
    esac
    if is_allowlisted "$file"; then
      echo "⚠️  (legacy, allowlisted) $file:$line"
    else
      echo "❌ $file:$line: $content"
      violations=$((violations + 1))
    fi
  done < <(grep -rEn "$pattern" --include="*.ts" --include="*.tsx" apps packages 2>/dev/null || true)
}

scan "import[^;]*\bprisma\b[^;]*from\s+['\"]@ava/db['\"]" "static prisma imports from @ava/db"
scan "from\s+['\"]@prisma/client['\"]"                    "@prisma/client imports"
scan "await\s+import\s*\(\s*['\"]@ava/db['\"]\s*\)"       "dynamic @ava/db imports"
scan "\bprisma\.[a-zA-Z]+\.[a-zA-Z]+\s*\("                 "raw prisma.<model>.<verb>() call sites"

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "Found $violations violation(s) of the repository-only DB access rule."
  echo "Move queries into a repository under packages/db/src/repositories/"
  echo "and import the repo (e.g., SessionRepo, EventRepo) from @ava/db instead."
  exit 1
fi

echo "✅ No direct Prisma access outside packages/db/"
