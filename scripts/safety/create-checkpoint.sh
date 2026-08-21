#!/usr/bin/env bash
set -e

LABEL="${1:-manual}"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BRANCH=$(git rev-parse --abbrev-ref HEAD)
FULL_SHA=$(git rev-parse HEAD)
SHORT_SHA=$(git rev-parse --short HEAD)

CHECKPOINT_DIR=".recovery/${TIMESTAMP}-${SHORT_SHA}-${LABEL}"
mkdir -p "$CHECKPOINT_DIR"

GIT_STATUS=$(git status --porcelain)
IS_CLEAN=true
if [ -n "$GIT_STATUS" ]; then
  IS_CLEAN=false
fi

cat <<EOF > "$CHECKPOINT_DIR/manifest.json"
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "label": "$LABEL",
  "branch": "$BRANCH",
  "fullSha": "$FULL_SHA",
  "shortSha": "$SHORT_SHA",
  "isClean": $IS_CLEAN
}
EOF

if [ "$IS_CLEAN" = false ]; then
  git diff > "$CHECKPOINT_DIR/unstaged.patch" || true
  git diff --cached > "$CHECKPOINT_DIR/staged.patch" || true
fi

echo "✅ Checkpoint de segurança criado com sucesso em: $CHECKPOINT_DIR"
