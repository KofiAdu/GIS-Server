import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 15000);   
server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 60000);   
server.keepAliveTimeout = Number(process.env.KEEPALIVE_TIMEOUT_MS || 5000);

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});