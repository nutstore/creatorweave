#!/bin/bash
# Start development servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color definitions
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting development servers...${NC}"
echo ""

cd "$PROJECT_ROOT"

# Trap SIGINT to kill all background processes
trap 'echo -e "\n${YELLOW}🛑 Stopping all servers...${NC}"; pkill -f "pnpm run dev" 2>/dev/null || true; exit 0' INT TERM

# Package skills first (generates dist/skills/manifest.json for SkillDiscover)
echo -e "${BLUE}📦 Packaging skills (manifest + zip)...${NC}"
cd "$PROJECT_ROOT" && bash scripts/pack-skills.sh

# Start web (port 5173)
echo -e "${BLUE}🌐 Starting web (http://localhost:5173)...${NC}"
cd "$PROJECT_ROOT/web" && pnpm run dev &
WEB_PID=$!

# Start relay-server (port 3000)
echo -e "${BLUE}🔌 Starting relay-server (http://localhost:3000)...${NC}"
cd "$PROJECT_ROOT/relay-server" && pnpm run dev &
RELAY_PID=$!

# Start mobile-web (port 5174)
echo -e "${BLUE}📱 Starting mobile-web (http://localhost:5174)...${NC}"
cd "$PROJECT_ROOT/mobile-web" && pnpm run dev --port 5174 &
MOBILE_PID=$!

# Ensure browser-extension dependencies are installed
if [ ! -d "$PROJECT_ROOT/browser-extension/node_modules" ]; then
  echo -e "${BLUE}📦 Installing browser-extension dependencies...${NC}"
  cd "$PROJECT_ROOT/browser-extension" && pnpm install
fi

# Start browser-extension dev server LAST.
# It must start after web's vite server, because vite-plugin-extension-serve's
# ensureExtensionBuilt() will run a PROD build (wxt build) if dist/chrome-mv3 is
# empty when an /extension/* request arrives. wxt dev clears+rebuilds that dir
# on startup — if it runs while web is serving, the PROD build can overwrite the
# DEV artifacts. Starting it last lets its DEV build win.
#
# stdin trick: WXT 0.19.29 dev server registers a readline on process.stdin
# (keyboard-shortcuts.mjs) to stay alive. In background mode stdin is closed
# by the parent shell, readline emits close, and the Node process exits — even
# though `isOngoing: true` is returned. We feed it a never-closing stdin via
# process substitution (a sleep loop) so the readline stays open.
echo -e "${BLUE}🧩 Starting browser-extension (wxt dev → dist/chrome-mv3)...${NC}"
cd "$PROJECT_ROOT/browser-extension" && pnpm run dev < <(while true; do sleep 3600; done) > /tmp/wxt-dev.log 2>&1 &
EXTENSION_PID=$!

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All dev servers started!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  🌐 Web:       ${BLUE}http://localhost:5173${NC}"
echo -e "  🔌 Relay:     ${BLUE}http://localhost:3000${NC}"
echo -e "  📱 Mobile:    ${BLUE}http://localhost:5174${NC}"
echo -e "  🧩 Extension: ${BLUE}wxt dev → dist/chrome-mv3 (DEV)${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Wait for all background processes
wait $WEB_PID $RELAY_PID $MOBILE_PID $EXTENSION_PID
