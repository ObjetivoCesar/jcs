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
<!-- /tag:otro -->
