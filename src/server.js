import 'dotenv/config';
import { createApp } from './app.js';
import { openDatabase } from './database/connection.js';
const db=openDatabase();const app=createApp(db);const port=Number(process.env.PORT||5000);
app.listen(port,'0.0.0.0',()=>console.log(`LittleLingo AI listening on port ${port}`));
