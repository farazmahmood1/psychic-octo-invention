import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 hash of skill source code.
 * Used for integrity verification between vetting and execution.
 */
export function computeCodeHash(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/**
 * Verify that a source's hash matches an expected hash.
 */
export function verifyCodeHash(source: string, expectedHash: string): boolean {
  return computeCodeHash(source) === expectedHash;
}
