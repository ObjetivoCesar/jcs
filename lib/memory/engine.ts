/**
 * lib/memory/engine.ts — Motor de memoria JSQLite (Gbrain-style).
 * 
 * Flujo automático:
 * 1. onSessionStart()  → cargar hechos y entidades relevantes
 * 2. onMessage()       → detectar entidades y decisiones en cada mensaje
 * 3. onSessionEnd()    → resumir, guardar hechos, linkear entidades
 * 
 * Adaptado de Gbrain (github.com/garrytan/gbrain) para DeepSeek + Supabase.
 */

import { eq, desc, like } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/supabase-schema.js';
import { detectEntities, detectDecisions } from './detector.js';
import crypto from 'crypto';

type DB = NodePgDatabase<typeof schema>;

// ── API Pública ──

/**
 * Al iniciar una sesión: recupera hechos y entidades relevantes
 * para inyectar en el contexto de Jarvis.
 */
export async function recallContext(
  db: DB,
  userMessage: string
): Promise<string> {
  // Detectar entidades en el primer mensaje
  const entities = detectEntities(userMessage);
  if (entities.length === 0) return '';

  // Buscar hechos relacionados con esas entidades
  const entityNames = entities.map((e) => e.name.toLowerCase());
  const relevantFacts = await db
    .select()
    .from(schema.jarvisMemoryFacts)
    .orderBy(desc(schema.jarvisMemoryFacts.importance), desc(schema.jarvisMemoryFacts.lastAccessed))
    .limit(8);

  // Filtrar hechos que mencionan alguna de las entidades detectadas
  const filtered = relevantFacts.filter((f) => {
    const factLower = f.content.toLowerCase();
    return entityNames.some((name) => factLower.includes(name));
  });

  // Marcar como accedidos
  for (const fact of filtered) {
    await db
      .update(schema.jarvisMemoryFacts)
      .set({
        lastAccessed: Date.now(),
        accessCount: (fact.accessCount || 0) + 1,
      })
      .where(eq(schema.jarvisMemoryFacts.id, fact.id));
  }

  if (filtered.length === 0) return '';

  return (
    'CONTEXTO DE SESIONES ANTERIORES:\n' +
    filtered
      .map((f, i) => `${i + 1}. [${f.factType}] ${f.content}`)
      .join('\n')
  );
}

/**
 * Al recibir un mensaje: detecta entidades y las guarda/actualiza en la BD.
 */
export async function processEntities(
  db: DB,
  message: string
): Promise<void> {
  const entities = detectEntities(message);
  const decisions = detectDecisions(message);

  for (const entity of entities) {
    // Upsert: insertar o actualizar
    const existing = await db
      .select()
      .from(schema.jarvisMemoryEntities)
      .where(eq(schema.jarvisMemoryEntities.name, entity.name))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.jarvisMemoryEntities)
        .set({
          lastSeenAt: Date.now(),
          occurrenceCount: (existing[0].occurrenceCount || 1) + 1,
        })
        .where(eq(schema.jarvisMemoryEntities.id, existing[0].id));
    } else {
      await db.insert(schema.jarvisMemoryEntities).values({
        id: crypto.randomUUID(),
        name: entity.name,
        type: entity.type,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        occurrenceCount: 1,
      });
    }
  }

  // Guardar decisiones como hechos
  for (const decision of decisions) {
    await db.insert(schema.jarvisMemoryFacts).values({
      id: crypto.randomUUID(),
      factType: 'decision',
      content: decision,
      importance: 4,
      createdAt: Date.now(),
    });
  }
}

/**
 * Al finalizar una sesión: genera resumen y guarda hechos clave.
 */
export async function summarizeSession(
  db: DB,
  sessionId: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const allText = messages.map((m) => m.content).join('\n');

  // Generar resumen simple (sin llamada a IA — para mantenerlo ligero)
  const totalMessages = messages.length;
  const userMessages = messages.filter((m) => m.role === 'user').length;
  const entities = detectEntities(allText);
  const decisions = detectDecisions(allText);

  const summaryLines = [
    `Sesi\u00f3n con ${totalMessages} mensajes (${userMessages} del usuario).`,
    entities.length > 0
      ? `Entidades detectadas: ${entities.map((e) => e.name).join(', ')}.`
      : 'Sin entidades nuevas detectadas.',
    decisions.length > 0
      ? `Decisiones: ${decisions.join('; ')}.`
      : 'Sin decisiones expl\u00edcitas.',
  ];

  const summary = summaryLines.join(' ');

  // Guardar resumen de sesión
  await db.insert(schema.jarvisMemorySessions).values({
    id: crypto.randomUUID(),
    sessionId,
    summary,
    keyDecisions: JSON.stringify(decisions),
    entitiesMentioned: JSON.stringify(entities.map((e) => e.name)),
    tokenEstimate: Math.round(allText.length / 4), // estimación rough
    createdAt: Date.now(),
  });

  // Guardar preferencias/decisiones como hechos de alta importancia
  for (const decision of decisions) {
    await db.insert(schema.jarvisMemoryFacts).values({
      id: crypto.randomUUID(),
      sessionId,
      factType: 'decision',
      content: decision,
      importance: 4,
      createdAt: Date.now(),
    });
  }

  // Guardar entidades detectadas como hechos de tipo 'pattern'
  for (const entity of entities.slice(0, 5)) {
    await db.insert(schema.jarvisMemoryFacts).values({
      id: crypto.randomUUID(),
      sessionId,
      factType: 'pattern',
      content: `El usuario mencion\u00f3 "${entity.name}" (tipo: ${entity.type})`,
      entities: JSON.stringify([entity.name]),
      importance: 2,
      createdAt: Date.now(),
    });
  }

  console.log(
    `🧠 Memoria: ${entities.length} entidades, ${decisions.length} decisiones guardadas para sesi\u00f3n ${sessionId}`
  );

  return summary;
}

/**
 * Buscar en la memoria por palabra clave.
 */
export async function searchMemory(
  db: DB,
  query: string
): Promise<{ facts: typeof schema.jarvisMemoryFacts.$inferSelect[]; entities: typeof schema.jarvisMemoryEntities.$inferSelect[] }> {
  const facts = await db
    .select()
    .from(schema.jarvisMemoryFacts)
    .where(like(schema.jarvisMemoryFacts.content, `%${query}%`))
    .orderBy(desc(schema.jarvisMemoryFacts.importance))
    .limit(10);

  const entities = await db
    .select()
    .from(schema.jarvisMemoryEntities)
    .where(like(schema.jarvisMemoryEntities.name, `%${query}%`))
    .orderBy(desc(schema.jarvisMemoryEntities.occurrenceCount))
    .limit(5);

  return { facts, entities };
}
