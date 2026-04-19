#!/bin/bash
set -e

echo "Iniciando LSP para lenguaje: $LANGUAGE"

case "$LANGUAGE" in
  python)
    exec pylsp --tcp --host 0.0.0.0 --port 2087
    ;;
  cpp)
    exec clangd --compile-commands-dir=/workspace
    ;;
  typescript)
    exec typescript-language-server --stdio
    ;;
  *)
    echo "ERROR: LANGUAGE no definido. Usa: python | cpp | typescript"
    exit 1
    ;;
esac