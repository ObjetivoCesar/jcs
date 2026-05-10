import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { eq, desc } from "drizzle-orm";
import * as schema from "./lib/db/supabase-schema.ts";
import { runJarvisTurn, generateHarnessPlan } from "./lib/jarvis-core.ts";
import { deepseekChat } from "./lib/deepseek-client.ts";
import { validateSkill } from "./lib/validators/skill-validator.ts";
import { adversarialReview } from "./lib/validators/adversarial-reviewer.ts";
import { recallContext, processEntities, summarizeSession } from "./lib/memory/engine.ts";
import { errorLogger } from "./lib/self-harness/error-logger.ts";
import { feedbackEngine } from "./lib/self-harness/feedback-engine.ts";
import crypto from "crypto";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function uuid() {
  return crypto.randomUUID();
}

async function startServer() {
  console.log("🚀 Iniciando Jarvis JCS v2.0...");
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Body parser solo para rutas /api — no interferir con el tráfico de Vite HMR
  app.use('/api', express.json({ limit: '10mb' }));

  // Manejador de errores de JSON malformado (solo afecta a /api/*)
  app.use('/api', (err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && 'body' in err) {
      console.error('❌ JSON malformado en API:', err.message);
      return res.status(400).json({ error: 'JSON malformado en la solicitud.' });
    }
    next(err);
  });

  // ── Base de datos Supabase (PostgreSQL) — opcional ──
  // Sin SUPABASE_DATABASE_URL, la app funciona en modo "sin BD" (solo health check y frontend)
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  let sql: any = null;
  let db: any = null;
  let log: any = { capture: async () => {}, low: async () => {}, medium: async () => {}, high: async () => {}, critical: async () => {} };
  let feedback: any = { analyzeAndGenerateRules: async () => [], loadActiveRules: async () => '' };

  if (connectionString) {
    console.log(`☁️  Conectando a Supabase PostgreSQL...`);
    try {
      const { default: postgres } = await import('postgres');
      const { drizzle } = await import('drizzle-orm/node-postgres');
      
      sql = postgres(connectionString, {
        max: 10,
        idle_timeout: 30,
        connect_timeout: 15,
      });
      db = drizzle(sql, { schema });

      // ── Crear tablas automáticamente ──
      console.log('🏗️  Verificando/creando tablas jarvis_*...');
      await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS jarvis_sessions (
      id TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      status TEXT DEFAULT 'interviewing',
      project_name TEXT,
      skill_purpose TEXT,
      skill_type TEXT DEFAULT 'otro',
      architecture_plan TEXT
    );
    CREATE TABLE IF NOT EXISTS jarvis_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES jarvis_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      is_audio BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS jarvis_skills (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES jarvis_sessions(id) ON DELETE CASCADE,
      skill_filename TEXT NOT NULL,
      skill_content TEXT NOT NULL,
      validate_filename TEXT NOT NULL,
      validate_content TEXT NOT NULL,
      harness_data TEXT,
      layer1_passed BOOLEAN DEFAULT FALSE,
      layer2_passed BOOLEAN DEFAULT FALSE,
      validated BOOLEAN DEFAULT FALSE,
      review_rounds INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jarvis_lessons (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL,
      error_type TEXT NOT NULL,
      description TEXT NOT NULL,
      fix_applied TEXT NOT NULL,
      automated BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jarvis_memory_entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      description TEXT,
      metadata TEXT,
      first_seen_at BIGINT NOT NULL,
      last_seen_at BIGINT NOT NULL,
      occurrence_count INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS jarvis_memory_facts (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES jarvis_sessions(id) ON DELETE SET NULL,
      fact_type TEXT NOT NULL,
      content TEXT NOT NULL,
      entities TEXT,
      importance INTEGER DEFAULT 3,
      created_at BIGINT NOT NULL,
      last_accessed BIGINT,
      access_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS jarvis_memory_sessions (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES jarvis_sessions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      key_decisions TEXT,
      entities_mentioned TEXT,
      skills_generated TEXT,
      token_estimate INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jarvis_memory_links (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      link_type TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    -- Self-harness: error log
    CREATE TABLE IF NOT EXISTS jarvis_error_log (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES jarvis_sessions(id) ON DELETE SET NULL,
      error_type TEXT NOT NULL,
      error_code TEXT,
      message TEXT NOT NULL,
      stack_trace TEXT,
      metadata TEXT,
      severity TEXT DEFAULT 'medium',
      resolved BOOLEAN DEFAULT FALSE,
      resolved_at BIGINT,
      created_at BIGINT NOT NULL
    );
    -- Self-harness: feedback rules
    CREATE TABLE IF NOT EXISTS jarvis_feedback_rules (
      id TEXT PRIMARY KEY,
      rule_type TEXT NOT NULL,
      description TEXT NOT NULL,
      condition TEXT NOT NULL,
      action TEXT NOT NULL,
      source_error_type TEXT,
      occurrence_count INTEGER DEFAULT 1,
      active BOOLEAN DEFAULT TRUE,
      created_at BIGINT NOT NULL,
      last_triggered_at BIGINT
    );
  `);
  console.log("✅ BD lista. Tablas con prefijo jarvis_ listas.");

  // ── Inicializar self-harness ──
  log = errorLogger(db);
  feedback = feedbackEngine(db);
    } catch (e) {
      console.error('❌ Error al conectar a Supabase:', e);
      console.log('⚠️  Continuando sin BD...');
    }
  } else {
    console.log('⚠️  Sin SUPABASE_DATABASE_URL — modo sin BD. Solo frontend + health check.');
    console.log('   Configura SUPABASE_DATABASE_URL en .env para funcionalidad completa.');
  }

  // ═══════════════════════════════════════════════
  // API ROUTES
  // ═══════════════════════════════════════════════

  // ── Health ──
  app.get("/api/health", async (_req, res) => {
    const dbStatus = db ? 'connected' : 'not_configured';
    let dbOk = false;
    if (db && sql) {
      try { dbOk = await sql`SELECT 1`.then(() => true).catch(() => false); } catch {}
    }
    res.json({
      status: dbOk || !db ? "ok" : "error",
      version: "2.1",
      db: dbStatus,
      models: {
        v4: process.env.DEEPSEEK_V4_MODEL || 'deepseek-reasoner',
        flash: process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat',
      },
    });
  });

  // ── Health Detallado (self-harness) ──
  app.get("/api/health/detailed", async (_req, res) => {
    if (!db) {
      return res.json({
        status: "ok",
        version: "2.1",
        db: "not_configured",
        message: "Configura SUPABASE_DATABASE_URL en Vercel para activar todas las funcionalidades.",
        stats: { recentErrors: 0, activeRules: 0, activeSessions: 0 },
        recentErrors: [],
        activeRules: [],
        activeSessions: [],
      });
    }
    try {
      // Errores recientes
      const recentErrors = await db
        .select()
        .from(schema.jarvisErrorLog)
        .orderBy(desc(schema.jarvisErrorLog.createdAt))
        .limit(10);

      // Reglas activas
      const activeRules = await db
        .select()
        .from(schema.jarvisFeedbackRules)
        .where(eq(schema.jarvisFeedbackRules.active, true))
        .orderBy(desc(schema.jarvisFeedbackRules.occurrenceCount))
        .limit(10);

      // Sesiones activas
      const activeSessions = await db
        .select()
        .from(schema.jarvisSessions)
        .orderBy(desc(schema.jarvisSessions.createdAt))
        .limit(5);

      res.json({
        status: "ok",
        version: "2.1",
        db: "supabase",
        timestamp: Date.now(),
        stats: {
          recentErrors: recentErrors.length,
          activeRules: activeRules.length,
          activeSessions: activeSessions.length,
        },
        recentErrors,
        activeRules,
        activeSessions,
      });
    } catch (e: any) {
      await log.capture('db_error', 'Error en health detail', e).catch(() => {});
      res.status(500).json({
        status: "error",
        error: e.message,
      });
    }
  });

  // ── Middleware: verificar que DB esté configurada ──
  const requireDb = (req: any, res: any, next: any) => {
    if (!db) {
      return res.status(503).json({
        error: "Base de datos no configurada",
        message: "Configura SUPABASE_DATABASE_URL en las variables de entorno de Vercel.",
      });
    }
    next();
  };

  // ── Sesiones ──
  app.get("/api/sessions", requireDb, async (_req, res) => {
    try {
      const all = await db.select().from(schema.jarvisSessions).orderBy(schema.jarvisSessions.createdAt);
      res.json(all);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al obtener sesiones" });
    }
  });

  app.post("/api/sessions", requireDb, async (_req, res) => {
    try {
      const id = uuid();
      await db.insert(schema.jarvisSessions).values({
        id,
        createdAt: Date.now(),
        status: 'interviewing',
      });
      res.json({ id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al crear sesión" });
    }
  });

  app.delete("/api/sessions/:id", requireDb, async (req, res) => {
    const { id } = req.params;
    try {
      // Limpieza profunda de cascada manual
      await db.delete(schema.jarvisMessages).where(eq(schema.jarvisMessages.sessionId, id));
      await db.delete(schema.jarvisSkills).where(eq(schema.jarvisSkills.sessionId, id));
      await db.delete(schema.jarvisMemoryFacts).where(eq(schema.jarvisMemoryFacts.sessionId, id));
      await db.delete(schema.jarvisMemorySessions).where(eq(schema.jarvisMemorySessions.sessionId, id));
      await db.delete(schema.jarvisSessions).where(eq(schema.jarvisSessions.id, id));
      
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al eliminar la sesión" });
    }
  });

  // ── Mensajes de una sesión ──
  app.get("/api/sessions/:id/messages", requireDb, async (req, res) => {
    try {
      const msgs = await db
        .select()
        .from(schema.jarvisMessages)
        .where(eq(schema.jarvisMessages.sessionId, req.params.id))
        .orderBy(schema.jarvisMessages.createdAt);
      res.json(msgs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al obtener mensajes" });
    }
  });

  // ── CHAT — endpoint principal ──
  app.post("/api/chat", requireDb, async (req, res) => {
    const { sessionId, message, isAudio } = req.body;

    // Buscar sesión
    const rows = await db
      .select()
      .from(schema.jarvisSessions)
      .where(eq(schema.jarvisSessions.id, sessionId));
    const session = rows[0];
    if (!session) return res.status(404).json({ error: "Sesión no encontrada" });

    // Historial
    const history = await db
      .select()
      .from(schema.jarvisMessages)
      .where(eq(schema.jarvisMessages.sessionId, sessionId))
      .orderBy(schema.jarvisMessages.createdAt);

    // Guardar mensaje del usuario
    await db.insert(schema.jarvisMessages).values({
      id: uuid(),
      sessionId,
      role: 'user',
      content: message,
      createdAt: Date.now(),
      isAudio: !!isAudio,
    });

    try {
      // 🧠 Memoria: recuperar contexto de sesiones anteriores
      const memoryContext = await recallContext(db, message).catch(() => '');

      // 🧠 Inyectar contexto de memoria en el mensaje (si hay)
      const messageWithMemory = memoryContext
        ? `${memoryContext}\n\n---\nMENSAJE ACTUAL:\n${message}`
        : message;

      // ── Fase 1 y 2: Jarvis V4 Pro razona ──
      const responseText = await runJarvisTurn(
        session as any,
        history.map((m) => ({ role: m.role as any, content: m.content })),
        messageWithMemory,
        (session as any).skillType || 'otro'
      );

      // Guardar respuesta de Jarvis
      await db.insert(schema.jarvisMessages).values({
        id: uuid(),
        sessionId,
        role: 'assistant',
        content: responseText || '',
        createdAt: Date.now(),
      });

      // ── Detectar si es generación de ecosistema de arnés (Fase 3) ──
      const lowerText = (responseText || '').toLowerCase();
      const hasPlanHeader = lowerText.includes('plan de arnés') || lowerText.includes('plan de arnes');
      const hasHarnessStructure = lowerText.includes('├──') || lowerText.includes('└──');
      const isHarnessGeneration = hasPlanHeader && hasHarnessStructure;

      if (isHarnessGeneration) {
        // Intentar extraer nombre del proyecto del historial reciente
        let projectName = (session as any).projectName;
        if (!projectName || projectName === 'unnamed') {
          // Buscar en los últimos mensajes del usuario palabras clave
          const userMessages = history
            .filter((m) => m.role === 'user')
            .map((m) => m.content)
            .join(' ');
          const nameMatch = userMessages.match(
            /(?:skill|agente)\s+(?:para|de|que)?\s*(?:un|una|el|la)?\s*([a-zA-Záéíóúñ]{3,20}(?:\s+[a-zA-Záéíóúñ]{2,20}){0,2})/i
          );
          projectName = nameMatch ? nameMatch[1].trim() : 'skill-generada';
          // Guardar el nombre extraído
          await db
            .update(schema.jarvisSessions)
            .set({ projectName })
            .where(eq(schema.jarvisSessions.id, sessionId));
        }

        const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const timestamp = Date.now();

        // ── Fase 3: Flash genera el ecosistema completo ──
        console.log('⚡ Generando ecosistema de arnés con Flash...');
        const flashOutput = await generateHarnessPlan(
          session as any,
          history.map((m) => ({ role: m.role as any, content: m.content }))
        );

        // Parsear los archivos separados por ===FILE_SPLIT===
        const parts = flashOutput.split('===FILE_SPLIT===');
        
        // El formato esperado es:
        // [0] AGENTS.md
        // [1] skill-orquestador.md
        // [2] validate.sh
        // [3] progress-template.json
        
        let agentsMd = (parts[0] || '').trim();
        let orquestadorSkill = (parts[1] || '').trim();
        let validateContent = (parts[2] || '').trim();
        let progressTemplate = (parts[3] || '').trim();

        // Limpiar markdown code fences
        const cleanMarkdown = (text: string) => text.replace(/^```(?:markdown|md|bash|sh|json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        
        agentsMd = cleanMarkdown(agentsMd);
        orquestadorSkill = cleanMarkdown(orquestadorSkill);
        validateContent = cleanMarkdown(validateContent);
        progressTemplate = cleanMarkdown(progressTemplate);

        const skillContent = agentsMd; // Usamos AGENTS.md como contenido principal
        const skillFilename = 'AGENTS.md';
        const harnessData = JSON.stringify({
          agentsMd,
          orquestadorSkill,
          validateContent,
          progressTemplate,
          fullOutput: flashOutput
        });

        // Si validateContent está vacío, generar uno básico
        if (!validateContent || validateContent.length < 20) {
          validateContent = generateFallbackValidateSh(slug);
        }

        const validateFilename = 'validate.sh';

        // ── Capa 1: Validación determinística ──
        console.log('🔍 Capa 1: Validación determinística...');
        const layer1Result = validateSkill(skillContent);
        const layer1Passed = layer1Result.valid;
        if (!layer1Passed) {
          console.log(`  ❌ Capa 1 falló: ${layer1Result.errors.join('; ')}`);
        } else {
          console.log('  ✅ Capa 1 aprobada');
        }

        // ── Capa 2: Revisor adversarial (V4 Pro) — SIEMPRE se ejecuta ──
        let layer2Passed = false;
        let reviewIssues: string[] = [];
        let reviewRounds = 0;

        console.log('🧠 Capa 2: Revisor adversarial (V4 Pro)...');
        const reviewResult = await adversarialReview(skillContent);
        reviewRounds = 1;
        reviewIssues = reviewResult.issues;
        layer2Passed = reviewResult.approved;

        if (!layer2Passed) {
          console.log(`  ❌ Capa 2 falló: ${reviewIssues.join('; ')}`);
        } else {
          console.log('  ✅ Capa 2 aprobada');
        }

        const fullyValidated = layer1Passed && layer2Passed;

        // Guardar skill con ambos archivos y resultados de validación
        await db.insert(schema.jarvisSkills).values({
          id: uuid(),
          sessionId,
          skillFilename,
          skillContent,
          validateFilename,
          validateContent,
          harnessData,
          layer1Passed,
          layer2Passed,
          validated: fullyValidated,
          reviewRounds,
          createdAt: Date.now(),
        });

        // Actualizar estado de sesión
        await db
          .update(schema.jarvisSessions)
          .set({ status: fullyValidated ? 'complete' : 'validating' })
          .where(eq(schema.jarvisSessions.id, sessionId));

        console.log(
          `📦 Skill: ${skillFilename} + ${validateFilename} | ` +
          `C1:${layer1Passed ? '✅' : '❌'} C2:${layer2Passed ? '✅' : '❌'} | ` +
          `Final: ${fullyValidated ? '✅ VALIDADA' : '❌ RECHAZADA'}`
        );

        // 🧠 Memoria: resumir sesión y guardar para el futuro
        summarizeSession(
          db,
          sessionId,
          [...history, { role: 'user', content: message }].map((m) => ({
            role: m.role,
            content: m.content,
          }))
        ).catch((e) => {
          log.capture('system', 'Error al resumir sesión en memoria', e, { sessionId }).catch(() => {});
          console.error('Memoria: error al resumir sesión:', e);
        });

        return res.json({
          response: responseText,
          skill: {
            skillFilename,
            validateFilename,
            skillContent,
            validateContent,
            layer1Passed,
            layer2Passed,
            validated: fullyValidated,
            layer1Errors: layer1Result.errors,
            layer1Warnings: layer1Result.warnings,
            reviewIssues,
            reviewRounds,
          },
        });
      }

      // ── Actualizar fase según contenido de la respuesta ──
      const newStatus = detectPhase(responseText || '', session.status);
      if (newStatus !== session.status) {
        await db
          .update(schema.jarvisSessions)
          .set({ status: newStatus })
          .where(eq(schema.jarvisSessions.id, sessionId));
      }

      // Respuesta normal (Fase 1 o 2)
      res.json({ response: responseText });
    } catch (error: any) {
      await log.capture('api_error', 'Error en /api/chat', error, { sessionId }).catch(() => {});
      console.error('❌ Error en /api/chat:', error.message || error);
      res.status(500).json({ error: "Jarvis no pudo responder. Revisa la consola del servidor." });
    }
  });

  // ── Validación independiente (Capa 1) ──
  app.post("/api/validate", async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Falta el contenido de la skill" });

    const result = validateSkill(content);
    res.json(result);
  });

  // ── Revisión adversarial independiente (Capa 2) ──
  app.post("/api/review", async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Falta el contenido de la skill" });

    try {
      const result = await adversarialReview(content);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Error en revisión adversarial" });
    }
  });

  // ── Transcripción de audio (DeepSeek Flash) ──
  app.post("/api/audio", async (req, res) => {
    const { text, audioData } = req.body;
    console.log(`🎙️ Solicitud de audio recibida. Texto: "${text?.substring(0, 50)}..."`);

    try {
      let transcription = text;

      if (!transcription) {
        return res.status(400).json({ error: "No se recibió texto válido" });
      }

      // 🧠 Refinar transcripción con DeepSeek Flash (directo, sin pasar por el razonador V4)
      const cleanText = await deepseekChat('flash', [
        { role: 'system', content: 'Actúa como un procesador de transcripciones de voz para JCS v2.0. Tu misión es refinar la transcripción recibida manteniendo la estructura del habla natural: respeta modismos, lenguaje coloquial y errores gramaticales originales del usuario. Corrige únicamente errores de transcripción fonética evidentes y mejora la puntuación para facilitar la lectura, pero NUNCA reformules el discurso ni elimines la esencia del mensaje original. No añadas notas ni comentarios. Devuelve SOLO el texto procesado.' },
        { role: 'user', content: transcription }
      ]);

      res.json({ text: cleanText.trim() });
    } catch (error) {
      console.error('Error en transcripción:', error);
      res.status(500).json({ error: "Error al procesar audio" });
    }
  });

  // ── Skills generadas ──
  app.get("/api/skills", requireDb, async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      let query = db.select().from(schema.jarvisSkills).orderBy(schema.jarvisSkills.createdAt);
      
      // Ejecutar y luego filtrar si es necesario
      const allSkills = await query;
      const filtered = sessionId
        ? allSkills.filter((s) => s.sessionId === sessionId)
        : allSkills;
      
      res.json(filtered);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al obtener skills" });
    }
  });

  // ── Descarga de archivos individuales ──
  app.get("/api/skills/:id/download/:fileType", requireDb, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(schema.jarvisSkills)
        .where(eq(schema.jarvisSkills.id, req.params.id));
      const skill = rows[0];
      if (!skill) return res.status(404).json({ error: "Skill no encontrada" });

      const isSkill = req.params.fileType === 'skill';
      const filename = isSkill ? skill.skillFilename : skill.validateFilename;
      const content = isSkill ? skill.skillContent : skill.validateContent;
      const contentType = isSkill ? 'text/markdown' : 'text/x-shellscript';

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', contentType);
      res.send(content);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al descargar archivo" });
    }
  });

  // ═══════════════════════════════════════════════
  // Funciones auxiliares
  // ═══════════════════════════════════════════════

  /**
   * Detecta la fase de la conversación basándose en el contenido de la respuesta de Jarvis.
   * Transiciones: interviewing → designing → generating → validating → complete
   */
  function detectPhase(
    responseText: string,
    currentStatus: string
  ): 'interviewing' | 'designing' | 'generating' | 'validating' | 'complete' {
    const lower = responseText.toLowerCase();
    const statuses: Array<'interviewing' | 'designing' | 'generating' | 'validating' | 'complete'> = [
      'interviewing', 'designing', 'generating', 'validating', 'complete',
    ];
    const currentIdx = statuses.indexOf(currentStatus as any);

    // Señales de avance de fase (v2.0)
    if (currentIdx <= statuses.indexOf('designing') && lower.includes('plan de arnés')) {
      return 'designing';
    }
    if (currentIdx <= statuses.indexOf('generating') && (lower.includes('fase 3') || lower.includes('generación'))) {
      return 'generating';
    }
    if (currentIdx <= statuses.indexOf('validating') && (lower.includes('validación') || lower.includes('plan generado por jcs'))) {
      return 'validating';
    }
    return currentStatus as any;
  }


  /**
   * Genera un validate.sh de respaldo cuando Flash no produce uno válido.
   * Incluye las validaciones específicas para la skill generada.
   */
  function generateFallbackValidateSh(skillSlug: string): string {
    return `#!/bin/bash
# validate.sh — Sensor mecánico para ${skillSlug}
# Generado por JCS v2.0. Ejecutar en el proyecto destino antes de activar la skill.

SKILL_FILE=\${1:-skill-${skillSlug}.md}
ERRORS=0

echo "=== VALIDANDO: \${SKILL_FILE} ==="

check_section() {
  if grep -qi "## \$1" "\$SKILL_FILE"; then
    echo "✅ ## \$1"
  else
    echo "❌ ERROR: Sección obligatoria ausente: ## \$1"
    ERRORS=\$((ERRORS + 1))
  fi
}

check_section "Propósito"
check_section "Herramientas Permitidas"
check_section "Herramientas Prohibidas"
check_section "Condiciones de Salida"
check_section "Instrucción de Aprendizaje Externo"
check_section "Tarjeta de Descubrimiento"

# Credenciales hardcodeadas
if grep -qiE "(api_key|secret|password|token|sk-)\s*[:=]\s*['\\"][^'\\"]{8,}" "\$SKILL_FILE"; then
  echo "❌ ERROR CRÍTICO: Posibles credenciales detectadas"
  ERRORS=\$((ERRORS + 1))
fi

# Longitud mínima
WORD_COUNT=\$(wc -w < "\$SKILL_FILE" 2>/dev/null || echo 0)
if [ "\$WORD_COUNT" -lt 100 ]; then
  echo "❌ ERROR: Skill demasiado corta (\$WORD_COUNT palabras / mínimo 100)"
  ERRORS=\$((ERRORS + 1))
fi

echo ""
if [ \$ERRORS -eq 0 ]; then
  echo "✅ VALIDACIÓN EXITOSA — Skill lista para activar"
  exit 0
else
  echo "❌ VALIDACIÓN FALLIDA — \$ERRORS error(es). Corregir antes de activar."
  exit 1
fi
`;
  }

  // ═══════════════════════════════════════════════
  // Vite middleware (dev) o static (prod)
  // ═══════════════════════════════════════════════
  if (process.env.NODE_ENV !== "production") {
    console.log("⚡ Activando Vite middleware (modo dev)...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

// ═══════════════════════════════════════════════
// Arranque del servidor local (ignorado en Vercel)
// ═══════════════════════════════════════════════
if (!process.env.VERCEL) {
  startServer().then((app) => {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`\n✅ Jarvis JCS v2.0 listo en http://localhost:${PORT}`);
      console.log(`   DeepSeek V4 Pro: ${process.env.DEEPSEEK_V4_MODEL || 'deepseek-reasoner'}`);
      console.log(`   DeepSeek Flash:  ${process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat'}`);
      console.log(`   BD: ${process.env.DATABASE_URL || "file:local.db"}\n`);
    });
  }).catch((err) => {
    console.error('❌ Error fatal al iniciar el servidor:', err);
    process.exit(1);
  });
}

export { startServer as createJarvisApp };
