# Preguntas para el equipo evaluador

**Asunto:** Worksample Tech v3 — preguntas sobre el dataset y el alcance

Hola equipo,

Antes de cerrar el diseño tengo algunas preguntas. Mientras tanto avanzo con los supuestos indicados
y los dejo documentados en el SPEC.

1. **Tipo de documento.** Los 9 archivos de desarrollo son estados de cuenta bancarios (EDC), no
   facturas. ¿Es intencional? ¿Las 10 de evaluación son también estados de cuenta, facturas CFDI, o
   una mezcla?
   _Supuesto:_ el sistema detecta el tipo y soporta ambos.

2. **Cantidad.** La carpeta tiene 9 archivos y el enunciado menciona 10. ¿Falta uno?
   _Supuesto:_ el dataset de desarrollo son 9.

3. **Campos a medir.** ¿Qué campos evaluarán en la extracción? ¿Movimientos individuales o solo
   resumen (periodo, saldos, totales)? ¿Tienen un esquema o formato de salida esperado?
   _Supuesto:_ resumen + movimientos, con el esquema de `docs/output-schema.md`.

4. **Criterios de elegibilidad.** ¿Existe una política de crédito (antigüedad, saldo promedio,
   comprador ancla, plazos)?
   _Supuesto:_ defino una política versionada y documentada.

5. **Datos anonimizados.** RFC, CLABE y nombre del titular vienen vacíos o genéricos. ¿Lo esperado
   es devolver nulo, o en los documentos de evaluación estarán presentes?
   _Supuesto:_ nulo es válido; el sistema pregunta al dueño cuando hace falta.

6. **Canal con el dueño.** ¿Por qué canal se consulta al dueño del documento? ¿Basta con email
   simulado localmente?
   _Supuesto:_ email (Nodemailer, Mailpit en local) con enlace para responder.

7. **Fecha de evaluación.** Los estados son de 2025–2026. ¿Con qué fecha de referencia se evalúa
   la vigencia?
   _Supuesto:_ parámetro `asOf` explícito para resultados reproducibles.

Gracias,
