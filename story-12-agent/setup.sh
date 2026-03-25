#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Story 12 — Conversational Shopping Agent: Full Setup Script
#
# Run from the project root:
#   chmod +x story-12-agent/setup.sh && ./story-12-agent/setup.sh
#
# What this does:
#   1. Copies all agent implementation files to their correct locations
#   2. Patches routes.ts  — registers /api/agent router
#   3. Patches ws-server.ts — wires agent_query WS message handler
#   4. Patches widget-shell.ts — instantiates AgentController
#   5. Runs Prisma migration for new Intervention fields
#   6. Runs the full project build
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }
step() { echo -e "\n${YELLOW}▶ $1${NC}"; }

STAGING="story-12-agent"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ─── 1. Copy implementation files ────────────────────────────────────────────
step "Copying agent implementation files"

copy() {
  src="$STAGING/$1"; dst="$2"
  if [ ! -f "$src" ]; then fail "Source not found: $src"; fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  ok "$dst"
}

copy "server/agent/agent.types.ts"            "apps/server/src/agent/agent.types.ts"
copy "server/agent/intent-parser.ts"          "apps/server/src/agent/intent-parser.ts"
copy "server/agent/product-search-adapter.ts" "apps/server/src/agent/product-search-adapter.ts"
copy "server/agent/shopping-agent.service.ts" "apps/server/src/agent/shopping-agent.service.ts"
copy "server/api/agent.api.ts"                "apps/server/src/api/agent.api.ts"
copy "widget/agent/agent.types.ts"            "apps/widget/src/agent/agent.types.ts"
copy "widget/agent/agent.controller.ts"       "apps/widget/src/agent/agent.controller.ts"
copy "widget/agent/intervention-handler.ts"   "apps/widget/src/agent/intervention-handler.ts"

# ─── 2. Patch routes.ts — register /api/agent ────────────────────────────────
step "Patching apps/server/src/api/routes.ts"

ROUTES="apps/server/src/api/routes.ts"
if [ ! -f "$ROUTES" ]; then fail "$ROUTES not found"; fi

AGENT_IMPORT="import { agentRouter } from './agent.api.js';"
AGENT_ROUTE="app.use('/api/agent', agentRouter);"

python3 - "$ROUTES" "$AGENT_IMPORT" "$AGENT_ROUTE" << 'PY'
import sys, re

path = sys.argv[1]
import_line = sys.argv[2]
route_line = sys.argv[3]

with open(path, 'r') as f:
    src = f.read()

changed = False

# Add import after last existing import block
if import_line not in src:
    # Find the last import statement
    last_import = max(
        (m.end() for m in re.finditer(r'^import\s.*?;?\s*$', src, re.MULTILINE)),
        default=0,
    )
    if last_import:
        src = src[:last_import] + '\n' + import_line + src[last_import:]
    else:
        src = import_line + '\n' + src
    changed = True

# Add route registration before the last app.listen() or export or end of file
if route_line not in src:
    # Try to insert before app.listen
    listen_match = re.search(r'\bapp\.listen\b', src)
    if listen_match:
        pos = listen_match.start()
        # Go back to start of line
        line_start = src.rfind('\n', 0, pos) + 1
        src = src[:line_start] + route_line + '\n' + src[line_start:]
    else:
        # Fallback: append before last closing brace or at end
        src = src.rstrip() + '\n\n' + route_line + '\n'
    changed = True

if changed:
    with open(path, 'w') as f:
        f.write(src)
    print(f"  Patched {path}")
else:
    print(f"  Already patched {path} (no changes needed)")
PY
ok "routes.ts patched"

# ─── 3. Patch ws-server.ts — wire agent_query handler ────────────────────────
step "Patching apps/server/src/broadcast/ws-server.ts"

WS_SERVER="apps/server/src/broadcast/ws-server.ts"
if [ ! -f "$WS_SERVER" ]; then
  warn "$WS_SERVER not found — skipping (add manually)"
else
python3 - "$WS_SERVER" << 'PY'
import sys, re

path = sys.argv[1]
with open(path, 'r') as f:
    src = f.read()

changed = False

IMPORT = "import { handleAgentWsMessage } from '../api/agent.api.js';"
HANDLER = """    case 'agent_query':
      await handleAgentWsMessage(ws, msg as Record<string, unknown>);
      break;"""

# Add import
if IMPORT not in src:
    last_import = max((m.end() for m in re.finditer(r'^import\s.*?;?\s*$', src, re.MULTILINE)), default=0)
    if last_import:
        src = src[:last_import] + '\n' + IMPORT + src[last_import:]
    else:
        src = IMPORT + '\n' + src
    changed = True

# Add case to switch — look for switch on msg.type or msg.event or similar
if "'agent_query'" not in src and '"agent_query"' not in src:
    # Find the switch block
    switch_match = re.search(r'switch\s*\([^)]*(?:type|event|action)[^)]*\)\s*\{', src)
    if switch_match:
        # Find the first case or default after the switch opening
        pos = switch_match.end()
        case_match = re.search(r'case\s+[\'"]', src[pos:])
        if case_match:
            insert_at = pos + case_match.start()
            src = src[:insert_at] + HANDLER + '\n' + src[insert_at:]
            changed = True
    else:
        # Append a comment with the handler — can't safely auto-wire without switch
        src += f'\n\n// TODO: add to your WS message handler:\n// {IMPORT}\n// case \'agent_query\': await handleAgentWsMessage(ws, msg); break;\n'
        changed = True

if changed:
    with open(path, 'w') as f:
        f.write(src)
    print(f"  Patched {path}")
