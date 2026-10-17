# Legión Bot — primera versión (MVP)

## Estado

Este cambio implementa un **panel web de apoyo a la comunidad**, NO un bot que se agregue automáticamente a un grupo de WhatsApp. No se conecta, lee mensajes, elimina usuarios ni publica por su cuenta en WhatsApp.

El panel está disponible en la ruta **/bot** cuando estos cambios se integren y desplieguen en Vercel. La página principal tendrá un enlace "Legión Bot".

## Funciones incluidas

- Panel responsive con el estilo morado de Legión de Streamers.
- Listado de canales en directo usando la ruta existente \`/api/channels\`, con actualización periódica (60 segundos mientras el panel está abierto).
- Aviso cuando la información de Kick no puede verificarse.
- Calendario de próximos eventos de la comunidad almacenado en Supabase.
- Creación y cancelación de eventos protegidas por la contraseña de \`/admin\`.
- Plantillas editables: directo, evento, bienvenida y comunicado.
- Botón "Copiar mensaje" y botón "Abrir WhatsApp"; el administrador debe elegir el grupo y confirmar el envío.

**No incluidos aún:** IA real, moderación de chats grupales, respuestas a mensajes, envíos automáticos a grupos, recordatorios push, puntos/rankings y registros de miembros.

## Puesta en marcha

1. Confirma que el Root Directory de Vercel sea \`legion-de-streamers-v1\`. Si actualmente se despliega otra carpeta, esta ruta nueva no se publicará con ese despliegue.
2. Ejecuta una vez \`supabase/legion_bot.sql\` en el **SQL Editor** del proyecto Supabase correcto. No toca los canales existentes.
3. Configura en Vercel las variables de entorno necesarias:

   - \`NEXT_PUBLIC_SUPABASE_URL\` — URL del proyecto de Supabase.
   - \`SUPABASE_SERVICE_ROLE_KEY\` — clave privada solo en el servidor, nunca en navegador, commits, logs ni capturas.
   - \`ADMIN_PASSWORD\` — contraseña fuerte y distinta para el panel.
   - \`KICK_CLIENT_ID\` y \`KICK_CLIENT_SECRET\` — ya usados por la integración existente de Kick.

4. Revisa la rama y el Pull Request; **no mezcles en main ni despliegues** sin revisar y probar la configuración.
5. En desarrollo local: \`cd legion-de-streamers-v1 && npm install && npm run build && npm run dev\`. El proyecto no trae archivo lock; \`npm install\` resuelve versiones permitidas.
6. Accede a \`/bot\`, verifica el calendario, agrega un evento de prueba, copia un mensaje y comprueba que puedes seleccionar tu grupo de WhatsApp manualmente.

## API del calendario

- \`GET /api/bot/events\`: público, devuelve hasta 50 eventos programados futuros, sin datos privados de miembros.
- \`POST /api/bot/events\`: requiere cabecera \`x-admin-password\`. JSON: \`{ "title": "Noche de Warzone", "details": "...", "starts_at": "2026-11-02T23:00:00Z" }\`.
- \`DELETE /api/bot/events?id=<uuid>\`: requiere la misma cabecera. Cancela lógicamente (estado "cancelled") el evento; no borra su registro.

Todas las operaciones de la tabla de eventos ocurren en el servidor mediante la service role; se revoca el acceso directo de usuarios anónimos a esa tabla.

## Comprobaciones antes del despliegue

- Probar que la página principal y \`/admin\` siguen funcionando.
- Probar compilación de producción con \`npm run build\`.
- Probar que GET funciona tras instalar el SQL y que POST/DELETE rechazan una contraseña incorrecta.
- Probar creación y cancelación de eventos con contraseña correcta.
- Verificar el estado live de Kick en una transmisión real y el aviso de fallo si Kick no responde.
- Comprobar los mensajes en iPhone, Android y ordenador.
- Confirmar que "Abrir WhatsApp" **no envía el mensaje**: el usuario elige el grupo y pulsa enviar.
- Comprobar que no hay claves privadas en componentes del cliente ni en el repositorio.

## Limitaciones importantes

La API oficial de WhatsApp Business no proporciona integración general para bots dentro de grupos comunitarios existentes. Evitar automatizaciones por WhatsApp Web o bibliotecas no oficiales es una medida deliberada para reducir el riesgo de bloqueo del número principal.

Los eventos se almacenan en UTC. Al mostrarlos y crear mensajes se usa la hora de República Dominicana (\`America/Santo_Domingo\`). Al crearlos, el formulario usa la zona horaria local del dispositivo del administrador.

Los procesos que preparan mensajes funcionan en la web; no hay envío autónomo a WhatsApp. El asistente IA y el sistema de puntos forman parte de versiones posteriores.


## Fase 2 en la misma rama — Miembros, ranking y reportes

En la ruta **/bot/comunidad** se añade un módulo independiente. No modifica el grupo de WhatsApp ni los perfiles originales del directorio.

### Requisitos adicionales

Después de ejecutar \`supabase/legion_bot.sql\`, ejecutar también \`supabase/legion_bot_phase2.sql\` en el mismo proyecto. No introducir secretos en GitHub.

El sistema utiliza \`ADMIN_PASSWORD\` y \`SUPABASE_SERVICE_ROLE_KEY\` ya descritos en esta guía.

### Funcionalidad y privacidad

- Los administradores registran a miembros **solo con autorización de la persona**; los registros no son importados automáticamente del grupo. Se guarda alias y canal Kick, sin número de WhatsApp.
- Miembros inicialmente fuera del ranking público. Para aparecer se necesita autorización **adicional y específica** del miembro, confirmada por el administrador.
- Los administradores pueden pausar, reactivar o eliminar registros. La eliminación elimina los puntos asociados.
- Los puntos se asignan manualmente por contribuciones verificables (entre 1 y 50 por concesión) y se guardan como historial inmutable de concesiones.
- El ranking público devuelve solo nombre público, Kick y puntuación de integrantes activos con opt-in.
- Los reportes se crean y gestionan manualmente por administradores; no leen WhatsApp, no ejecutan sanciones automáticas y nunca están expuestos en endpoints públicos.
- Por privacidad, **no introducir mensajes privados, números de teléfono ni datos sensibles en los reportes**. En una siguiente fase puede añadirse un mecanismo formal de consentimiento, eliminación y moderadores individuales.

### Rutas API fase 2

- \`GET /api/bot/leaderboard\`: público, solo miembros con consentimiento, máximo 25 clasificados.
- \`GET|POST|PATCH|DELETE /api/bot/members\`: requiere cabecera \`x-admin-password\`. El GET incluye puntuación privada; POST confirma consentimiento inicial; PATCH controla pausa y consentimiento específico de ranking; DELETE elimina el registro y el historial de puntos.
- \`POST /api/bot/points\`: requiere contraseña administrativa, \`member_id\` UUID, \`points\` entre 1 y 50, \`reason\` 5-240 caracteres.
- \`GET|POST|PATCH /api/bot/reports\`: requiere contraseña administrativa. Incidentes son privados y su resolución requiere criterio humano.

### Límites operativos

El panel administra como máximo 200 miembros y lee hasta 5000 concesiones de puntos para sus cálculos; el ranking expone como máximo 25 nombres. La interfaz indica cuando se superan límites; para comunidades grandes debe añadirse agregación y paginación del lado de la base de datos antes de usar los resultados como definitivos.

### Pruebas adicionales

- [ ] \`npm install && npm run build\` pasa correctamente.
- [ ] Sin \`ADMIN_PASSWORD\`, los endpoints privados devuelven 503; con contraseña incorrecta devuelven 401.
- [ ] Registro duplicado devuelve 409 y no genera dos miembros.
- [ ] Nadie figura en ranking sin autorización explícita.
- [ ] Con autorización, puntuación correcta; al retirarla desaparece de la consulta pública.
- [ ] Pausar miembro retira su perfil de ranking; reactivarlo lo muestra si mantiene autorización.
- [ ] Conceder puntos a miembro activo requiere motivo; a miembro en pausa lo rechaza.
- [ ] Crear, resolver y reabrir reportes no afecta directamente a WhatsApp.
- [ ] Eliminar miembro borra también su historial de puntos.
- [ ] Ni mensajes de WhatsApp ni credenciales de administrador aparecen en logs, endpoints públicos o código cliente.

**IA:** La integración de IA conversacional real sigue pendiente. No se ha conectado un proveedor de IA ni se ha creado un cargo asociado. Hasta contar con configuración, presupuesto y límites de privacidad no se habilitará un endpoint público de IA.
