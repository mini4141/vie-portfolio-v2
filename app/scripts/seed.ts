// Usage: OWNER_EMAIL=… OWNER_PASSWORD=… npm run seed   (safe to re-run: only fills an empty database)
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { open, UPLOAD_DIR } from '../src/lib/db.ts';
import { seed } from '../src/lib/seed.ts';

if (existsSync('.env')) loadEnvFile('.env');
const email = process.env.OWNER_EMAIL, password = process.env.OWNER_PASSWORD;
if (!email || !password || password.length < 10) {
  console.error('Set OWNER_EMAIL and OWNER_PASSWORD (min 10 chars). See .env.example.');
  process.exit(1);
}
const d = open();
const r = seed(d, { ownerEmail: email, ownerPassword: password, uploadDir: UPLOAD_DIR });
console.log(r.skipped ? 'Database already has content; nothing seeded.' : `Seeded ${r.projects} projects, profile, settings and owner account.`);
