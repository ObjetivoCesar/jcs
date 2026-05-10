# Lecciones Aprendidas — JCS
*Índice por tipo de skill. Jarvis carga solo la sección relevante (revelación progresiva).*
*NUNCA cargar este archivo completo — previene context crowding.*

<!-- tag:extractor -->
- Error: Skill extractora sin formato de output definido.
  Fix: Agregar sección 'Estado y Contexto' con esquema JSON explícito.
<!-- /tag:extractor -->

<!-- tag:integrador -->
(vacío — se llena cuando ocurra el primer error real)
<!-- /tag:integrador -->

<!-- tag:orquestador -->
(vacío — se llena cuando ocurra el primer error real)
<!-- /tag:orquestador -->

<!-- tag:validador -->
(vacío — se llena cuando ocurra el primer error real)
<!-- /tag:validador -->

<!-- tag:notificador -->
(vacío — se llena cuando ocurra el primer error real)
<!-- /tag:notificador -->

<!-- tag:otro -->
- Error: Condiciones de salida ambiguas ("cuando termine" no es verificable).
  Fix: Requerir evento o estado específico que dispare la terminación.
- Error: El propio JCS no tenía sensores ni feedback loop (irónico).
  Fix: Se aplicó el self-harness — validate-jcs.sh + error-logger.ts + feedback-engine.ts — para que JCS practique lo que predica.
- Error: SQLite no funciona en Vercel (filesystem efímero).
  Fix: Migrar a Supabase PostgreSQL con prefijo jarvis_ en tablas.
<!-- /tag:otro -->
