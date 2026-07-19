#!/bin/zsh
set -euo pipefail

service_label="com.ceciliaabadie.codex-micro-cardputer"
script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
source_plist="$project_root/bridge/macos/$service_label.plist"
target_plist="$HOME/Library/LaunchAgents/$service_label.plist"
service_domain="gui/$(id -u)"
node_path="$(command -v node || true)"

if [[ -z "$node_path" ]]; then
  echo "Node.js was not found. Install Node.js 22 or newer and try again." >&2
  exit 1
fi

node_major="$($node_path -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required; found $($node_path --version)." >&2
  exit 1
fi

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\\&|]/\\&/g'
}

escaped_node="$(escape_sed_replacement "$node_path")"
escaped_root="$(escape_sed_replacement "$project_root")"
escaped_home="$(escape_sed_replacement "$HOME")"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.codex-cardputer"
npm --prefix "$project_root/bridge" install
npm --prefix "$project_root/bridge" run build:helpers
npm --prefix "$project_root/bridge" test
sed \
  -e "s|__NODE_PATH__|$escaped_node|g" \
  -e "s|__PROJECT_ROOT__|$escaped_root|g" \
  -e "s|__HOME__|$escaped_home|g" \
  "$source_plist" > "$target_plist"
chmod 600 "$target_plist"
plutil -lint "$target_plist"

/bin/launchctl bootout "$service_domain/$service_label" 2>/dev/null || true
/bin/launchctl bootstrap "$service_domain" "$target_plist"
/bin/launchctl enable "$service_domain/$service_label"
/bin/launchctl kickstart -k "$service_domain/$service_label"

echo "Installed and started $service_label"
echo "Status: launchctl print $service_domain/$service_label"
echo "Logs:   $HOME/.codex-cardputer/bridge.log"
