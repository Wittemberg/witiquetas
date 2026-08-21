#!/usr/bin/env bash
set -e

mkdir -p .githooks
git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "✅ Git hooksPath configurado com sucesso para .githooks"
