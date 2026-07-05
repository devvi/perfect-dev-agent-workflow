#!/bin/bash
# Set up Perfect Dev Agent Workflow labels on a GitHub repo
# Usage: bash scripts/setup-labels.sh

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)}"
if [ -z "$REPO" ]; then
  echo "Usage: bash scripts/setup-labels.sh <owner/repo>"
  exit 1
fi

echo "Setting up labels for $REPO..."

# Workflow stage labels
declare -A LABELS=(
  ["workflow/available"]="Task ready for agent to claim|#0e8a16"
  ["workflow/research"]="Stage 1: Research in progress|#1d76db"
  ["workflow/plan"]="Stage 2: Planning in progress|#0052cc"
  ["workflow/implement"]="Stage 3: Implementation in progress|#fbca04"
  ["workflow/test"]="Stage 4: Testing in progress|#d93f0b"
  ["workflow/self-correct"]="Stage 5: Auto-fixing failures|#b60205"
  ["workflow/deploy"]="Stage 6: Deployment in progress|#5319e7"
  ["status/done"]="Workflow completed successfully|#0e8a16"
  ["status/blocked"]="Needs human intervention|#b60205"
  ["status/cancelled"]="Workflow cancelled|#cccccc"
  ["depth/light"]="Simple change, minimal research|#c5def5"
  ["depth/standard"]="Standard research depth|#c5def5"
  ["depth/deep"]="Architecture-level research|#0052cc"
)

for label in "${!LABELS[@]}"; do
  IFS='|' read -r desc color <<< "${LABELS[$label]}"
  if gh label list --repo "$REPO" | grep -q "^$label"; then
    echo "  Updating: $label"
    gh label edit "$label" --color "$color" --description "$desc" --repo "$REPO" 2>/dev/null
  else
    echo "  Creating: $label"
    gh label create "$label" --color "$color" --description "$desc" --repo "$REPO" 2>/dev/null
  fi
done

echo "Done! Labels configured for $REPO"
