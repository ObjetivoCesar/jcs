# AGENTS.md — Jarvis el Creador de Skills v2.0

## Misión
Convertir JCS en una fábrica de ecosistemas de arnés para sistemas multiagente.
No ejecutar proyectos. No aprender vocabulario de dominio.
Entregar siempre un ecosistema de 5 archivos como plano de arquitectura.

## Stack
- **Razonamiento**: DeepSeek V4 Pro (`deepseek-reasoner`) — Fase 1 (Entrevista Profunda), Fase 2 (Plan de Arnés), Capa 2 (Revisor Adversarial)
- **Generación**: DeepSeek Flash (`deepseek-chat`) — Fase 3 (Generación de Ecosistema)
- **BD**: SQLite local (`file:local.db`) vía libSQL client
- **Runtime**: Express + Vite + React 19 + Drizzle ORM

## Restricciones del Sistema
- Jarvis no genera nada hasta recibir aprobación explícita del plan (Fase 2).
- Jarvis nunca incluye datos de dominio específico en los archivos generados.
- Pipeline de validación obligatorio (4 Pilares): Capa 1 (determinístico) → Capa 2 (adversarial con V4 Pro).
- Máximo 2 rondas de corrección. Si falla dos veces → reiniciar Fase 2.

## Los 4 Pilares de Validación
1. **Restricciones**: Declaración explícita de herramientas y acciones PROHIBIDAS.
2. **Mapa de Navegación**: El AGENTS.md debe decir DÓNDE buscar (rutas/archivos).
3. **Sensores**: El validate.sh debe imponer restricciones mecánicas reales.
4. **Feedback loop**: Mecanismo para convertir errores en reglas permanentes.

## Self-Harness de JCS (El Herrero con su propio Arnés)
JCS aplica los mismos 4 Pilares a sí mismo:
- **Sensores**: `validate-jcs.sh` — valida variables de entorno, archivos críticos, credenciales, y compilación TS.
- **Error Logger**: `lib/self-harness/error-logger.ts` — toda excepción se persiste en `jarvis_error_log`.
- **Feedback Engine**: `lib/self-harness/feedback-engine.ts` — errores recurrentes (3+ ocurrencias en 24h) generan reglas automáticas en `jarvis_feedback_rules`.
- **Health Detail**: `GET /api/health/detailed` — diagnóstico en vivo con últimos errores y reglas activas.
- **BD**: Supabase PostgreSQL con prefijo `jarvis_` para coexistir en proyecto compartido.

## Flujo de Trabajo
1. **Fase 1 (V4 Pro)**: Entrevista profunda — máximo 2 preguntas por turno.
2. **Fase 2 (V4 Pro)**: Diseño del Plan de Arnés. Espera aprobación explícita.
3. **Fase 3 (Flash)**: Genera el ecosistema completo (5 archivos).
4. **Fase 4 (Automático)**: Validación de los 4 Pilares. Solo si ambas capas aprueban → `validated = true`.

## Output (Ecosistema de 5 archivos)
- `AGENTS.md`: Mapa de navegación del proyecto.
- `skill-orquestador.md`: Instrucciones del agente líder.
- `skill-subagente-1.md`: (si aplica) Subagente especializado.
- `validate.sh`: Sensor mecánico específico.
- `progress-template.json`: Estructura de memoria compartida.

## Variables de Entorno Requeridas
- `DEEPSEEK_API_KEY` — API key de DeepSeek
- `DEEPSEEK_V4_MODEL` — Modelo para razonamiento (default: `deepseek-reasoner`)
- `DEEPSEEK_FLASH_MODEL` — Modelo para generación (default: `deepseek-chat`)
- `DATABASE_URL` — URL de BD local (default: `file:local.db`)

