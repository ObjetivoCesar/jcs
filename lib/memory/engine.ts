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

import type { SupabaseClient } from '@supabase/supabase-js';
import { detectEntities, detectDecisions } from './detector.js';
import crypto from 'crypto';

type DB = SupabaseClient;

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
  const { data: relevantFacts } = await db
    .from('jarvis_memory_facts')
    .select('*')
    .order('importance', { ascending: false })
    .order('last_accessed', { ascending: false, nullsFirst: false })
    .limit(8);

  // Filtrar hechos que mencionan alguna de las entidades detectadas
  const filtered = (relevantFacts || []).filter((f: any) => {
    const factLower = f.content.toLowerCase();
    return entityNames.some((name) => factLower.includes(name));
  });

  // Marcar como accedidos
  for (const fact of filtered) {
    await db
      .from('jarvis_memory_facts')
      .update({
        last_accessed: Date.now(),
        access_count: (fact.access_count || 0) + 1,
      })
      .eq('id', fact.id);
  }

  if (filtered.length === 0) return '';

  return (
    'CONTEXTO DE SESIONES ANTERIORES:\n' +
    filtered
      .map((f: any, i: number) => `${i + 1}. [${f.fact_type}] ${f.content}`)
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
    const { data: existing } = await db
      .from('jarvis_memory_entities')
      .select('*')
      .eq('name', entity.name)
      .limit(1);

    if (existing && existing.length > 0) {
      await db
        .from('jarvis_memory_entities')
        .update({
          last_seen_at: Date.now(),
          occurrence_count: (existing[0].occurrence_count || 1) + 1,
        })
        .eq('id', existing[0].id);
    } else {
      await db.from('jarvis_memory_entities').insert({
        id: crypto.randomUUID(),
        name: entity.name,
        type: entity.type,
        first_seen_at: Date.now(),
        last_seen_at: Date.now(),
        occurrence_count: 1,
      });
    }
  }

  // Guardar decisiones como hechos
  for (const decision of decisions) {
    await db.from('jarvis_memory_facts').insert({
      id: crypto.randomUUID(),
      fact_type: 'decision',
      content: decision,
      importance: 4,
      created_at: Date.now(),
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
  await db.from('jarvis_memory_sessions').insert({
    id: crypto.randomUUID(),
    session_id: sessionId,
    summary,
    key_decisions: JSON.stringify(decisions),
    entities_mentioned: JSON.stringify(entities.map((e) => e.name)),
    token_estimate: Math.round(allText.length / 4),
    created_at: Date.now(),
  });

  // Guardar preferencias/decisiones como hechos de alta importancia
  for (const decision of decisions) {
    await db.from('jarvis_memory_facts').insert({
      id: crypto.randomUUID(),
      session_id: sessionId,
      fact_type: 'decision',
      content: decision,
      importance: 4,
      created_at: Date.now(),
    });
  }

  // Guardar entidades detectadas como hechos de tipo 'pattern'
  for (const entity of entities.slice(0, 5)) {
    await db.from('jarvis_memory_facts').insert({
      id: crypto.randomUUID(),
      session_id: sessionId,
      fact_type: 'pattern',
      content: `El usuario mencion\u00f3 "${entity.name}" (tipo: ${entity.type})`,
      entities: JSON.stringify([entity.name]),
      importance: 2,
      created_at: Date.now(),
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
): Promise<{ facts: any[]; entities: any[] }> {
  const { data: facts } = await db
    .from('jarvis_memory_facts')
    .select('*')
    .ilike('content', `%${query}%`)
    .order('importance', { ascending: false })
    .limit(10);

  const { data: entities } = await db
    .from('jarvis_memory_entities')
    .select('*')
    .ilike('name', `%${query}%`)
    .order('occurrence_count', { ascending: false })
    .limit(5);

  return { facts: facts || [], entities: entities || [] };
}
