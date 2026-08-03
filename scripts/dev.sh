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

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All dev servers started!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  🌐 Web:    ${BLUE}http://localhost:5173${NC}"
echo -e "  🔌 Relay:  ${BLUE}http://localhost:3000${NC}"
echo -e "  📱 Mobile: ${BLUE}http://localhost:5174${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Wait for all background processes
wait $WEB_PID $RELAY_PID $MOBILE_PID
