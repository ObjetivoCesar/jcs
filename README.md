# Jarvis JCS v1.1 — El Creador de Skills

Sistema conversacional y evolutivo para diseñar, validar y generar **skills para agentes de IA**.

**Producto final**: Dos archivos por skill — `skill-[nombre].md` + `validate-[nombre].sh`.

## Arquitectura

| Capa | Tecnología | Rol |
|---|---|---|
| Razonamiento | DeepSeek V4 Pro | Fase 1 (entrevista), Fase 2 (diseño), Capa 2 (revisor adversarial) |
| Generación | DeepSeek Flash | Fase 3 (generar skill.md + validate.sh) |
| BD | SQLite local (`file:local.db`) | Sin dependencia de Turso cloud |
| Frontend | React 19 + Vite + Tailwind v4 | Chat conversacional con tracking de validación |

## Flujo de 4 Fases

1. **Descubrimiento** (V4 Pro) — Entrevista. Máximo 2 preguntas por turno.
2. **Diseño** (V4 Pro) — Plan de arquitectura. Espera aprobación explícita.
3. **Generación** (Flash) — Produce skill.md + validate.sh.
4. **Validación** (Automático) — Capa 1 (determinística) + Capa 2 (V4 Pro adversarial). Solo si ambas aprueban se entrega.

## Instalación

```bash
npm install
cp .env.example .env
# Editar .env con tu DEEPSEEK_API_KEY
npm run dev
```

## Variables de Entorno

- `DEEPSEEK_API_KEY` — API key de DeepSeek (obligatorio)
- `DEEPSEEK_V4_MODEL` — Modelo de razonamiento (default: `deepseek-reasoner`)
- `DEEPSEEK_FLASH_MODEL` — Modelo de generación (default: `deepseek-chat`)
- `DATABASE_URL` — URL de BD local (default: `file:local.db`)
