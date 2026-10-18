require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { attachRealtime } = require('./realtime');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  const server = http.createServer(app);
  attachRealtime(server); // mesas en vivo (ruleta y bacará) por Socket.IO
  server.listen(PORT, () => console.log(`🎰 LUCK.IO API corriendo en el puerto ${PORT}`));
});
