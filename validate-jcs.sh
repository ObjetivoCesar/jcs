#!/bin/bash
# validate-jcs.sh — Sensores mecánicos del propio JCS (El Herrero con su propio Arnés)
# Se ejecuta como pre-deploy hook y como health check manual.
# Pilar 3 (Sensor): impone restricciones mecánicas reales sobre JCS mismo.
# Pilar 4 (Feedback Loop): errores detectables automáticamente.

set -euo pipefail

ERRORS=0
WARNINGS=0

echo "═══════════════════════════════════════════"
echo "  🔍 JCS SELF-VALIDATION (El Herrero se prueba su Arnés)"
echo "═══════════════════════════════════════════"
echo ""

# ── Sensor 1: Variables de entorno ──
echo "📋 Sensor 1/6: Variables de entorno..."
if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "  ❌ ERROR: DEEPSEEK_API_KEY no está definida"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ DEEPSEEK_API_KEY presente"
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "  ⚠️  WARN: SUPABASE_SERVICE_ROLE_KEY no definida (modo local SQLite)"
  WARNINGS=$((WARNINGS + 1))
else
  echo "  ✅ SUPABASE_SERVICE_ROLE_KEY presente"
fi

# ── Sensor 2: Archivos críticos existen ──
echo ""
echo "📋 Sensor 2/6: Archivos del ecosistema..."
CRITICAL_FILES=(
  "lib/db/supabase-schema.ts"
  "lib/self-harness/error-logger.ts"
  "lib/self-harness/feedback-engine.ts"
  "lib/deepseek-client.ts"
  "lib/jarvis-core.ts"
  "lib/prompts/jarvis-system.ts"
  "server.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "  ❌ ERROR: $file no encontrado"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✅ $file"
  fi
done

# ── Sensor 3: validate.sh propio (este archivo) es ejecutable ──
echo ""
echo "📋 Sensor 3/6: validate.sh propio..."
if [ ! -x "$0" ]; then
  echo "  ⚠️  WARN: validate-jcs.sh no es ejecutable (chmod +x)"
  WARNINGS=$((WARNINGS + 1))
else
  echo "  ✅ validate-jcs.sh es ejecutable"
fi

# ── Sensor 4: No hay credenciales hardcodeadas en código fuente ──
echo ""
echo "📋 Sensor 4/6: Credenciales hardcodeadas..."
SUSPICIOUS=$(grep -rn 'api_key\s*[:=]\s*["'"'"'][a-zA-Z0-9_]\{20,\}' lib/ --include='*.ts' 2>/dev/null || true)
if [ -n "$SUSPICIOUS" ]; then
  echo "  ❌ ERROR: Posibles credenciales en código:"
  echo "$SUSPICIOUS"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ Sin credenciales hardcodeadas en lib/"
fi

# ── Sensor 5: Verificar que server.ts importa Supabase schema (no SQLite) ──
echo ""
echo "📋 Sensor 5/6: Conexión a BD..."
if grep -q "supabase-schema" server.ts 2>/dev/null; then
  echo "  ✅ server.ts usa supabase-schema"
else
  echo "  ⚠️  WARN: server.ts no importa supabase-schema (puede estar en modo SQLite legacy)"
  WARNINGS=$((WARNINGS + 1))
fi

# ── Sensor 6: Verificar TypeScript compila sin errores ──
echo ""
echo "📋 Sensor 6/6: Compilación TypeScript..."
if command -v npx &>/dev/null; then
  if npx tsc --noEmit 2>/dev/null; then
    echo "  ✅ TypeScript compila sin errores"
  else
    echo "  ⚠️  WARN: Errores de TypeScript detectados"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  ⚠️  WARN: npx no disponible, saltando validación TS"
  WARNINGS=$((WARNINGS + 1))
fi

# ── Resultado ──
echo ""
echo "═══════════════════════════════════════════"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo "  ✅ JCS SELF-VALIDATION: TODO OK"
elif [ $ERRORS -eq 0 ]; then
  echo "  ✅ JCS SELF-VALIDATION: $ERRORS errores, $WARNINGS advertencias (revisar)"
else
  echo "  ❌ JCS SELF-VALIDATION: $ERRORS error(es) — corregir antes de desplegar"
fi
echo "═══════════════════════════════════════════"
exit $ERRORS
