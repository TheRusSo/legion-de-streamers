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
