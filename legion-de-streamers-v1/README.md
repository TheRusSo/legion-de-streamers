# Legión de Streamers — versión online

Esta versión convierte la web en un directorio compartido para la comunidad:

- Los canales se guardan en Supabase.
- Todos los visitantes ven el mismo directorio.
- La página consulta KICK cada 30 segundos.
- Muestra EN VIVO / OFFLINE.
- Cuando un canal está en vivo, muestra título, categoría, viewers y thumbnail si KICK los devuelve.
- El botón abre el canal oficial de KICK.

## Variables necesarias en Vercel

```txt
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
```

## SQL de Supabase

Ejecuta el contenido de:

```txt
supabase/schema.sql
```

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Publicar

En Vercel usa esta carpeta como Root Directory:

```txt
legion-de-streamers-v1
```

Luego agrega las 4 variables de entorno en Production.
