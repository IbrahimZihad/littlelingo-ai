import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Aiven serves MySQL on a shared wildcard certificate signed by Aiven's own CA, so the
// CA is what turns "encrypted" into "encrypted to the database we think this is"; the
// system trust store does not contain it. Without a configured CA this module still
// verifies, and the connection is refused: verification is never disabled, because the
// learner records here are children's data.
function tlsOptions(host) {
  const pem = process.env.AIVEN_CA_CERT?.trim();
  const file = process.env.AIVEN_CA_CERT_FILE?.trim();
  let ca;
  // Consoles hand back a PEM whose newlines are the two characters \n; OpenSSL refuses to
  // read it until they are real newlines again.
  if (pem) ca = pem.includes('-----BEGIN') ? pem.replace(/\\n/g, '\n') : Buffer.from(pem, 'base64').toString('utf8');
  else if (file) ca = fs.readFileSync(path.resolve(file), 'utf8');
  return { ca, servername: host, rejectUnauthorized: true, minVersion: 'TLSv1.2' };
}

// The Aiven Service URI carries ?ssl-mode=..., which mysql2 does not understand, so the
// URL is parsed into discrete options and the query string is read for TLS intent only.
// Exported so the URL parsing and the TLS pinning can be asserted directly: mysql2 only
// starts TLS once a real server advertises it, so no stub server can prove this path.
export function databasePoolConfig(raw) {
  if (!raw) throw new Error('DATABASE_URL is required, e.g. mysql://user:password@host.aivencloud.com:16707/defaultdb');
  const url = new URL(raw);
  const sslMode = (url.searchParams.get('ssl-mode') || url.searchParams.get('sslmode') || '').toUpperCase();
  if (sslMode === 'DISABLED' || sslMode === 'DISABLE') throw new Error('ssl-mode=DISABLED is refused: the database connection must be encrypted.');
  const ssl = tlsOptions(url.hostname);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '') || undefined,
    ssl,
    waitForConnections: true,
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 5),
    queueLimit: 0,
    // Ephemeral hosts idle between requests and the provider drops silent sockets;
    // a small keep-alive avoids the first child after a quiet period eating a reconnect.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    multipleStatements: false,
    charset: 'utf8mb4'
  };
}

// The schema is trusted text from this repository, so a line-based split is enough and
// keeps multipleStatements off for everything a client can influence.
function schemaStatements() {
  return fs.readFileSync(path.join(here, 'schema.sql'), 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

// `raw` defaults to the production URL so a test run can point the identical driver,
// TLS and schema path at a separate database without reimplementing any of it.
export async function openDatabase(raw = process.env.DATABASE_URL?.trim()) {
  const pool = mysql.createPool(databasePoolConfig(raw));
  const started = process.hrtime.bigint();
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    await pool.end().catch(() => {});
    // Aiven signs its server certificates with its own CA, which no system trust store
    // contains, so this is the failure almost every first deployment hits. Name the fix.
    if (error?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || /self-signed|unable to verify|altname/i.test(String(error?.message))) {
      throw new Error(`The database server's TLS certificate could not be verified (${error.message}). Download the CA certificate from the hosting console and set AIVEN_CA_CERT or AIVEN_CA_CERT_FILE.`);
    }
    throw error;
  }
  for (const statement of schemaStatements()) await pool.query(statement);
  const roundTripMs = Number(process.hrtime.bigint() - started) / 1e6;
  pool.roundTripMs = Math.round(roundTripMs);
  return pool;
}

export async function closeDatabase(pool) {
  if (pool?.end) await pool.end();
}
