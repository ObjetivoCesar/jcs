import { deepseekChat, type DeepSeekMessage } from "./deepseek-client.js";
import { JARVIS_SYSTEM_PROMPT } from "./prompts/jarvis-system.js";
import { loadRelevantLessons } from "./lessons/lesson-loader.js";

export interface ChatSession {
  id: string;
  status: 'interviewing' | 'designing' | 'generating' | 'validating' | 'complete';
  projectName?: string;
  skillPurpose?: string;
  skillType?: string;
  architecturePlan?: string; // JSON string
}

/**
 * Ejecuta un turno del agente Jarvis usando DeepSeek V4 Pro (razonamiento profundo).
 * V4 Pro se usa para Fase 1 (descubrimiento/entrevista) y Fase 2 (diseño del plan).
 * La Fase 3 (generación) se ejecuta por separado con Flash.
 */
export async function runJarvisTurn(
  session: ChatSession,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  skillTag: string = 'otro'
): Promise<string> {
  const relevantLessons = await loadRelevantLessons(skillTag);
  const systemPrompt = JARVIS_SYSTEM_PROMPT.replace('{{LESSONS_RELEVANT}}', relevantLessons);

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  console.log('[Jarvis V4 Pro] Enviando turno...');
  const response = await deepseekChat('v4', messages, {
    temperature: 0.3,
    maxTokens: 4096,
  });

  return response;
}

/**
 * Genera el ecosistema de arnés completo (Fase 3) usando DeepSeek Flash.
 */
export async function generateHarnessPlan(
  session: ChatSession,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const relevantLessons = await loadRelevantLessons(session.skillType || 'otro');
  const H = '\x23'; // esbuild: usar escape hex en vez de # directo

  const GEN_FILES = [
    '1. AGENTS.md: Mapa de navegación del proyecto.',
    '2. skill-orquestador.md: Instrucciones del agente líder.',
    '3. skill-subagente-1.md (si aplica): Subagente especializado.',
    '4. validate.sh: Sensor mecánico específico.',
    '5. progress-template.json: Estructura de memoria compartida.'
  ];

  const GEN_TEMPLATE = [
    '```markdown',
    H + ' AGENTS.md',
    '[CONTENIDO]',
    '```',
    '===FILE_SPLIT===',
    '```markdown',
    H + ' SKILL: ORQUESTADOR',
    '[CONTENIDO]',
    '```',
    '===FILE_SPLIT===',
    '```bash',
    H + '!/bin/bash',
    H + ' validate.sh',
    '[CONTENIDO]',
    '```',
    '===FILE_SPLIT===',
    '```json',
    '{ "progress": "..." }',
    '```'
  ].join('\n');

  const generationPrompt = [
    'Eres Jarvis en FASE 3: GENERACIÓN DE ARNÉS con DeepSeek Flash.',
    '',
    'El plan de arquitectura fue APROBADO. Genera el ecosistema completo de 5 archivos.',
    '',
    'Plan aprobado:',
    session.architecturePlan || 'No hay plan registrado.',
    '',
    'REGLAS DE GENERACIÓN:',
    '1. AGENTS.md debe ser el mapa de navegación, indicando dónde buscar qué.',
    '2. Las skills deben incluir herramientas permitidas y PROHIBIDAS.',
    '3. validate.sh debe tener sensores mecánicos reales. REGLAS TÉCNICAS OBLIGATORIAS:',
    '   - PROHIBIDO: usar "source archivo.json" — bash no puede parsear JSON. Falla silenciosamente en producción.',
    '   - CORRECTO para validar JSON: python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert \'campo\' in d" archivo.json',
    '   - CORRECTO para leer campo: jq -e ".campo" archivo.json > /dev/null 2>&1 || exit 1',
    '   - CORRECTO para verificar existencia: [[ -f /ruta/archivo.json ]] || { echo "ERROR: falta archivo"; exit 1; }',
    '   - Siempre incluir timeout explícito con variable $SECONDS. NUNCA bucle while sin condición de escape.',
    '4. progress-template.json define la memoria compartida entre agentes.',
    '5. Agent Cards (Nivel 3): En sistemas complejos, incluir un `agent.json` descriptivo por sub-agente.',
    '',
    'LECCIONES:',
    relevantLessons,
    '',
    'FORMATO OBLIGATORIO:',
    'Entrega cada archivo separado por ===FILE_SPLIT===.',
    'Usa bloques de código con el lenguaje respectivo.',
    '',
    'Estructura esperada:',
    ...GEN_FILES,
    '',
    'NO incluyas texto fuera de estos bloques.',
  ].join('\n');

  const messages: DeepSeekMessage[] = [
    { role: 'user', content: generationPrompt },
  ];

  console.log('[Jarvis Flash] Generando ecosistema de arnés...');
  const response = await deepseekChat('flash', messages, {
    temperature: 0.1,
    maxTokens: 8192,
  });

  return response;
}
