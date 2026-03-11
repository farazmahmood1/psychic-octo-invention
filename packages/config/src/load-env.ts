import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const BASE_ENV_FILES = ['.env', '.env.local'];

let repoEnvLoaded = false;

export function loadRepoEnv(): void {
  if (repoEnvLoaded || process.env['NODE_ENV'] === 'test') {
    repoEnvLoaded = true;
    return;
  }

  repoEnvLoaded = true;

  const protectedKeys = new Set(Object.keys(process.env));
  const loadedEntries: Record<string, string> = {};

  for (const fileName of resolveEnvFileOrder()) {
    const filePath = path.join(REPO_ROOT, fileName);
    if (!fs.existsSync(filePath)) continue;

    const fileEntries = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(fileEntries)) {
      if (!protectedKeys.has(key)) {
        loadedEntries[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(loadedEntries)) {
    process.env[key] = value;
  }
}

function resolveEnvFileOrder(): string[] {
  const fileNames = [...BASE_ENV_FILES];
  const nodeEnv = process.env['NODE_ENV']?.trim();

  if (nodeEnv) {
    fileNames.push(`.env.${nodeEnv}`, `.env.${nodeEnv}.local`);
  }

  return fileNames;
}

function parseEnvFile(content: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    entries[key] = normalizeValue(rawValue);
  }

  return entries;
}

function normalizeValue(rawValue: string): string {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"'))
    || (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    const unquoted = rawValue.slice(1, -1);
    return rawValue.startsWith('"') ? unquoted.replace(/\\n/g, '\n') : unquoted;
  }

  return rawValue;
}
