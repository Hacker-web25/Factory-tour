#!/usr/bin/env bash
# Makes the laptop pull the backups by itself every morning at 10:30, and also when
# the laptop wakes up after missing a run. macOS only.
#
#   bash scripts/backup/install-laptop-schedule.sh          install
#   bash scripts/backup/install-laptop-schedule.sh remove   uninstall
#
# It copies the two scripts into ~/.vpv-backup/ first, because background jobs on a
# Mac are not allowed to read files inside Documents, Desktop or Downloads.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.vpv.backup-pull"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP="$HOME/.vpv-backup"

if [ "$(uname)" != "Darwin" ]; then
  echo "This installer is for macOS. On Linux, add a cron line:  30 10 * * * bash $HERE/pull-to-laptop.sh"
  exit 1
fi

if [ "${1:-}" = "remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
  rm -f "$PLIST"
  echo "Removed. Your backups in ~/VPV-Backups were not touched."
  exit 0
fi

if [ ! -f "$HOME/.vpv-backup.env" ]; then
  echo "Create ~/.vpv-backup.env first (README.md, step 6)."
  exit 1
fi

mkdir -p "$APP" "$HOME/Library/LaunchAgents"
cp "$HERE/pull-to-laptop.sh" "$HERE/lib.sh" "$APP/"
chmod +x "$APP/pull-to-laptop.sh"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$APP/pull-to-laptop.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$APP/last-run.log</string>
  <key>StandardErrorPath</key><string>$APP/last-run.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
if launchctl bootstrap "gui/$(id -u)" "$PLIST"; then
  echo "Installed. The laptop will pull the backups every day at 10:30."
  echo "Log of the last run: $APP/last-run.log"
  echo "To test it right now:  launchctl kickstart -k gui/$(id -u)/$LABEL"
else
  echo "Could not load it. You can still run:  bash $HERE/pull-to-laptop.sh"
  exit 1
fi