else:
    print(f"  Already patched (no changes needed)")
PY
ok "ws-server.ts patched"
fi

# ─── 4. Patch widget-shell.ts — instantiate AgentController ──────────────────
step "Patching apps/widget/src/widget-shell.ts"

SHELL="apps/widget/src/widget-shell.ts"
if [ ! -f "$SHELL" ]; then
  warn "$SHELL not found — trying widget-shell.ts in src root"
  SHELL="apps/widget/src/widget-shell.ts"
fi

if [ ! -f "$SHELL" ]; then
  warn "Widget shell not found — skipping. Add AgentController manually per WIRING.md"
else
python3 - "$SHELL" << 'PY'
import sys, re

path = sys.argv[1]
with open(path, 'r') as f:
    src = f.read()

changed = False

IMPORT = "import { AgentController } from './agent/agent.controller.js';"
INIT = """  // ── Story 12: Shopping Agent ──────────────────────────────────────────────
  const agentController = new AgentController({
    ws: wsTransport,
    panel,
    sessionId: session.id,
    siteUrl: config.siteUrl,
    shopifyStorefrontToken: config.shopifyStorefrontToken,
    searchUrl: config.searchUrl,
    addToCartSelector: config.addToCartSelector,
    pageContextProvider: { getContext: () => ({ pageType: 'other', pageUrl: window.location.href }) },
    onTtsRequest: (text) => voiceManager?.speak(text),
  });
  // Connect voice transcript to agent
  if (typeof voiceManager !== 'undefined' && voiceManager) {
    const origOnTranscript = voiceManager.onTranscript;
    voiceManager.onTranscript = (text: string) => {
      agentController.handleVoiceInput(text);
      origOnTranscript?.(text);
    };
  }"""

if IMPORT not in src:
    last_import = max((m.end() for m in re.finditer(r'^import\s.*?;?\s*$', src, re.MULTILINE)), default=0)
    if last_import:
        src = src[:last_import] + '\n' + IMPORT + src[last_import:]
    else:
        src = IMPORT + '\n' + src
    changed = True

if 'agentController' not in src:
    # Find where the panel + wsTransport are both referenced together — that's the init zone
    # Look for voiceManager instantiation as a safe anchor
    voice_match = re.search(r'voiceManager\s*=\s*new\s+', src) or re.search(r'new\s+VoiceManager', src)
    if voice_match:
        # Insert after that line
        line_end = src.find('\n', voice_match.end())
        src = src[:line_end+1] + '\n' + INIT + '\n' + src[line_end+1:]
    else:
        # Fallback: append before closing brace of the init function / class
        src = src.rstrip()
        last_brace = src.rfind('}')
        if last_brace > 0:
            src = src[:last_brace] + '\n' + INIT + '\n' + src[last_brace:]
        else:
            src += '\n\n' + INIT + '\n'
    changed = True

if changed:
    with open(path, 'w') as f:
        f.write(src)
    print(f"  Patched {path}")
else:
    print(f"  Already patched (no changes needed)")
PY
ok "widget-shell.ts patched"
fi

# ─── 5. Prisma migration ──────────────────────────────────────────────────────
step "Running Prisma migration for agent fields"

DB_DIR="packages/db"
SCHEMA="$DB_DIR/prisma/schema.prisma"

if [ ! -f "$SCHEMA" ]; then
  warn "schema.prisma not found at $SCHEMA — skipping migration"
else
  # Append agent fields to Intervention model if not already there
  python3 - "$SCHEMA" << 'PY'
import sys, re

path = sys.argv[1]
with open(path, 'r') as f:
    src = f.read()

FIELDS = """  // Story 12 — agent action fields
  actionCode       String?
  intentRaw        String?
  intentAction     String?
  intentCategory   String?
  intentAttributes String?  // JSON: string[]
  productsShown    String?  // JSON: string[] of product IDs
  turnIndex        Int?
  latencyMs        Int?
"""

if 'intentRaw' in src:
    print("  Intervention model already has agent fields")
    sys.exit(0)

# Find the Intervention model closing brace
model_match = re.search(r'model\s+Intervention\s*\{([^}]*)\}', src, re.DOTALL)
if not model_match:
    print("  WARNING: Intervention model not found in schema — add fields manually")
    sys.exit(0)

# Insert fields before the closing brace
insert_pos = model_match.start(0) + model_match.group(0).rfind('}')
src = src[:insert_pos] + FIELDS + src[insert_pos:]

with open(path, 'w') as f:
    f.write(src)
print("  Added agent fields to Intervention model")
PY

  # Run the migration
  echo "  Running: cd $DB_DIR && npx prisma migrate dev --name add_agent_fields"
  (cd "$DB_DIR" && npx prisma migrate dev --name add_agent_fields --skip-generate) \
    && ok "Migration applied" \
    || warn "Migration failed — run manually: cd packages/db && npx prisma migrate dev --name add_agent_fields"
fi

# ─── 6. Build ─────────────────────────────────────────────────────────────────
step "Building project"

if command -v turbo &> /dev/null; then
  turbo build
elif [ -f "node_modules/.bin/turbo" ]; then
  node_modules/.bin/turbo build
else
  npm run build
fi

ok "Build complete"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Story 12 setup complete!                ║${NC}"
echo -e "${GREEN}║  Conversational Shopping Agent is live.  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "Next: start the dev server and test with:"
echo "  1. Open the widget on a Shopify storefront"
echo "  2. Say: \"I need trail running shoes, budget \$150\""
echo "  3. Say: \"Compare the first two\""
echo "  4. Say: \"Add that to my cart\""
