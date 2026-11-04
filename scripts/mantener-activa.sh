#!/usr/bin/env bash
# Hace una consulta mínima a Supabase para que el plan gratis no pause el proyecto.
# Usa los mismos datos públicos de config.js.
set -euo pipefail

config="${CONFIG_FILE:-config.js}"
url="$(sed -n "s/.*supabaseUrl: *'\([^']*\)'.*/\1/p" "$config")"
key="$(sed -n "s/.*supabaseKey: *'\([^']*\)'.*/\1/p" "$config")"

if [[ -z "$url" || -z "$key" ]]; then
  echo "No se encontraron los datos de Supabase en $config." >&2
  exit 1
fi

# Mientras la base de datos no esté conectada no hay nada que mantener activo.
if [[ "$url" == *TU-PROYECTO* ]]; then
  echo "config.js aún no está conectado a Supabase; no se hace la consulta."
  exit 0
fi

respuesta="$(curl --silent --show-error --fail-with-body --max-time 30 \
  --request POST "$url/rest/v1/rpc/ping" \
  --header "apikey: $key" \
  --header "Content-Type: application/json" \
  --data '{}')" || {
  echo "Supabase respondió con error: $respuesta" >&2
  exit 1
}

if [[ "$respuesta" != '"ok"' ]]; then
  echo "Respuesta inesperada de Supabase: $respuesta" >&2
  exit 1
fi

echo "Supabase activo."
