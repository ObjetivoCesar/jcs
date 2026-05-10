import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runJarvisTurn, generateHarnessPlan } from "./lib/jarvis-core.js";
import { deepseekChat } from "./lib/deepseek-client.js";
import { validateSkill } from "./lib/validators/skill-validator.js";
import { adversarialReview } from "./lib/validators/adversarial-reviewer.js";
import { recallContext, processEntities, summarizeSession } from "./lib/memory/engine.js";
import { errorLogger } from "./lib/self-harness/error-logger.js";
import { feedbackEngine } from "./lib/self-harness/feedback-engine.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function uuid() {
  return crypto.randomUUID();
}

async function startServer() {
  console.log("🚀 Iniciando Jarvis JCS v2.0...");

  // dotenv es opcional — en Vercel solo se usan las env vars del dashboard
  try { await import("dotenv/config"); } catch {}
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

  // ── Base de datos Supabase (via @supabase/supabase-js) — opcional ──
  // Usa NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ya en Vercel)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let supabase: any = null;
  let log: any = { capture: async () => {}, low: async () => {}, medium: async () => {}, high: async () => {}, critical: async () => {} };
  let feedback: any = { analyzeAndGenerateRules: async () => [], loadActiveRules: async () => '' };

  if (supabaseUrl && supabaseKey) {
    console.log(`☁️  Conectando a Supabase via @supabase/supabase-js...`);
    try {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });

      // Verificar conexión
      const { error: healthError } = await supabase.from('jarvis_sessions').select('id').limit(1);
      if (healthError && healthError.code !== 'PGRST116') { // PGRST116 = tabla vacía, normal
        console.error('❌ Error al verificar conexión a Supabase:', healthError.message);
        supabase = null;
      } else {
        console.log('✅ Conexión a Supabase OK. Tablas jarvis_* detectadas.');

        // ── Inicializar self-harness ──
        log = errorLogger(supabase);
        feedback = feedbackEngine(supabase);
      }
    } catch (e) {
      console.error('❌ Error al conectar a Supabase:', e);
      console.log('⚠️  Continuando sin BD...');
    }
  } else {
    console.log('⚠️  Sin NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY — modo sin BD.');
    console.log('   Configura estas variables en Vercel para funcionalidad completa.');
  }

  // ═══════════════════════════════════════════════
  // API ROUTES
  // ═══════════════════════════════════════════════

  // ── Health ──
  app.get("/api/health", async (_req, res) => {
    const dbStatus = supabase ? 'connected' : 'not_configured';
    res.json({
      status: supabase ? "ok" : "ok",
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
    if (!supabase) {
      return res.json({
        status: "ok",
        version: "2.1",
        db: "not_configured",
        message: "Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel.",
        stats: { recentErrors: 0, activeRules: 0, activeSessions: 0 },
        recentErrors: [],
        activeRules: [],
        activeSessions: [],
      });
    }
    try {
      // Errores recientes
      const { data: recentErrors } = await supabase
        .from('jarvis_error_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      // Reglas activas
      const { data: activeRules } = await supabase
        .from('jarvis_feedback_rules')
        .select('*')
        .eq('active', true)
        .order('occurrence_count', { ascending: false })
        .limit(10);

      // Sesiones activas
      const { data: activeSessions } = await supabase
        .from('jarvis_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      res.json({
        status: "ok",
        version: "2.1",
        db: "supabase",
        timestamp: Date.now(),
        stats: {
          recentErrors: recentErrors?.length || 0,
          activeRules: activeRules?.length || 0,
          activeSessions: activeSessions?.length || 0,
        },
        recentErrors: recentErrors || [],
        activeRules: activeRules || [],
        activeSessions: activeSessions || [],
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
  const requireDb = (_req: any, res: any, next: any) => {
    if (!supabase) {
      return res.status(503).json({
        error: "Base de datos no configurada",
        message: "Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel.",
      });
    }
    next();
  };

  // ── Sesiones ──
  app.get("/api/sessions", requireDb, async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('jarvis_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al obtener sesiones" });
    }
  });

  app.post("/api/sessions", requireDb, async (_req, res) => {
    try {
      const id = uuid();
      const { error } = await supabase.from('jarvis_sessions').insert({
        id,
        created_at: Date.now(),
        status: 'interviewing',
      });
      if (error) throw error;
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
      await supabase.from('jarvis_messages').delete().eq('session_id', id);
      await supabase.from('jarvis_skills').delete().eq('session_id', id);
      await supabase.from('jarvis_memory_facts').delete().eq('session_id', id);
      await supabase.from('jarvis_memory_sessions').delete().eq('session_id', id);
      await supabase.from('jarvis_sessions').delete().eq('id', id);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al eliminar la sesión" });
    }
  });

  // ── Mensajes de una sesión ──
  app.get("/api/sessions/:id/messages", requireDb, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('jarvis_messages')
        .select('*')
        .eq('session_id', req.params.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al obtener mensajes" });
    }
  });

  // ── CHAT — endpoint principal ──
  app.post("/api/chat", requireDb, async (req, res) => {
    const { sessionId, message, isAudio } = req.body;

    // Buscar sesión
    const { data: sessionRows, error: sessionError } = await supabase
      .from('jarvis_sessions')
      .select('*')
      .eq('id', sessionId)
      .limit(1);
    if (sessionError) return res.status(500).json({ error: sessionError.message });
    const session = sessionRows?.[0];
    if (!session) return res.status(404).json({ error: "Sesión no encontrada" });

    // Historial
    const { data: history } = await supabase
      .from('jarvis_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    // Guardar mensaje del usuario
    await supabase.from('jarvis_messages').insert({
      id: uuid(),
      session_id: sessionId,
      role: 'user',
      content: message,
      created_at: Date.now(),
      is_audio: !!isAudio,
    });

    try {
      // 🧠 Memoria: recuperar contexto de sesiones anteriores
      const memoryContext = await recallContext(supabase, message).catch(() => '');

      // 🧠 Inyectar contexto de memoria en el mensaje (si hay)
      const messageWithMemory = memoryContext
        ? `${memoryContext}\n\n---\nMENSAJE ACTUAL:\n${message}`
        : message;

      // ── Fase 1 y 2: Jarvis V4 Pro razona ──
      const responseText = await runJarvisTurn(
        session as any,
        (history || []).map((m) => ({ role: m.role as any, content: m.content })),
        messageWithMemory,
        (session as any).skillType || 'otro'
      );

      // Guardar respuesta de Jarvis
      await supabase.from('jarvis_messages').insert({
        id: uuid(),
        session_id: sessionId,
        role: 'assistant',
        content: responseText || '',
        created_at: Date.now(),
      });

      // ── Detectar si es generación de ecosistema de arnés (Fase 3) ──
      const lowerText = (responseText || '').toLowerCase();
      const hasPlanHeader = lowerText.includes('plan de arnés') || lowerText.includes('plan de arnes');
      const hasHarnessStructure = lowerText.includes('├──') || lowerText.includes('└──');
      const isHarnessGeneration = hasPlanHeader && hasHarnessStructure;

      if (isHarnessGeneration) {
        // Intentar extraer nombre del proyecto del historial reciente
        let projectName = (session as any).project_name;
        if (!projectName || projectName === 'unnamed') {
          const userMessages = (history || [])
            .filter((m) => m.role === 'user')
            .map((m) => m.content)
            .join(' ');
          const nameMatch = userMessages.match(
            /(?:skill|agente)\s+(?:para|de|que)?\s*(?:un|una|el|la)?\s*([a-zA-Záéíóúñ]{3,20}(?:\s+[a-zA-Záéíóúñ]{2,20}){0,2})/i
          );
          projectName = nameMatch ? nameMatch[1].trim() : 'skill-generada';
          await supabase.from('jarvis_sessions')
            .update({ project_name: projectName })
            .eq('id', sessionId);
        }

        const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        // ── Fase 3: Flash genera el ecosistema completo ──
        console.log('⚡ Generando ecosistema de arnés con Flash...');
        const flashOutput = await generateHarnessPlan(
          session as any,
          (history || []).map((m) => ({ role: m.role as any, content: m.content }))
        );

        // Parsear los archivos separados por ===FILE_SPLIT===
        const parts = flashOutput.split('===FILE_SPLIT===');
        
        let agentsMd = (parts[0] || '').trim();
        let orquestadorSkill = (parts[1] || '').trim();
        let validateContent = (parts[2] || '').trim();
        let progressTemplate = (parts[3] || '').trim();

        const cleanMarkdown = (text: string) => text.replace(/^```(?:markdown|md|bash|sh|json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        
        agentsMd = cleanMarkdown(agentsMd);
        orquestadorSkill = cleanMarkdown(orquestadorSkill);
        validateContent = cleanMarkdown(validateContent);
        progressTemplate = cleanMarkdown(progressTemplate);

        const skillContent = agentsMd;
        const skillFilename = 'AGENTS.md';
        const harnessData = JSON.stringify({
          agentsMd,
          orquestadorSkill,
          validateContent,
          progressTemplate,
          fullOutput: flashOutput
        });

        if (!validateContent || validateContent.length < 20) {
          validateContent = generateFallbackValidateSh(slug);
        }

        const validateFilename = 'validate.sh';

        // ── Capa 1: Validación determinística ──
        console.log('🔍 Capa 1: Validación determinística...');
        const layer1Result = validateSkill(skillContent);
        const layer1Passed = layer1Result.valid;
        console.log(layer1Passed ? '  ✅ Capa 1 aprobada' : `  ❌ Capa 1 falló: ${layer1Result.errors.join('; ')}`);

        // ── Capa 2: Revisor adversarial (V4 Pro) ──
        console.log('🧠 Capa 2: Revisor adversarial (V4 Pro)...');
        const reviewResult = await adversarialReview(skillContent);
        const reviewRounds = 1;
        const reviewIssues = reviewResult.issues;
        const layer2Passed = reviewResult.approved;
        console.log(layer2Passed ? '  ✅ Capa 2 aprobada' : `  ❌ Capa 2 falló: ${reviewIssues.join('; ')}`);

        const fullyValidated = layer1Passed && layer2Passed;

        // Guardar skill
        await supabase.from('jarvis_skills').insert({
          id: uuid(),
          session_id: sessionId,
          skill_filename: skillFilename,
          skill_content: skillContent,
          validate_filename: validateFilename,
          validate_content: validateContent,
          harness_data: harnessData,
          layer1_passed: layer1Passed,
          layer2_passed: layer2Passed,
          validated: fullyValidated,
          review_rounds: reviewRounds,
          created_at: Date.now(),
        });

        // Actualizar estado de sesión
        await supabase.from('jarvis_sessions')
          .update({ status: fullyValidated ? 'complete' : 'validating' })
          .eq('id', sessionId);

        console.log(
          `📦 Skill: ${skillFilename} + ${validateFilename} | ` +
          `C1:${layer1Passed ? '✅' : '❌'} C2:${layer2Passed ? '✅' : '❌'} | ` +
          `Final: ${fullyValidated ? '✅ VALIDADA' : '❌ RECHAZADA'}`
        );

        // 🧠 Memoria: resumir sesión
        summarizeSession(
          supabase,
          sessionId,
          [...(history || []), { role: 'user', content: message }].map((m) => ({
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

      // ── Actualizar fase según contenido ──
      const newStatus = detectPhase(responseText || '', session.status);
      if (newStatus !== session.status) {
        await supabase.from('jarvis_sessions')
          .update({ status: newStatus })
          .eq('id', sessionId);
      }

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
      let query = supabase
        .from('jarvis_skills')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al obtener skills" });
    }
  });

  // ── Descarga de archivos individuales ──
  app.get("/api/skills/:id/download/:fileType", requireDb, async (req, res) => {
    try {
      const { data: rows, error } = await supabase
        .from('jarvis_skills')
        .select('*')
        .eq('id', req.params.id)
        .limit(1);
      if (error) throw error;
      const skill = rows?.[0];
      if (!skill) return res.status(404).json({ error: "Skill no encontrada" });

      const isSkill = req.params.fileType === 'skill';
      const filename = isSkill ? skill.skill_filename : skill.validate_filename;
      const content = isSkill ? skill.skill_content : skill.validate_content;
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
    // Vite se importa dinámicamente — no en producción/Vercel
    const { createServer: createViteServer } = await import("vite");
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
