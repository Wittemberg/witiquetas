#!/usr/bin/env bash
set -e

TARGET_SHA="${1:-previous}"
MANIFEST_PATH="docs/releases/release-manifest.json"

if [ ! -f "$MANIFEST_PATH" ]; then
  echo "❌ Erro: Manifesto $MANIFEST_PATH não encontrado."
  exit 1
fi

CURRENT_SHA=$(grep -o '"commitSha": "[^"]*' "$MANIFEST_PATH" | grep -o '[^"]*$')
PREVIOUS_SHA=$(grep -o '"previousStableSha": "[^"]*' "$MANIFEST_PATH" | grep -o '[^"]*$')

RESOLVED_SHA="$TARGET_SHA"
if [ "$TARGET_SHA" = "previous" ]; then
  RESOLVED_SHA="$PREVIOUS_SHA"
fi

if [ -z "$RESOLVED_SHA" ]; then
  echo "❌ Erro: Nenhuma release anterior encontrada."
  exit 1
fi

echo "🔄 Iniciando Rollback Instantâneo de Produção..."
echo "   SHA Atual:   $CURRENT_SHA"
echo "   Target SHA:  $RESOLVED_SHA"

if [ -n "$PORTAINER_WEBHOOK_URL" ]; then
  echo "📡 Acionando Webhook Portainer..."
  curl -X POST "$PORTAINER_WEBHOOK_URL"
  echo "✅ Webhook acionado!"
fi

echo "✅ ROLLBACK EXECUTADO COM SUCESSO PARA: $RESOLVED_SHA"
