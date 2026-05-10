/**
 * lib/self-harness/error-logger.ts — Registro estructurado de errores.
 * 
 * Pilar 3 (Sensor): Toda excepción en JCS se captura y persiste.
 * Pilar 4 (Feedback Loop): Errores repetitivos generan reglas automáticas.
 * 
 * Uso:
 *   import { errorLogger } from './lib/self-harness/error-logger.js';
 *   const log = errorLogger(db);
 *   await log.error('api_error', 'DeepSeek API timeout', { sessionId });
 *   await log.critical('db_error', 'Base de datos caída', err);
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/supabase-schema.js';
import crypto from 'crypto';

type DB = NodePgDatabase<typeof schema>;

export interface ErrorLogEntry {
  errorType: 'api_error' | 'validation_failure' | 'db_error' | 'deployment' | 'system';
  errorCode?: string;
  message: string;
  sessionId?: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
}

export function errorLogger(db: DB) {
  async function log(
    severity: 'low' | 'medium' | 'high' | 'critical',
    entry: ErrorLogEntry
  ): Promise<string> {
    const id = crypto.randomUUID();
    try {
      await db.insert(schema.jarvisErrorLog).values({
        id,
        sessionId: entry.sessionId || null,
        errorType: entry.errorType,
        errorCode: entry.errorCode || null,
        message: entry.message.substring(0, 1000), // límite de seguridad
        stackTrace: entry.stackTrace ? entry.stackTrace.substring(0, 3000) : null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        severity,
        resolved: false,
        createdAt: Date.now(),
      });

      // Si es crítico, también imprimir en consola con alerta
      if (severity === 'critical' || severity === 'high') {
        console.error(`🔴 [JCS-${severity.toUpperCase()}] ${entry.errorType}: ${entry.message}`);
        if (entry.stackTrace) console.error(entry.stackTrace.substring(0, 500));
      }

      return id;
    } catch (dbError) {
      // Fallback: si la BD falla, al menos imprimir
      console.error('🔴 [JCS-FATAL] No se pudo registrar error en BD:', dbError);
      console.error(`  Error original: [${entry.errorType}] ${entry.message}`);
      return 'unlogged';
    }
  }

  return {
    /** Error leve: no afecta al usuario (timeout recuperable, warning) */
    low: (entry: ErrorLogEntry) => log('low', entry),

    /** Error medio: afecta parcialmente (validación fallida, reintento) */
    medium: (entry: ErrorLogEntry) => log('medium', entry),

    /** Error grave: afecta funcionalidad (API caída, generación fallida) */
    high: (entry: ErrorLogEntry) => log('high', entry),

    /** Error crítico: sistema inoperable (BD caída, crash no recuperable) */
    critical: (entry: ErrorLogEntry) => log('critical', entry),

    /** Wrapper para try/catch: captura error completo automáticamente */
    capture: async (
      errorType: ErrorLogEntry['errorType'],
      context: string,
      error: unknown,
      opts?: { sessionId?: string; severity?: 'low' | 'medium' | 'high' | 'critical' }
    ) => {
      const err = error instanceof Error ? error : new Error(String(error));
      return log(opts?.severity || 'medium', {
        errorType,
        errorCode: err.name,
        message: `${context}: ${err.message}`,
        stackTrace: err.stack,
        sessionId: opts?.sessionId,
        metadata: { context },
      });
    },
  };
}
