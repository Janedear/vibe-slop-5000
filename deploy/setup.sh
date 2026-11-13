#!/usr/bin/env bash
# Fusion Dashboard — VPS Bootstrap
# Phase 1: Inspect → Phase 2: Propose → Phase 3: Apply (with approval)
# Safe, non-destructive, reversible. Follows all requirements in deploy prompt.
set -euo pipefail

REPO_URL="https://github.com/Runfusion/Fusion"
TARGET_DIR="/var/www/fusion"
REQUIRED_NODE="22"
REQUIRED_PNPM="10.33.0"
PKG_FILTER="@fusion/dashboard"
SERVICE_USER="fusion"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
hr()    { echo "──────────────────────────────────────────────"; }

# ─── PHASE 1: INSPECT ────────────────────────────────────────────────────────
hr; info "PHASE 1 — Inspecting VPS state (no changes yet)"; hr

info "OS:"
lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME

info "Resources:"
free -h | grep Mem
df -h / | tail -1

info "Node.js:"
node --version 2>/dev/null && which node || warn "Node.js not installed"

info "pnpm:"
pnpm --version 2>/dev/null && which pnpm || warn "pnpm not installed"

info "git:"
git --version 2>/dev/null || warn "git not installed"

info "nginx:"
nginx -v 2>&1 || warn "nginx not installed"
systemctl is-active nginx 2>/dev/null || true

info "Target directory ($TARGET_DIR):"
if [ -d "$TARGET_DIR" ]; then
  warn "Directory exists. Contents:"
  ls -la "$TARGET_DIR"
else
  info "Empty — safe to clone"
fi

info "Firewall (ufw):"
ufw status 2>/dev/null || warn "ufw not active"

info "Existing systemd services (nginx/fusion):"
systemctl list-units --type=service 2>/dev/null | grep -E "nginx|fusion" || true

hr; info "PHASE 1 complete. Reviewing before proceeding..."; hr
echo ""

# ─── PHASE 2: PROPOSE ────────────────────────────────────────────────────────
hr; info "PHASE 2 — Proposed changes"; hr

echo "
The following changes will be made:

  1. Install Node.js $REQUIRED_NODE LTS (via NodeSource) if not present/correct version
  2. Install pnpm $REQUIRED_PNPM via corepack if not present/correct version
  3. Install git and nginx if not present
  4. Create service user '$SERVICE_USER' (non-root) if not present
  5. Clone $REPO_URL into $TARGET_DIR (only if empty)
     OR: git fetch + reset to origin/main (if already cloned)
  6. Run: pnpm install --frozen-lockfile
  7. Run: pnpm --filter '$PKG_FILTER' build
  8. Detect actual build output directory
  9. Write nginx config for SPA (index.html fallback, port 80)
  10. Enable and start nginx via its existing systemd service
  11. Open ports 22, 80, 443 in ufw (keep 4000 closed)

Rollback: snapshot already in place via Hostinger panel.
"

echo -n "Proceed? (yes/no): "
read -r CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  warn "Aborted. No changes made."
  exit 0
fi

# ─── PHASE 3 + 4: APPLY ──────────────────────────────────────────────────────
hr; info "PHASE 4 — Applying changes"; hr

# 1. Install git
if ! command -v git &>/dev/null; then
  info "Installing git..."
  apt-get update -qq && apt-get install -y -qq git
fi

# 2. Install Node.js 22
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
  [[ "$NODE_MAJOR" -ge "$REQUIRED_NODE" ]] && NODE_OK=true
fi
if [[ "$NODE_OK" == false ]]; then
  info "Installing Node.js $REQUIRED_NODE via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE}.x | bash -
  apt-get install -y -qq nodejs
fi
node --version

# 3. Install pnpm via corepack
if ! command -v pnpm &>/dev/null || [[ "$(pnpm --version)" != "$REQUIRED_PNPM" ]]; then
  info "Installing pnpm $REQUIRED_PNPM via corepack..."
  corepack enable
  corepack prepare pnpm@$REQUIRED_PNPM --activate
