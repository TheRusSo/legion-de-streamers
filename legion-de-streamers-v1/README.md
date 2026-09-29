# Legión de Streamers — V1

Directorio automático de miembros de KICK.

## Incluye
- Añadir canal mediante URL o usuario.
- Validación con KICK.
- LIVE/OFFLINE automático.
- Avatar, título, categoría y viewers.
- Botón al perfil oficial.
- Refresco cada 30 segundos.
- Persistencia con Supabase.

## Configuración

### 1. Supabase
Crea un proyecto y ejecuta `supabase/schema.sql` en SQL Editor.

### 2. KICK
Crea una aplicación de desarrollador de KICK y obtén Client ID + Client Secret.

### 3. Variables
Copia `.env.example` a `.env.local` y completa las cuatro variables.

### 4. Local
```bash
npm install
npm run dev
```

### 5. Publicar
Importa este repositorio en Vercel y añade las mismas cuatro variables de entorno.

Nunca subas `KICK_CLIENT_SECRET` ni `SUPABASE_SERVICE_ROLE_KEY` a GitHub.
