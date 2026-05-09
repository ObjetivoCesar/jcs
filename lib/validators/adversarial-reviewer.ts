import { deepseekChat } from '../deepseek-client.ts';
import { REVIEWER_SYSTEM_PROMPT } from '../prompts/reviewer-system.ts';

export interface ReviewResult {
  approved: boolean;
  issues: string[];
  recommendation: 'aprobado' | 'corregir' | 'rediseñar';
}

/**
 * Capa 2 — Revisor Adversarial con DeepSeek V4 Pro (razonamiento).
 * Analiza la coherencia lógica de la skill generada.
 * Máximo 2 rondas de revisión por skill.
 */
export async function adversarialReview(skillContent: string): Promise<ReviewResult> {
  console.log('[Capa 2 - V4 Pro] Iniciando revisión adversarial...');

  try {
    const response = await deepseekChat(
      'flash',
      [
        { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
        { role: 'user', content: `Revisa esta skill y responde SOLO en JSON:\n\n${skillContent}` },
      ],
      {
        temperature: 0.1,
        maxTokens: 2000,
      }
    );

    // Limpiar posibles markdown code fences
    let cleanJson = response.replace(/```json\s*|```\s*/g, '').trim();
    
    // Si la respuesta no es JSON válido, intentar extraer primer objeto JSON
    if (!cleanJson.startsWith('{')) {
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) cleanJson = match[0];
    }
    
    if (!cleanJson) {
      console.error('[Capa 2 - V4 Pro] Respuesta vacía o inválida:', response.substring(0, 200));
      return { approved: false, issues: ['El revisor no pudo generar una respuesta válida.'], recommendation: 'corregir' };
    }
    
    const result = JSON.parse(cleanJson) as ReviewResult;

    console.log('[Capa 2 - V4 Pro] Resultado:', JSON.stringify(result).substring(0, 200));
    return result;
  } catch (error) {
    console.error('[Capa 2 - V4 Pro] Error:', error);
    return {
      approved: false,
      issues: ['Error al ejecutar el revisor adversarial. Reintentar.'],
      recommendation: 'corregir',
    };
  }
}
