import { logger } from '@openclaw/config';
import { prisma } from '../db/client.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { verifyCodeHash } from './hash.js';

/**
 * Execution guard — security layer around skill execution.
 *
 * Before any skill is invoked at runtime, the guard verifies:
 * 1. Skill exists and is enabled
 * 2. Skill has a current version
 * 3. Current version has passed vetting (system or manual override)
 * 4. Code hash matches what was vetted (tamper detection)
 *
 * If any check fails, execution is blocked and an audit log is created.
 */
export class SkillExecutionGuard {
  /**
   * Check whether a skill is safe to execute.
   * Returns the skill slug and tool definition if approved; null if blocked.
   */
  async canExecute(
    skillSlug: string,
    options?: { source?: string; requireSourceHash?: boolean },
  ): Promise<{ approved: boolean; reason: string; skillId?: string }> {
    const skill = await prisma.skill.findUnique({
      where: { slug: skillSlug },
      include: {
        currentVersion: {
          include: {
            vettingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (!skill) {
      return { approved: false, reason: 'Skill not found' };
    }

    if (!skill.enabled) {
      await this.logBlock(skill.id, skillSlug, 'skill_disabled', skill.displayName);
      return { approved: false, reason: 'Skill is disabled', skillId: skill.id };
    }

    if (!skill.currentVersion) {
      await this.logBlock(skill.id, skillSlug, 'no_version', skill.displayName);
      return { approved: false, reason: 'Skill has no current version', skillId: skill.id };
    }

    const latestVetting = skill.currentVersion.vettingResults[0];
    if (!latestVetting) {
      await this.logBlock(skill.id, skillSlug, 'unvetted', skill.displayName);
      return { approved: false, reason: 'Skill version has not been vetted', skillId: skill.id };
    }

    if (latestVetting.result === 'failed' || latestVetting.result === 'pending') {
      await this.logBlock(skill.id, skillSlug, `vetting_${latestVetting.result}`, skill.displayName);
      return {
        approved: false,
        reason: `Skill vetting status is '${latestVetting.result}'`,
        skillId: skill.id,
      };
    }

    const extractedSource = this.extractSourceFromVersionConfig(skill.currentVersion.config);
    const source = options?.source ?? extractedSource;
    const mustVerifySource = options?.requireSourceHash === true || skill.sourceType !== 'builtin';

    // For external skills, source integrity is mandatory at execution time.
    if (mustVerifySource && (!source || source.trim().length === 0)) {
      await this.logBlock(skill.id, skillSlug, 'missing_source_snapshot', skill.displayName);
      return {
        approved: false,
        reason: 'Skill source snapshot is missing for integrity verification',
        skillId: skill.id,
      };
    }

    // Hash verification is mandatory when source integrity is required.
    if (source && mustVerifySource) {
      const hashMatch = verifyCodeHash(source, skill.currentVersion.codeHash);
      if (!hashMatch) {
        await this.logBlock(skill.id, skillSlug, 'hash_mismatch', skill.displayName);
        return {
          approved: false,
          reason: 'Skill source has been modified since vetting (hash mismatch)',
          skillId: skill.id,
        };
      }
    }

    return { approved: true, reason: 'Approved', skillId: skill.id };
  }

  private extractSourceFromVersionConfig(config: unknown): string | undefined {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return undefined;
    }

    const value = (config as Record<string, unknown>)['__source'];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private async logBlock(
    skillId: string,
    slug: string,
    reason: string,
    skillName?: string | null,
  ): Promise<void> {
    try {
      await auditRepository.create({
        actorId: null,
        actorType: 'system',
        action: 'skill.execution_blocked',
        targetType: 'skill',
        targetId: skillId,
        metadata: {
          skillSlug: slug,
          ...(skillName ? { skillName } : {}),
          reason,
          blockReason: reason,
        } as Record<string, string>,
      });
    } catch (err) {
      logger.warn({ err, skillId, slug, reason }, 'Failed to audit skill execution block');
    }
  }
}

export const skillExecutionGuard = new SkillExecutionGuard();
