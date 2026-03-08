import type { SkillIngestInput, DetectedRisk, VettingResult } from '@openclaw/shared';
import type { Prisma } from '@prisma/client';
import { HTTP_STATUS } from '@openclaw/shared';
import { logger } from '@openclaw/config';
import { prisma } from '../../db/client.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/app-error.js';
import { scanSource } from '../../security/scanner.js';
import { evaluatePolicy } from '../../security/policy-engine.js';
import { computeCodeHash } from '../../security/hash.js';

export interface IngestionResult {
  skillId: string;
  versionId: string;
  codeHash: string;
  vettingResult: VettingResult;
  detectedRisks: DetectedRisk[];
  reasons: string[];
}

/**
 * Full skill ingestion pipeline:
 * 1. Validate uniqueness (slug + version)
 * 2. Compute code hash
 * 3. Run static analysis scan
 * 4. Evaluate against policy engine
 * 5. Create/update skill + version + vetting result
 * 6. Audit the ingestion
 */
export async function ingestSkill(
  input: SkillIngestInput,
  actorId: string,
  ip: string,
): Promise<IngestionResult> {
  const versionConfig = buildVersionConfig(input.metadata, input.source);

  // 1. Compute code hash
  const codeHash = computeCodeHash(input.source);

  // 2. Run static analysis
  const scanResult = scanSource(input.source);

  // 3. Evaluate against policy
  const evaluation = evaluatePolicy(scanResult);

  // Map policy decision to vetting result
  let vettingResult: VettingResult;
  if (evaluation.decision === 'blocked') {
    vettingResult = 'failed';
  } else if (evaluation.decision === 'warning') {
    vettingResult = 'warning';
  } else {
    vettingResult = 'passed';
  }

  const allRisks: DetectedRisk[] = [
    ...evaluation.blockingRisks,
    ...evaluation.warningRisks,
  ];

  // 4. Create or update skill and version in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Find or create skill
    let skill = await tx.skill.findUnique({ where: { slug: input.slug } });

    if (skill) {
      // Check if version already exists for this skill
      const existingVersion = await tx.skillVersion.findUnique({
        where: { skillId_version: { skillId: skill.id, version: input.version } },
      });

      if (existingVersion) {
        // Same version re-uploaded: check if content changed
        if (existingVersion.codeHash === codeHash) {
          throw new AppError(
            HTTP_STATUS.CONFLICT,
            'VERSION_EXISTS',
            `Version ${input.version} already exists with identical content`,
          );
        }
        // Different content for same version: block (must bump version)
        throw new AppError(
          HTTP_STATUS.CONFLICT,
          'VERSION_HASH_MISMATCH',
          `Version ${input.version} already exists with different content. Bump the version number.`,
        );
      }

      // Update skill metadata
      skill = await tx.skill.update({
        where: { id: skill.id },
        data: {
          displayName: input.displayName,
          description: input.description,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
          sourceRef: input.sourceRef,
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
        },
      });
    } else {
      skill = await tx.skill.create({
        data: {
          slug: input.slug,
          displayName: input.displayName,
          description: input.description,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
          sourceRef: input.sourceRef,
          enabled: false,
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
        },
      });
    }

    // Create version
    const version = await tx.skillVersion.create({
      data: {
        skillId: skill.id,
        version: input.version,
        codeHash,
        config: versionConfig,
      },
    });

    // Create vetting result
    await tx.skillVettingResult.create({
      data: {
        skillVersionId: version.id,
        result: vettingResult,
        reviewerType: 'system',
        reasons: evaluation.reasons as unknown as Prisma.InputJsonValue,
        detectedRisks: allRisks as unknown as Prisma.InputJsonValue,
        codeHash,
      },
    });

    // Point currentVersion to new version only if it passed
    if (vettingResult === 'passed' || vettingResult === 'warning') {
      await tx.skill.update({
        where: { id: skill.id },
        data: { currentVersionId: version.id },
      });
    }

    return { skillId: skill.id, versionId: version.id };
  });

  // 5. Audit the ingestion
  const auditAction = vettingResult === 'failed' ? 'skill.ingestion_blocked' : 'skill.ingested';
  await auditRepository.create({
    actorId,
    actorType: 'admin',
    action: auditAction,
    targetType: 'skill',
    targetId: result.skillId,
    ipAddress: ip,
    metadata: {
      skillSlug: input.slug,
      skillName: input.displayName,
      slug: input.slug,
      version: input.version,
      codeHash,
      vettingResult,
      reason: evaluation.reasons.join('; '),
      risksDetected: allRisks.length,
      blockingRisks: evaluation.blockingRisks.length,
      warningRisks: evaluation.warningRisks.length,
    } as Prisma.InputJsonValue,
  });

  if (vettingResult === 'failed') {
    logger.warn(
      { skillId: result.skillId, slug: input.slug, risks: allRisks.length },
      'Skill ingestion blocked by security vetting',
    );
  }

  return {
    skillId: result.skillId,
    versionId: result.versionId,
    codeHash,
    vettingResult,
    detectedRisks: allRisks,
    reasons: evaluation.reasons,
  };
}

function buildVersionConfig(
  metadata: Record<string, unknown> | undefined,
  source: string,
): Prisma.InputJsonValue {
  return {
    ...(metadata ?? {}),
    __source: source,
  } as Prisma.InputJsonValue;
}
