#!/usr/bin/env bash
# Workflow control — used by /workflow slash commands
# Modify config at ~/.hermes/workflow-config.json
set -e

CONFIG="$HOME/.hermes/workflow-config.json"
CRON_ID="38954e30aeaa"

usage() {
  echo "Usage: $0 <command> [args]"
  echo ""
  echo "Commands:"
  echo "  status              — show current config and cron state"
  echo "  pause               — disable workflow entirely"
  echo "  resume              — enable workflow"
  echo "  hours <preset>      — set preset: daytime | night-owl | always"
  echo "  hours <start> <end> — set custom hours (24h, e.g. 9 23)"
  exit 1
}

read_config() {
  if [ -f "$CONFIG" ]; then
    cat "$CONFIG"
  else
    echo '{"enabled":true,"work_start_hour":8,"work_end_hour":22,"preset":"daytime"}'
  fi
}

write_config() {
  local tmp=$(mktemp)
  echo "$1" > "$tmp"
  mv "$tmp" "$CONFIG"
  echo "$1"
}

cmd_status() {
  local cfg=$(read_config)
  local enabled=$(echo "$cfg" | python3 -c "import sys,json; print(json.load(sys.stdin).get('enabled',True))")
  local start=$(echo "$cfg" | python3 -c "import sys,json; print(json.load(sys.stdin).get('work_start_hour',8))")
  local end=$(echo "$cfg" | python3 -c "import sys,json; print(json.load(sys.stdin).get('work_end_hour',22))")
  local preset=$(echo "$cfg" | python3 -c "import sys,json; print(json.load(sys.stdin).get('preset','custom'))")

  echo "═══════════════════════════════════"
  echo "  Workflow Status"
  echo "═══════════════════════════════════"
  if [ "$enabled" = "True" ]; then
    echo "  State:    ✅ Running"
  else
    echo "  State:    ⏸️  Paused"
  fi
  echo "  Preset:   $preset"
  printf "  Hours:    %02d:00 - %02d:00\\n" "$start" "$end"
  if [ "$enabled" = "True" ]; then
    local hour=$(date +%H)
    if [ "$start" -le "$end" ]; then
      if [ "$hour" -ge "$start" ] && [ "$hour" -lt "$end" ]; then
        echo "  Now:      🔵 Within work hours (active)"
      else
        echo "  Now:      ⚫ Outside work hours (idle)"
      fi
    else
      # Wrapping (e.g. 14-2)
      if [ "$hour" -ge "$start" ] || [ "$hour" -lt "$end" ]; then
        echo "  Now:      🔵 Within work hours (active)"
      else
        echo "  Now:      ⚫ Outside work hours (idle)"
      fi
    fi
  fi
  echo "  Config:   $CONFIG"
  echo "═══════════════════════════════════"
}

cmd_pause() {
  local cfg=$(read_config | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
cfg['enabled'] = False
cfg['preset'] = 'paused'
print(json.dumps(cfg, indent=2))
")
  write_config "$cfg"
  echo "⏸️  Workflow paused."
}

cmd_resume() {
  local cfg=$(read_config | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
cfg['enabled'] = True
if cfg.get('preset') == 'paused':
    cfg['preset'] = 'daytime'
    cfg['work_start_hour'] = 8
    cfg['work_end_hour'] = 22
print(json.dumps(cfg, indent=2))
")
  write_config "$cfg"
  echo "✅ Workflow resumed (default daytime preset)."
}

cmd_hours() {
  local preset_or_start="$1"
  local end="$2"

  case "$preset_or_start" in
    daytime|night-owl|always)
      local cfg=$(python3 -c "
import json
presets = {'daytime': (8,22), 'night-owl': (14,2), 'always': (0,24)}
s, e = presets['$preset_or_start']
cfg = {\"enabled\": True, \"work_start_hour\": s, \"work_end_hour\": e, \"preset\": \"$preset_or_start\"}
print(json.dumps(cfg, indent=2))
")
      write_config "$cfg"
      echo "✅ Hours set to preset: $preset_or_start"
      ;;
    ''|*)
      if [ -z "$preset_or_start" ] || [ -z "$end" ]; then
        echo "❌ Usage: hours <preset> | hours <start> <end>"
        exit 1
      fi
      # Validate
      if ! [ "$preset_or_start" -ge 0 ] 2>/dev/null || ! [ "$end" -ge 0 ] 2>/dev/null; then
        echo "❌ Hours must be numbers (0-24)"
        exit 1
      fi
      if [ "$preset_or_start" -lt 0 ] || [ "$preset_or_start" -gt 23 ] || [ "$end" -lt 0 ] || [ "$end" -gt 24 ]; then
        echo "❌ Hours must be 0-24"
        exit 1
      fi
      local cfg=$(python3 -c "
import json
cfg = {\"enabled\": True, \"work_start_hour\": $preset_or_start, \"work_end_hour\": $end, \"preset\": \"custom\"}
print(json.dumps(cfg, indent=2))
")
      write_config "$cfg"
      echo "✅ Hours set to custom: ${preset_or_start}:00 - ${end}:00"
      ;;
  esac
}

# ── Main ──
case "${1:-help}" in
  status)   cmd_status ;;
  pause)    cmd_pause ;;
  resume)   cmd_resume ;;
  hours)    shift; cmd_hours "$@" ;;
  help|--help|-h) usage ;;
  *)        echo "❌ Unknown command: $1"; usage ;;
esac