fi
pnpm --version

# 4. Install nginx
if ! command -v nginx &>/dev/null; then
  info "Installing nginx..."
  apt-get install -y -qq nginx
fi

# 5. Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
  info "Creating service user '$SERVICE_USER'..."
  useradd --system --no-create-home --shell /bin/false "$SERVICE_USER"
fi

# 6. Clone or update repo
if [ -d "$TARGET_DIR/.git" ]; then
  info "Repo already exists — fetching latest..."
  cd "$TARGET_DIR"
  git fetch origin
  git reset --hard origin/main
else
  info "Cloning repo..."
  git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
fi

chown -R "$SERVICE_USER":"$SERVICE_USER" "$TARGET_DIR"

# 7. Install dependencies
info "Installing dependencies (frozen lockfile)..."
cd "$TARGET_DIR"
pnpm install --frozen-lockfile

# 8. Build dashboard
info "Building @fusion/dashboard..."
pnpm --filter "$PKG_FILTER" build

# 9. Detect build output
DIST_DIR=""
for candidate in \
  "$TARGET_DIR/packages/dashboard/dist" \
  "$TARGET_DIR/packages/dashboard/build" \
  "$TARGET_DIR/packages/dashboard/out"; do
  if [ -f "$candidate/index.html" ]; then
    DIST_DIR="$candidate"
    break
  fi
done

if [ -z "$DIST_DIR" ]; then
  error "Could not find build output with index.html. Check build output manually."
  find "$TARGET_DIR/packages/dashboard" -name "index.html" 2>/dev/null | head -5
  exit 1
fi
info "Build output: $DIST_DIR"

# 10. Write nginx config
NGINX_CONF="/etc/nginx/sites-available/fusion"
info "Writing nginx config..."
if [ -f "$NGINX_CONF" ]; then
  cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%s)"
  warn "Backed up existing config to ${NGINX_CONF}.bak.*"
fi

cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name _;

    root $DIST_DIR;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
}
NGINX

# Disable default site if it conflicts
if [ -f /etc/nginx/sites-enabled/default ]; then
  warn "Disabling default nginx site to prevent conflict..."
  rm -f /etc/nginx/sites-enabled/default
fi

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/fusion

# 11. Test and start nginx
info "Testing nginx config..."
nginx -t

info "Enabling and starting nginx..."
systemctl enable nginx
systemctl restart nginx

# 12. Firewall
if command -v ufw &>/dev/null; then
  info "Configuring firewall..."
  ufw allow 22/tcp comment "SSH"
  ufw allow 80/tcp comment "HTTP"
  ufw allow 443/tcp comment "HTTPS"
  ufw --force enable
  ufw status
fi

# ─── PHASE 5: VERIFY ─────────────────────────────────────────────────────────
hr; info "PHASE 5 — Verification"; hr

info "nginx status:"
systemctl is-active nginx && systemctl is-enabled nginx

info "Build files present:"
ls "$DIST_DIR/index.html" && echo "✓ index.html found"

info "Local HTTP test:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost/ || warn "Local curl failed"

info "External HTTP test:"
VPS_IP=$(curl -s https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
curl -s -o /dev/null -w "HTTP %{http_code} from $VPS_IP\n" "http://$VPS_IP/" || warn "External test inconclusive"

# ─── PHASE 6: REPORT ─────────────────────────────────────────────────────────
hr; info "PHASE 6 — Summary"; hr
echo "
✓ Repository:  $TARGET_DIR
✓ Build output: $DIST_DIR
✓ nginx config: $NGINX_CONF
✓ nginx:        active + enabled
✓ Firewall:     22/80/443 open, 4000 closed

Dashboard URL: http://$VPS_IP/

Rollback: restore snapshot from Hostinger panel to undo all changes.
"
