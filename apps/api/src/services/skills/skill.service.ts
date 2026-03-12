import type { SkillSummary, VettingRecord } from '@openclaw/shared';
import { skillRepository } from '../../repositories/skill.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/app-error.js';
import { HTTP_STATUS } from '@openclaw/shared';

function resolveDisplayVersion(skill: Awaited<ReturnType<typeof skillRepository.findById>>) {
  if (!skill) return null;
  return skill.currentVersion ?? skill.versions[0] ?? null;
}

export async function listSkills(): Promise<SkillSummary[]> {
  const skills = await skillRepository.list();

  return skills.map((s) => {
    const displayVersion = resolveDisplayVersion(s);
    const latestVetting = displayVersion?.vettingResults[0] ?? null;
    return {
      id: s.id,
      slug: s.slug,
      displayName: s.displayName,
      description: s.description,
      sourceType: s.sourceType,
      enabled: s.enabled,
      currentVersion: displayVersion?.version ?? null,
      latestVetting: latestVetting?.result ?? null,
    };
  });
}

export async function toggleSkill(
  skillId: string,
  enabled: boolean,
  actorId: string,
  ip: string,
): Promise<SkillSummary> {
  const skill = await skillRepository.findById(skillId);
  if (!skill) {
    throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', 'Skill not found');
  }

  const displayVersion = resolveDisplayVersion(skill);

  // Vetting enforcement: cannot enable a skill without passed vetting
  if (enabled) {
    const latestVetting = displayVersion?.vettingResults[0] ?? null;
    if (!latestVetting) {
      throw new AppError(
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'VETTING_REQUIRED',
        'Cannot enable a skill that has not been vetted',
      );
    }
    if (latestVetting.result === 'failed') {
      throw new AppError(
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'VETTING_FAILED',
        'Cannot enable a skill that failed vetting',
      );
    }
    if (latestVetting.result === 'pending') {
      throw new AppError(
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'VETTING_PENDING',
        'Cannot enable a skill while vetting is still pending',
      );
    }
  }

  const updated = await skillRepository.setEnabled(skillId, enabled);

  await auditRepository.create({
    actorId,
    actorType: 'admin',
    action: enabled ? 'skill.enabled' : 'skill.disabled',
    targetType: 'skill',
    targetId: skillId,
    ipAddress: ip,
    metadata: { skillSlug: skill.slug } as any,
  });

  const latestVetting = displayVersion?.vettingResults[0] ?? null;
  return {
    id: updated.id,
    slug: updated.slug,
    displayName: updated.displayName,
    description: updated.description,
    sourceType: updated.sourceType,
    enabled: updated.enabled,
    currentVersion: displayVersion?.version ?? null,
    latestVetting: latestVetting?.result ?? null,
  };
}

export async function getVettingHistory(skillId: string, page: number, pageSize: number) {
  const skill = await skillRepository.findById(skillId);
  if (!skill) {
    throw new AppError(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', 'Skill not found');
  }

  const result = await skillRepository.getVettingHistory(skillId, page, pageSize);

  const data: VettingRecord[] = result.data.map((v) => ({
    id: v.id,
    result: v.result,
    reviewerType: v.reviewerType,
    reasons: v.reasons,
    detectedRisks: v.detectedRisks,
    codeHash: v.codeHash,
    reviewerNote: v.reviewerNote,
    createdAt: v.createdAt.toISOString(),
  }));

  return { data, total: result.total };
}
