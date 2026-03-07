import type { VettingRecord, VettingResult } from '@openclaw/shared';
import { HTTP_STATUS } from '@openclaw/shared';
import { logger } from '@openclaw/config';
import { prisma } from '../../db/client.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/app-error.js';

/**
 * Manual override for a skill's vetting result.
 * Only super_admin can perform this action.
 * Creates a new vetting record with reviewerType='manual'.
 */
export async function manualOverride(
  skillId: string,
  result: 'passed' | 'warning',
  reason: string,
  actorId: string,
  ip: string,
): Promise<VettingRecord> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    include: {
      currentVersion: {
        include: {
          vettingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      versions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          vettingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  });

  if (!skill) {
    throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', 'Skill not found');
  }

  // Use current version or latest version
  const targetVersion = skill.currentVersion ?? skill.versions[0];
  if (!targetVersion) {
    throw new AppError(
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      'NO_VERSION',
      'Skill has no versions to override',
    );
  }

  // Create manual vetting result
  const vettingRecord = await prisma.skillVettingResult.create({
    data: {
      skillVersionId: targetVersion.id,
      result: result as VettingResult,
      reviewerType: 'manual',
      reasons: [`Manual override by admin: ${reason}`] as any,
      detectedRisks: [] as any,
      codeHash: targetVersion.codeHash,
      reviewerNote: reason,
    },
  });

  // Update currentVersion pointer if override approves and skill doesn't have one
  if (!skill.currentVersionId) {
    await prisma.skill.update({
      where: { id: skillId },
      data: { currentVersionId: targetVersion.id },
    });
  }

  // Audit the override
  await auditRepository.create({
    actorId,
    actorType: 'admin',
    action: 'skill.manual_override',
    targetType: 'skill',
    targetId: skillId,
    ipAddress: ip,
    metadata: {
      slug: skill.slug,
      versionId: targetVersion.id,
      overrideResult: result,
      reason,
      previousResult: targetVersion.vettingResults?.[0]?.result ?? null,
    } as any,
  });

  logger.info(
    { skillId, slug: skill.slug, result, actorId },
    'Manual vetting override applied',
  );

  return {
    id: vettingRecord.id,
    result: vettingRecord.result,
    reviewerType: vettingRecord.reviewerType,
    reasons: vettingRecord.reasons,
    detectedRisks: vettingRecord.detectedRisks,
    codeHash: vettingRecord.codeHash,
    reviewerNote: vettingRecord.reviewerNote,
    createdAt: vettingRecord.createdAt.toISOString(),
  };
}
