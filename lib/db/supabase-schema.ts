/**
 * lib/db/supabase-schema.ts — Esquema PostgreSQL para Supabase.
 * TODAS las tablas con prefijo "jarvis_" para coexistir en proyecto compartido.
 * Migración directa del esquema SQLite original + nuevas tablas de self-harness.
 */

import { pgTable, text, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

// ═══════════════════════════════════════════════
// JARVIS SESSIONS — Sesiones de trabajo
// ═══════════════════════════════════════════════
export const jarvisSessions = pgTable('jarvis_sessions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  status: text('status', {
    enum: ['interviewing', 'designing', 'generating', 'validating', 'complete'],
  }).default('interviewing'),
  projectName: text('project_name'),
  skillPurpose: text('skill_purpose'),
  skillType: text('skill_type', {
    enum: ['extractor', 'integrador', 'orquestador', 'validador', 'notificador', 'otro'],
  }).default('otro'),
  architecturePlan: text('architecture_plan'),
});

// ═══════════════════════════════════════════════
// JARVIS MESSAGES — Mensajes de conversación
// ═══════════════════════════════════════════════
export const jarvisMessages = pgTable('jarvis_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => jarvisSessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'reviewer'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  isAudio: boolean('is_audio').default(false),
});

// ═══════════════════════════════════════════════
// JARVIS SKILLS — Ecosistemas de arnés generados
// ═══════════════════════════════════════════════
export const jarvisSkills = pgTable('jarvis_skills', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => jarvisSessions.id, { onDelete: 'cascade' }),
  skillFilename: text('skill_filename').notNull(),
  skillContent: text('skill_content').notNull(),
  validateFilename: text('validate_filename').notNull(),
  validateContent: text('validate_content').notNull(),
  harnessData: text('harness_data'),
  layer1Passed: boolean('layer1_passed').default(false),
  layer2Passed: boolean('layer2_passed').default(false),
  validated: boolean('validated').default(false),
  reviewRounds: integer('review_rounds').default(0),
  createdAt: integer('created_at').notNull(),
});

// ═══════════════════════════════════════════════
// JARVIS LESSONS — Lecciones aprendidas (feedback loop)
// ═══════════════════════════════════════════════
export const jarvisLessons = pgTable('jarvis_lessons', {
  id: text('id').primaryKey(),
  tag: text('tag', {
    enum: ['extractor', 'integrador', 'orquestador', 'validador', 'notificador', 'otro'],
  }).notNull(),
  errorType: text('error_type').notNull(),
  description: text('description').notNull(),
  fixApplied: text('fix_applied').notNull(),
  automated: boolean('automated').default(false), // true = generada por feedback engine
  createdAt: integer('created_at').notNull(),
});

// ═══════════════════════════════════════════════
// JARVIS MEMORY — Memoria entre sesiones (Gbrain-style)
// ═══════════════════════════════════════════════
export const jarvisMemoryEntities = pgTable('jarvis_memory_entities', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type', {
    enum: ['person', 'project', 'tool', 'client', 'concept'],
  }).notNull(),
  description: text('description'),
  metadata: text('metadata'),
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  occurrenceCount: integer('occurrence_count').default(1),
});

export const jarvisMemoryFacts = pgTable('jarvis_memory_facts', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => jarvisSessions.id, { onDelete: 'set null' }),
  factType: text('fact_type', {
    enum: ['preference', 'decision', 'lesson', 'pattern', 'correction'],
  }).notNull(),
  content: text('content').notNull(),
  entities: text('entities'),
  importance: integer('importance').default(3),
  createdAt: integer('created_at').notNull(),
  lastAccessed: integer('last_accessed'),
  accessCount: integer('access_count').default(0),
});

export const jarvisMemorySessions = pgTable('jarvis_memory_sessions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => jarvisSessions.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  keyDecisions: text('key_decisions'),
  entitiesMentioned: text('entities_mentioned'),
  skillsGenerated: text('skills_generated'),
  tokenEstimate: integer('token_estimate').default(0),
  createdAt: integer('created_at').notNull(),
});

export const jarvisMemoryLinks = pgTable('jarvis_memory_links', {
  id: text('id').primaryKey(),
  sourceType: text('source_type', {
    enum: ['fact', 'entity', 'session'],
  }).notNull(),
  sourceId: text('source_id').notNull(),
  targetType: text('target_type', {
    enum: ['fact', 'entity', 'session'],
  }).notNull(),
  targetId: text('target_id').notNull(),
  linkType: text('link_type', {
    enum: ['related_to', 'mentioned_in', 'derived_from', 'contradicts'],
  }).notNull(),
  createdAt: integer('created_at').notNull(),
});

// ═══════════════════════════════════════════════
// JARVIS ERROR LOG — Self-harness: errores estructurados
// ═══════════════════════════════════════════════
export const jarvisErrorLog = pgTable('jarvis_error_log', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => jarvisSessions.id, { onDelete: 'set null' }),
  errorType: text('error_type').notNull(),    // 'api_error' | 'validation_failure' | 'db_error' | 'deployment'
  errorCode: text('error_code'),              // identificador único del error
  message: text('message').notNull(),         // mensaje legible
  stackTrace: text('stack_trace'),
  metadata: text('metadata'),                 // JSON con contexto adicional
  severity: text('severity', {
    enum: ['low', 'medium', 'high', 'critical'],
  }).default('medium'),
  resolved: boolean('resolved').default(false),
  resolvedAt: integer('resolved_at'),
  createdAt: integer('created_at').notNull(),
});

// ═══════════════════════════════════════════════
// JARVIS FEEDBACK RULES — Reglas generadas automáticamente
// ═══════════════════════════════════════════════
export const jarvisFeedbackRules = pgTable('jarvis_feedback_rules', {
  id: text('id').primaryKey(),
  ruleType: text('rule_type', {
    enum: ['prohibition', 'validation', 'correction', 'alert'],
  }).notNull(),
  description: text('description').notNull(),
  condition: text('condition').notNull(),     // condición que dispara la regla
  action: text('action').notNull(),            // acción a tomar
  sourceErrorType: text('source_error_type'),  // tipo de error que originó la regla
  occurrenceCount: integer('occurrence_count').default(1),
  active: boolean('active').default(true),
  createdAt: integer('created_at').notNull(),
  lastTriggeredAt: integer('last_triggered_at'),
});
