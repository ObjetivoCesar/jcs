import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── Sesiones de trabajo ──
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  status: text('status')
    .$type<'interviewing' | 'designing' | 'generating' | 'validating' | 'complete'>()
    .default('interviewing'),
  projectName: text('project_name'),
  skillPurpose: text('skill_purpose'),
  skillType: text('skill_type')
    .$type<'extractor' | 'integrador' | 'orquestador' | 'validador' | 'notificador' | 'otro'>()
    .default('otro'), // ← tag para revelación progresiva de lecciones
  architecturePlan: text('architecture_plan'), // JSON string — plan aprobado en Fase 2
});

// ── Mensajes de la conversación ──
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  role: text('role')
    .$type<'user' | 'assistant' | 'reviewer'>() // ← 'reviewer' = agente adversarial
    .notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  isAudio: integer('is_audio', { mode: 'boolean' }).default(false),
});

// ── Ecosistemas de arnés generados (v2.0: Múltiples archivos por proyecto) ──
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  // Archivo principal (Mapa de navegación)
  skillFilename: text('skill_filename').notNull(), // ej: "AGENTS.md"
  skillContent: text('skill_content').notNull(),
  // Script de validación
  validateFilename: text('validate_filename').notNull(),
  validateContent: text('validate_content').notNull(),
  // Ecosistema completo (JSON con todos los archivos: skill-*.md, progress.json, etc.)
  harnessData: text('harness_data'), 
  // Pipeline de validación de 2 capas
  layer1Passed: integer('layer1_passed', { mode: 'boolean' }).default(false), 
  layer2Passed: integer('layer2_passed', { mode: 'boolean' }).default(false), 
  validated: integer('validated', { mode: 'boolean' }).default(false),       
  reviewRounds: integer('review_rounds').default(0),                         
  createdAt: integer('created_at').notNull(),
});


// ── Lecciones aprendidas (indexadas por tipo de skill) ──
export const lessonsLearned = sqliteTable('lessons_learned', {
  id: text('id').primaryKey(),
  tag: text('tag')
    .$type<'extractor' | 'integrador' | 'orquestador' | 'validador' | 'notificador' | 'otro'>()
    .notNull(), // ← tag para revelación progresiva
  errorType: text('error_type').notNull(),
  description: text('description').notNull(),
  fixApplied: text('fix_applied').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ═══════════════════════════════════════════════
// JSQLite Memory — Memoria entre sesiones (Gbrain-style)
// ═══════════════════════════════════════════════

// ── Entidades detectadas (personas, proyectos, herramientas, clientes) ──
export const memoryEntities = sqliteTable('memory_entities', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(), // ej: "SaaS SuperCías", "César"
  type: text('type')
    .$type<'person' | 'project' | 'tool' | 'client' | 'concept'>()
    .notNull(),
  description: text('description'),
  metadata: text('metadata'), // JSON: tags, URLs, etc.
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  occurrenceCount: integer('occurrence_count').default(1),
});

// ── Hechos aprendidos (decisiones, preferencias, patrones, lecciones) ──
export const memoryFacts = sqliteTable('memory_facts', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  factType: text('fact_type')
    .$type<'preference' | 'decision' | 'lesson' | 'pattern' | 'correction'>()
    .notNull(),
  content: text('content').notNull(), // el hecho en sí
  entities: text('entities'), // JSON array de entity IDs relacionados
  importance: integer('importance').default(3), // 1 (baja) a 5 (crítica)
  createdAt: integer('created_at').notNull(),
  lastAccessed: integer('last_accessed'),
  accessCount: integer('access_count').default(0),
});

// ── Resúmenes de sesión (para que Jarvis recuerde de qué hablaron) ──
export const memorySessions = sqliteTable('memory_sessions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  summary: text('summary').notNull(), // resumen en 2-3 oraciones
  keyDecisions: text('key_decisions'), // JSON array
  entitiesMentioned: text('entities_mentioned'), // JSON array de entity IDs
  skillsGenerated: text('skills_generated'), // JSON array de skill IDs
  tokenEstimate: integer('token_estimate').default(0),
  createdAt: integer('created_at').notNull(),
});

// ── Links entre hechos y entidades (grafo de conocimiento ligero) ──
export const memoryLinks = sqliteTable('memory_links', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').$type<'fact' | 'entity' | 'session'>().notNull(),
  sourceId: text('source_id').notNull(),
  targetType: text('target_type').$type<'fact' | 'entity' | 'session'>().notNull(),
  targetId: text('target_id').notNull(),
  linkType: text('link_type').$type<'related_to' | 'mentioned_in' | 'derived_from' | 'contradicts'>().notNull(),
  createdAt: integer('created_at').notNull(),
});
