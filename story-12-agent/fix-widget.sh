#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fix-widget.sh — Wire AgentController into the widget shell (corrected path)
#
# Run from the project root:
#   chmod +x story-12-agent/fix-widget.sh && ./story-12-agent/fix-widget.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHELL_FILE="apps/widget/src/ui/widget-shell.ts"
if [ ! -f "$SHELL_FILE" ]; then
  fail "Cannot find $SHELL_FILE"
fi

echo -e "${YELLOW}▶ Patching $SHELL_FILE${NC}"

python3 - "$SHELL_FILE" << 'PY'
import sys, re

path = sys.argv[1]
with open(path, 'r') as f:
    src = f.read()

original = src
changed = False

IMPORT = "import { AgentController } from '../agent/agent.controller.js';"

# ── 1. Add import ─────────────────────────────────────────────────────────────
if IMPORT not in src:
    last_import = max(
        (m.end() for m in re.finditer(r'^import\s.*?[;\n]', src, re.MULTILINE)),
        default=0
    )
    if last_import:
        src = src[:last_import] + '\n' + IMPORT + src[last_import:]
    else:
        src = IMPORT + '\n' + src
    changed = True

# ── 2. Add AgentController instantiation ─────────────────────────────────────
if 'AgentController' not in src or 'new AgentController' not in src:
    INIT = '''
  // ── Story 12: Conversational Shopping Agent ───────────────────────────────
  const _agentCtrl = new AgentController({
    ws: wsTransport as unknown as { send(m: Record<string, unknown>): void; on(e: string, h: (d: Record<string, unknown>) => void): void; off(e: string, h: (d: Record<string, unknown>) => void): void },
    panel: panel as unknown as { appendMessage(role: 'user'|'assistant', content: string, extra?: HTMLElement|null): void; showTypingIndicator(): void; hideTypingIndicator(): void; scrollToBottom(): void; clearMessages(): void },
    sessionId: sessionId ?? crypto.randomUUID(),
    siteUrl: config?.siteUrl ?? window.location.origin,
    shopifyStorefrontToken: config?.shopifyStorefrontToken,
    searchUrl: config?.searchUrl,
    addToCartSelector: config?.addToCartSelector,
    pageContextProvider: { getContext: () => ({ pageType: 'other' as const, pageUrl: window.location.href }) },
    onTtsRequest: (text: string) => (voiceManager as unknown as { speak?: (t: string) => void })?.speak?.(text),
  });
'''

    # Anchor 1: find where voiceManager is first created/assigned
    vm_match = re.search(r'(new\s+VoiceManager[^;]+;|voiceManager\s*=\s*[^;]+;)', src)
    if vm_match:
        insert_pos = src.find('\n', vm_match.end()) + 1
        src = src[:insert_pos] + INIT + src[insert_pos:]
        changed = True
        print("  Inserted after VoiceManager instantiation")
    else:
        # Anchor 2: after Panel construction
        panel_match = re.search(r'(new\s+Panel[^;]+;|panel\s*=\s*new\s+\w+[^;]+;)', src)
        if panel_match:
            insert_pos = src.find('\n', panel_match.end()) + 1
            src = src[:insert_pos] + INIT + src[insert_pos:]
            changed = True
            print("  Inserted after Panel construction")
        else:
            # Fallback: before last closing brace of the exported function/class
            last_brace = src.rfind('}')
            if last_brace > 0:
                src = src[:last_brace] + INIT + '\n' + src[last_brace:]
                changed = True
                print("  Inserted before closing brace (fallback)")
            else:
                print("  WARNING: Could not find safe insertion point — add manually")
                print("  Add this to widget-shell.ts after wsTransport and panel are created:")
                print(INIT)

if changed:
    with open(path, 'w') as f:
        f.write(src)
    print(f"  Patched {path}")
else:
    print(f"  Already contains AgentController — no changes needed")
PY

ok "widget-shell.ts patched"

echo ""
echo -e "${YELLOW}▶ Rebuilding widget${NC}"
if [ -f "node_modules/.bin/turbo" ]; then
  node_modules/.bin/turbo build --filter=@ava/widget
elif command -v turbo &>/dev/null; then
  turbo build --filter=@ava/widget
else
  (cd apps/widget && npm run build)
fi
ok "Widget rebuilt"

echo ""
echo -e "${GREEN}Done. AgentController is now wired into the widget shell.${NC}"
