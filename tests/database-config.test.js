import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { databasePoolConfig } from '../src/database/connection.js';

// These cases read configuration only, so they run without a database server. The TLS
// pinning itself is asserted against the options handed to mysql2; a stub server cannot
// prove it because the driver starts TLS only after a real server advertises it.
const keys = ['DATABASE_URL', 'AIVEN_CA_CERT', 'AIVEN_CA_CERT_FILE', 'DATABASE_POOL_SIZE'];
const withEnv = (env, work) => {
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    return work();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
};

const serviceUri = 'mysql://avnadmin:s3cret%40%2Fword@mysql-example.b.aivencloud.com:16707/defaultdb?ssl-mode=REQUIRED';

test('the Aiven Service URI is parsed into discrete connection options', () => withEnv({ DATABASE_URL: serviceUri, AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: '' }, () => {
  const config = databasePoolConfig(process.env.DATABASE_URL);
  assert.equal(config.host, 'mysql-example.b.aivencloud.com');
  assert.equal(config.port, 16707);
  assert.equal(config.user, 'avnadmin');
  assert.equal(config.password, 's3cret@/word', 'percent-encoded credentials must reach the driver decoded');
  assert.equal(config.database, 'defaultdb');
  assert.equal(config.charset, 'utf8mb4');
  assert.equal(config.multipleStatements, false, 'statement stacking must never be available to a request');
  assert.equal(config.enableKeepAlive, true, 'an idle ephemeral host must not eat a reconnect on the next child');
}));

test('a URI without a port or database still describes a usable server', () => withEnv({ DATABASE_URL: 'mysql://u:p@host.example', AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: '' }, () => {
  const config = databasePoolConfig(process.env.DATABASE_URL);
  assert.equal(config.port, 3306);
  assert.equal(config.database, undefined);
}));

test('an unencrypted database connection is refused rather than downgraded', () => {
  for (const uri of [
    'mysql://u:p@host.example:16707/defaultdb?ssl-mode=DISABLED',
    'mysql://u:p@host.example:16707/defaultdb?sslmode=disable'
  ]) {
    withEnv({ DATABASE_URL: uri, AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: '' }, () => {
      assert.throws(() => databasePoolConfig(process.env.DATABASE_URL), /ssl-mode=DISABLED is refused/);
    });
  }
});

test('the app will not start without a database URL', () => withEnv({ DATABASE_URL: '', AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: '' }, () => {
  assert.throws(() => databasePoolConfig(process.env.DATABASE_URL), /DATABASE_URL is required/);
}));

test('the pinned CA is verified, never bypassed', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
  const cases = [
    ['a PEM with escaped newlines', { AIVEN_CA_CERT: pem.replace(/\n/g, '\\n') }, '\nMIIB\n'],
    ['base64 of the PEM', { AIVEN_CA_CERT: Buffer.from(pem).toString('base64') }, '\nMIIB\n']
  ];
  for (const [label, env, expectedBody] of cases) {
    const ssl = withEnv({ DATABASE_URL: serviceUri, AIVEN_CA_CERT_FILE: '', ...env }, () => databasePoolConfig(process.env.DATABASE_URL).ssl);
    assert.equal(ssl.ca.includes('-----BEGIN CERTIFICATE-----'), true, `${label} must be handed to the driver as PEM`);
    assert.equal(ssl.ca.includes(expectedBody), true, `${label} must be restored to a form OpenSSL can read`);
    assert.equal(ssl.rejectUnauthorized, true, `${label} must never disable verification`);
    assert.equal(ssl.servername, 'mysql-example.b.aivencloud.com', `${label} needs SNI for a shared certificate host`);
    assert.equal(ssl.minVersion, 'TLSv1.2');
  }
});

test('the CA can be supplied as a file', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'littlelingo-ca-')), 'aiven-ca.pem');
  fs.writeFileSync(file, '-----BEGIN CERTIFICATE-----\nAAAB\n-----END CERTIFICATE-----\n');
  try {
    const ssl = withEnv({ DATABASE_URL: serviceUri, AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: file }, () => databasePoolConfig(process.env.DATABASE_URL).ssl);
    assert.match(ssl.ca, /BEGIN CERTIFICATE/);
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

test('verification still applies when no CA is configured', () => withEnv({ DATABASE_URL: serviceUri, AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: '' }, () => {
  const ssl = databasePoolConfig(process.env.DATABASE_URL).ssl;
  assert.equal(ssl.ca, undefined, 'falling back to the system trust store must not fall back to no verification');
  assert.equal(ssl.rejectUnauthorized, true);
}));

test('the pool stays small enough for a shared managed server', () => {
  assert.equal(withEnv({ DATABASE_URL: serviceUri, DATABASE_POOL_SIZE: '', AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: '' }, () => databasePoolConfig(process.env.DATABASE_URL).connectionLimit), 5);
  assert.equal(withEnv({ DATABASE_URL: serviceUri, DATABASE_POOL_SIZE: '12', AIVEN_CA_CERT: '', AIVEN_CA_CERT_FILE: '' }, () => databasePoolConfig(process.env.DATABASE_URL).connectionLimit), 12);
});
