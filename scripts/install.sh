#!/usr/bin/env bash
#
# DockPanel Quick Installer (fork: latifangren/dockpanel, branch dev-muse-alpine)
# Usage: curl -sL https://raw.githubusercontent.com/latifangren/dockpanel/dev-muse-alpine/scripts/install.sh | bash
# (the upstream URL dockpanel.dev/install.sh installs the UPSTREAM panel, not this fork)
#
# Modes:
#   Default:              Clone repo, download pre-built binaries (fast, no Rust needed)
#   BUILD_FROM_SOURCE=1:  Clone repo, build from source (requires Rust, ~3GB RAM)
#
set -euo pipefail

VERSION="${DOCKPANEL_VERSION:-dev-muse-alpine}"
INSTALL_DIR="/opt/dockpanel"
REPO_URL="${DOCKPANEL_REPO:-https://github.com/latifangren/dockpanel.git}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${GREEN}${BOLD}DockPanel Installer${NC}"
echo -e "  Free, self-hosted server management panel"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Run as root — sudo bash or pipe to sudo bash${NC}"
    exit 1
fi

# Detect package manager
if command -v apt-get &> /dev/null; then
    PKG_INSTALL="apt-get install -y"
    PKG_UPDATE="apt-get update -y"
elif command -v dnf &> /dev/null; then
    PKG_INSTALL="dnf install -y"
    PKG_UPDATE="dnf check-update || true"
elif command -v yum &> /dev/null; then
    PKG_INSTALL="yum install -y"
    PKG_UPDATE="yum check-update || true"
elif command -v apk &> /dev/null; then
    # Alpine Linux / postmarketOS (DockPanel Lite). --no-cache keeps the
    # package cache off disk on small devices; the update step is a no-op
    # with --no-cache installs, so it is kept as a plain refresh here.
    PKG_INSTALL="apk add --no-cache"
    PKG_UPDATE="apk update"
else
    echo -e "${RED}Error: No supported package manager found (apt/dnf/yum/apk)${NC}"
    exit 1
fi

# Install git if needed
if ! command -v git &> /dev/null; then
    echo -e "${GREEN}[+]${NC} Installing git..."
    $PKG_UPDATE > /dev/null 2>&1
    $PKG_INSTALL git > /dev/null 2>&1
fi

# Clone or update repo
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${GREEN}[+]${NC} Updating existing installation..."
    if ! (cd "$INSTALL_DIR" && git pull --ff-only); then
        echo -e "${RED}[x] Git update failed (local changes?). Run: cd $INSTALL_DIR && git stash && git pull${NC}" >&2
        exit 1
    fi
else
    echo -e "${GREEN}[+]${NC} Downloading DockPanel Lite (${VERSION})..."
    rm -rf "$INSTALL_DIR"
    git clone --quiet --depth 1 -b "$VERSION" "$REPO_URL" "$INSTALL_DIR"
fi

# Default to lite mode and pre-built binaries. USE_LOCAL_FRONTEND stays 0
# (B10): reusing a local dist/ is explicit-only, so a stale build left in
# the cloned tree can never silently override the fresh release frontend.
export DOCKPANEL_LITE="${DOCKPANEL_LITE:-1}"
export USE_LOCAL_FRONTEND="${USE_LOCAL_FRONTEND:-0}"

if [ "${BUILD_FROM_SOURCE:-0}" != "1" ]; then
    export INSTALL_FROM_RELEASE=1
fi

# Run setup
echo -e "${GREEN}[+]${NC} Running setup..."
exec bash "$INSTALL_DIR/scripts/setup.sh"
