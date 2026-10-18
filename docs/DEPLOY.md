# Despliegue en Render (backend) — LUCK.IO

1. Base de datos: crear un clúster gratuito en MongoDB Atlas, un usuario y permitir el acceso desde cualquier IP (0.0.0.0/0). Copiar la cadena `mongodb+srv://...` como `MONGO_URI`.
2. En Render: **New → Blueprint**, elegir este repositorio (usa `render.yaml`) o **New → Web Service** con build `npm install` y start `npm start`.
3. Variables de entorno: `MONGO_URI`, `JWT_SECRET` (Render la genera), `CLIENT_URL` (la URL del frontend, sin barra final; varias separadas por coma), `INITIAL_BALANCE=5000`, `NODE_ENV=production`, `ODDS_API_KEY` (opcional).
4. Comprobar `https://<servicio>.onrender.com/api/health` → `{"status":"ok"}`.
5. Frontend: **New → Static Site**, build `npm install && npm run build`, publicar `dist`, variable `VITE_API_URL=https://<servicio>.onrender.com/api`, y una regla de reescritura `/*` → `/index.html`.
6. Volver al backend y poner en `CLIENT_URL` la URL del sitio estático (CORS y Socket.IO).

Nota: el plan gratuito duerme tras 15 minutos sin uso (la primera petición tarda ~50 s) y el bloqueo por jugador de blackjack solo protege una instancia.
