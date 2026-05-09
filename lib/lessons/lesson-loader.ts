import fs from 'fs/promises';
import path from 'path';

/**
 * Revelación Progresiva de Lecciones Aprendidas.
 * 
 * lessons-learned.md está indexado con tags HTML:
 *   <!-- tag:extractor -->
 *   - Error: ...
 *     Fix: ...
 *   <!-- /tag:extractor -->
 * 
 * Jarvis NUNCA carga el archivo completo — solo las lecciones del tag actual.
 * Esto previene context crowding: el modelo no se satura con errores irrelevantes.
 */
export async function loadRelevantLessons(tag: string): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), 'lessons-learned.md');
    const content = await fs.readFile(filePath, 'utf-8');

    // Buscar sección por tag HTML
    const tagRegex = new RegExp(
      `<!--\\s*tag:${escapeRegex(tag)}\\s*-->([\\s\\S]*?)<!--\\s*/tag:${escapeRegex(tag)}\\s*-->`,
      'i'
    );

    const match = content.match(tagRegex);
    if (!match || !match[1].trim()) {
      return '(Sin lecciones registradas para este tipo de skill)';
    }

    return 'LECCIONES APRENDIDAS RELEVANTES:\n' + match[1].trim();
  } catch (error) {
    console.error('Error cargando lecciones:', error);
    return '(Error al cargar lecciones aprendidas)';
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
