import 'dotenv/config';
import { createApp } from './app.js';
import { openDatabase, closeDatabase } from './database/connection.js';

const db = await openDatabase();
const app = createApp(db);
const port = Number(process.env.PORT || 5000);
const server = app.listen(port, '0.0.0.0', () => console.log(`LittleLingo AI listening on port ${port}; database round trip ${db.roundTripMs}ms`));

async function shutdown() {
  server.close();
  await closeDatabase(db);
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
