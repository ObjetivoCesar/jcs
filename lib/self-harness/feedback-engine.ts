/**
 * lib/self-harness/feedback-engine.ts — Motor de Feedback Loop automático.
 * 
 * Pilar 4 (Feedback Loop): Convierte errores recurrentes en reglas permanentes.
 * 
 * Regla: si un mismo error_type ocurre 3+ veces → genera una regla y una lección.
 * Las reglas se cargan al inicio de cada sesión como restricciones inmutables.
 */

import { eq, desc, count, gte, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/supabase-schema.js';
import crypto from 'crypto';

type DB = NodePgDatabase<typeof schema>;

const THRESHOLD_RECURRENCE = 3; // veces para considerar "recurrente"
const LOOKBACK_HOURS = 24;      // ventana de tiempo

export function feedbackEngine(db: DB) {
  /**
   * Analiza errores recientes y genera reglas si hay recurrencia.
   * Se llama después de cada registro de error.
   */
  async function analyzeAndGenerateRules(errorType: string): Promise<string[]> {
    const rulesCreated: string[] = [];
    const cutoff = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000;

    try {
      // Contar ocurrencias del mismo error_type en las últimas N horas
      const [result] = await db
        .select({ count: count() })
        .from(schema.jarvisErrorLog)
        .where(
          and(
            eq(schema.jarvisErrorLog.errorType, errorType),
            gte(schema.jarvisErrorLog.createdAt, cutoff)
          )
        );

      const occurrences = result?.count ?? 0;

      if (occurrences >= THRESHOLD_RECURRENCE) {
        // Verificar si ya existe una regla para este error_type
        const existingRules = await db
          .select()
          .from(schema.jarvisFeedbackRules)
          .where(
            and(
              eq(schema.jarvisFeedbackRules.sourceErrorType, errorType),
              eq(schema.jarvisFeedbackRules.active, true)
            )
          )
          .limit(1);

        if (existingRules.length === 0) {
          // Generar regla automática
          const ruleId = crypto.randomUUID();
          const lessonId = crypto.randomUUID();

          const ruleDescription = generateRuleDescription(errorType);
          const lessonDescription = generateLessonDescription(errorType);

          await db.insert(schema.jarvisFeedbackRules).values({
            id: ruleId,
            ruleType: deriveRuleType(errorType),
            description: ruleDescription,
            condition: `error_type == "${errorType}" AND occurrences >= ${THRESHOLD_RECURRENCE}`,
            action: deriveAction(errorType),
            sourceErrorType: errorType,
            occurrenceCount: occurrences,
            active: true,
            createdAt: Date.now(),
          });

          // También crear lección aprendida automática
          await db.insert(schema.jarvisLessons).values({
            id: lessonId,
            tag: 'otro',
            errorType,
            description: lessonDescription,
            fixApplied: deriveFix(errorType),
            automated: true,
            createdAt: Date.now(),
          });

          rulesCreated.push(ruleId);
          console.log(`🤖 [Feedback Engine] Regla automática creada para "${errorType}" (${occurrences} ocurrencias)`);
        } else {
          // Actualizar contador de ocurrencias
          await db
            .update(schema.jarvisFeedbackRules)
            .set({
              occurrenceCount: occurrences,
              lastTriggeredAt: Date.now(),
            })
            .where(eq(schema.jarvisFeedbackRules.id, existingRules[0].id));
        }
      }
    } catch (e) {
      console.error('[Feedback Engine] Error al analizar recurrencia:', e);
    }

    return rulesCreated;
  }

  /**
   * Carga todas las reglas activas para inyectar en el contexto de Jarvis.
   */
  async function loadActiveRules(): Promise<string> {
    try {
      const rules = await db
        .select()
        .from(schema.jarvisFeedbackRules)
        .where(eq(schema.jarvisFeedbackRules.active, true))
        .orderBy(desc(schema.jarvisFeedbackRules.occurrenceCount))
        .limit(20);

      if (rules.length === 0) return '';

      return (
        'REGLAS DE FEEDBACK AUTOMÁTICO (cargadas al inicio de sesión):\n' +
        rules.map((r, i) =>
          `${i + 1}. [${r.ruleType}] ${r.description} (${r.occurrenceCount} ocurrencias)`
        ).join('\n')
      );
    } catch {
      return '';
    }
  }

  return {
    analyzeAndGenerateRules,
    loadActiveRules,
  };
}

// ── Helpers para generar descripciones legibles ──

function generateRuleDescription(errorType: string): string {
  const map: Record<string, string> = {
    api_error: 'No se debe reintentar la API de DeepSeek más de 3 veces sin esperar 5 segundos.',
    validation_failure: 'Todo plan de arnés debe ser validado por Capa 1 y Capa 2 antes de entregarse.',
    db_error: 'Las operaciones de BD deben incluir try/catch y registrar el error antes de fallar.',
    deployment: 'No desplegar a Vercel sin ejecutar validate.sh primero.',
  };
  return map[errorType] || `Error recurrente detectado: "${errorType}". Revisar logs.`;
}

function generateLessonDescription(errorType: string): string {
  const map: Record<string, string> = {
    api_error: 'Error: Timeout recurrente de DeepSeek API. Fix: Implementar reintento exponencial con jitter y límite de 3 intentos.',
    validation_failure: 'Error: Plan de arnés rechazado por validación. Fix: Ejecutar validate.sh antes de presentar el plan al usuario.',
    db_error: 'Error: Conexión a BD falló repetidamente. Fix: Verificar DATABASE_URL y que Supabase esté activo.',
    deployment: 'Error: Despliegue roto por validate.sh ausente. Fix: Añadir validate.sh como prebuild hook.',
  };
  return map[errorType] || `Error recurrente: ${errorType}. Revisar sistema.`;
}

function deriveRuleType(errorType: string): 'prohibition' | 'validation' | 'correction' | 'alert' {
  if (errorType === 'api_error') return 'correction';
  if (errorType === 'validation_failure') return 'validation';
  if (errorType === 'deployment') return 'prohibition';
  return 'alert';
}

function deriveAction(errorType: string): string {
  const map: Record<string, string> = {
    api_error: 'Reintentar con backoff exponencial. Si falla 3 veces consecutivas, detener y notificar.',
    validation_failure: 'Regenerar el plan con las reglas de validación corregidas. No entregar sin aprobar Capa 1 y Capa 2.',
    db_error: 'Intentar reconectar. Si falla, usar fallback a console.error y alertar al administrador.',
    deployment: 'Bloquear despliegue hasta que validate.sh pase. Registrar en error_log.',
  };
  return map[errorType] || 'Registrar y notificar al administrador.';
}

function deriveFix(errorType: string): string {
  const map: Record<string, string> = {
    api_error: 'Implementar reintento con backoff exponencial (3 intentos, delay: 1s, 3s, 5s).',
    validation_failure: 'Pre-validar el plan con skill-validator.ts antes de presentarlo.',
    db_error: 'Usar connection pooling de Supabase y verificar que DATABASE_URL sea correcta.',
    deployment: 'Ejecutar validate.sh en CI/CD pipeline antes del deploy.',
  };
  return map[errorType] || 'Revisar y corregir el error antes de continuar.';
}
