/**
 * lib/memory/detector.ts — Detección de entidades y decisiones en texto.
 * Parte del sistema JSQLite Memory (Gbrain-style adaptado a DeepSeek).
 */

export interface DetectedEntity {
  name: string;
  type: 'person' | 'project' | 'tool' | 'client' | 'concept';
  confidence: number;
}

const ENTITY_PATTERNS: { pattern: RegExp; type: DetectedEntity['type']; extractGroup?: number }[] = [
  { pattern: /\b(?:SaaS|app|proyecto|sistema|plataforma)\s+["\u00AB]?([A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1][\w\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1]+(?:\s+[\w\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1]+){0,3})["\u00BB]?/g, type: 'project', extractGroup: 1 },
  { pattern: /\b(pdf-parse|Whisper|DeepSeek|OpenAI|Claude|GPT|Gemini|Turso|Drizzle|React|Express|Vite|Tailwind|Next\.?js|Node\.?js|MCP|SQLite|Supabase)\b/gi, type: 'tool' },
  { pattern: /\b(?:C\u00E9sar|Abel|Joaqu\u00EDn|Enrique)\b/gi, type: 'person' },
  { pattern: /\b(?:cliente|contadora|abogado|doctora?)\s+(?:de\s+)?([A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1][\w\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1]+(?:\s+[\w\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1]+)?)/gi, type: 'client', extractGroup: 1 },
  { pattern: /\b(?:ingenier\u00EDa\s+de\s+arn\u00E9s|harness\s+engineering|skill|agente|IA|inteligencia\s+artificial|MCP|AGENTS\.md|memoria\s+persistente)\b/gi, type: 'concept' },
];

export function detectEntities(text: string): DetectedEntity[] {
  const found: Map<string, DetectedEntity> = new Map();

  for (const { pattern, type, extractGroup } of ENTITY_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = (extractGroup ? match[extractGroup] : match[0]).trim();
      if (!name || name.length < 2) continue;
      const key = `${name}:${type}`.toLowerCase();
      const existing = found.get(key);
      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.25);
      } else {
        found.set(key, { name, type, confidence: 0.6 });
      }
    }
  }

  return [...found.values()].sort((a, b) => b.confidence - a.confidence);
}

const DECISION_PATTERNS = [
  /(?:decid[íi]|voy\s+a|vamos\s+a|usar[eé]|implementar[eé]|elijamos)\s+(.+?)(?:[.;]|$)/gi,
  /(?:mejor|prefiero)\s+(.+?)\s+(?:que|sobre|en\s+vez\s+de)\s+(.+?)(?:[.;]|$)/gi,
  /(?:aprobado|aceptado)\b/gi,
];

export function detectDecisions(text: string): string[] {
  const decisions: string[] = [];
  for (const pattern of DECISION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      decisions.push(match[0].trim());
    }
  }
  return decisions;
}
