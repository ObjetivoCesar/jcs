#!/bin/bash
# Sensor determinístico — valida estructura del skill.md antes de entregarlo

SKILL_FILE=$1
ERRORS=0

check_section() {
  if ! grep -q "## $1" "$SKILL_FILE"; then
    echo "❌ ERROR: Sección obligatoria ausente: ## $1"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ OK: ## $1"
  fi
}

echo "=== VALIDANDO: $SKILL_FILE ==="

# Secciones obligatorias según el estándar JCS
check_section "Propósito"
check_section "Herramientas Permitidas"
check_section "Herramientas Prohibidas"
check_section "Condiciones de Salida"
check_section "Instrucción de Aprendizaje Externo"
check_section "Tarjeta de Descubrimiento"

# Verificar que no contiene credenciales hardcodeadas (aprox)
if grep -qiE "(api_key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}" "$SKILL_FILE"; then
  echo "❌ ERROR CRÍTICO: Posibles credenciales detectadas en el archivo"
  ERRORS=$((ERRORS + 1))
fi

# Verificar longitud mínima
WORD_COUNT=$(wc -w < "$SKILL_FILE")
if [ "$WORD_COUNT" -lt 150 ]; then
  echo "❌ ERROR: Skill demasiado corta ($WORD_COUNT palabras). Mínimo: 150"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ VALIDACIÓN EXITOSA — Skill lista para revisión semántica"
  exit 0
else
  echo "❌ VALIDACIÓN FALLIDA — $ERRORS error(es) encontrados"
  exit 1
fi
