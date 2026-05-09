// lib/validators/skill-validator.ts — Capa 1: Validación Determinística v2.0
// Enfocada en los 4 Pilares del Ecosistema de Arnés

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const FORBIDDEN_PATTERNS = [
  /api_key\s*[:=]\s*['"][^'"]{8,}/i,
  /secret\s*[:=]\s*['"][^'"]{8,}/i,
  /password\s*[:=]\s*['"][^'"]{8,}/i,
  /sk-[a-zA-Z0-9]{20,}/i,
];

/**
 * Capa 1 — Sensor determinístico v2.0
 * Valida los 4 pilares del plan de arnés.
 */
export function validateSkill(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lowerContent = content.toLowerCase();

  // ── Pilar 1: Restricciones (Herramientas Prohibidas) ──
  if (!lowerContent.includes('prohibid') && !lowerContent.includes('forbidden') && !lowerContent.includes('restriccion')) {
    errors.push("Pilar 1 (Restricciones) ausente: Falta declaración explícita de herramientas o acciones PROHIBIDAS.");
  }

  // ── Pilar 2: Mapa de Navegación (DÓNDE buscar) ──
  const hasNavigation = lowerContent.includes('navegación') || lowerContent.includes('navigation') || lowerContent.includes('mapa');
  const hasPaths = lowerContent.includes('/') || lowerContent.includes('\\') || lowerContent.includes('carpeta') || lowerContent.includes('path');
  
  if (!hasNavigation) {
    errors.push("Pilar 2 (Mapa de Navegación) ausente: El plan debe incluir un mapa de navegación.");
  } else if (!hasPaths) {
    warnings.push("El mapa de navegación debería indicar DÓNDE buscar (rutas, carpetas, archivos específicos).");
  }

  // ── Pilar 3: Sensores (validate.sh) ──
  if (!lowerContent.includes('validate.sh') && !lowerContent.includes('sensor') && !lowerContent.includes('validación mecánica')) {
    errors.push("Pilar 3 (Sensores) ausente: El plan debe mencionar el uso de validate.sh o sensores mecánicos.");
  }

  // ── Pilar 4: Feedback Loop (Error -> Regla) ──
  if (!lowerContent.includes('feedback') && !lowerContent.includes('loop') && !lowerContent.includes('regla permanente')) {
    errors.push("Pilar 4 (Feedback Loop) ausente: Falta mecanismo para convertir errores en reglas permanentes.");
  }

  // ── Credenciales hardcodeadas (Universal) ──
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      const match = content.match(pattern)?.[0]?.substring(0, 30) || '';
      errors.push(`Posibles credenciales detectadas: "${match}...". Nunca incluir secretos en el plan.`);
    }
  }

  // ── Estructura de Proyecto ──
  if (!content.includes('├──') && !content.includes('└──')) {
    warnings.push("Se recomienda usar una representación visual de la estructura (árbol de archivos).");
  }

  // ── Longitud mínima ──
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 100) {
    errors.push(`Plan demasiado escueto (${wordCount} palabras / mínimo 100 para ser estructuralmente útil).`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

