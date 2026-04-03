import type { DetectedRisk } from '@nexclaw/shared';
import type { ScanResult, ScanRule } from './scanner.js';
import { SCAN_RULES } from './scanner.js';

/**
 * Configurable policy engine for skill vetting.
 *
 * Supports:
 * - Allowlist: rules to ignore (false positives)
 * - Denylist: additional custom rules to enforce
 * - Category-level overrides (e.g., allow all 'network' rules)
 * - Severity threshold adjustment
 */

export interface PolicyConfig {
  /** Rule IDs to ignore (allowlist — for false positive suppression) */
  allowedRuleIds: string[];
  /** Rule categories to ignore entirely */
  allowedCategories: string[];
  /** Additional custom deny rules beyond the built-in set */
  customDenyRules: ScanRule[];
  /** Minimum severity to trigger a block. 'critical' = only critical blocks; 'medium' = medium+ blocks */
  blockThreshold: 'critical' | 'high' | 'medium' | 'low';
  /** Whether to allow skills with only medium/low risks (warnings) */
  allowWarnings: boolean;
}

const DEFAULT_POLICY: PolicyConfig = {
  allowedRuleIds: [],
  allowedCategories: [],
  customDenyRules: [],
  blockThreshold: 'high',
  allowWarnings: true,
};

export interface PolicyEvaluation {
  /** Overall policy verdict */
  decision: 'approved' | 'blocked' | 'warning';
  /** Risks that triggered the decision */
  blockingRisks: DetectedRisk[];
  /** Risks that were suppressed by allowlist */
  suppressedRisks: DetectedRisk[];
  /** Non-blocking warnings */
  warningRisks: DetectedRisk[];
  /** Human-readable reasons for the decision */
  reasons: string[];
}

const SEVERITY_LEVELS: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Evaluate a scan result against the configured policy.
 */
export function evaluatePolicy(
  scanResult: ScanResult,
  config?: Partial<PolicyConfig>,
): PolicyEvaluation {
  const policy = { ...DEFAULT_POLICY, ...config };
  const threshold = SEVERITY_LEVELS[policy.blockThreshold] ?? 3;

  const suppressedRisks: DetectedRisk[] = [];
  const blockingRisks: DetectedRisk[] = [];
  const warningRisks: DetectedRisk[] = [];
  const reasons: string[] = [];

  for (const risk of scanResult.risks) {
    // Check allowlist
    if (policy.allowedRuleIds.includes(risk.rule)) {
      suppressedRisks.push(risk);
      continue;
    }

    // Check category allowlist
    const ruleCategory = getRuleCategory(risk.rule);
    if (ruleCategory && policy.allowedCategories.includes(ruleCategory)) {
      suppressedRisks.push(risk);
      continue;
    }

    const riskLevel = SEVERITY_LEVELS[risk.severity] ?? 0;
    if (riskLevel >= threshold) {
      blockingRisks.push(risk);
    } else {
      warningRisks.push(risk);
    }
  }

  if (blockingRisks.length > 0) {
    reasons.push(
      `Blocked: ${blockingRisks.length} risk(s) at or above ${policy.blockThreshold} severity`,
    );
    for (const r of blockingRisks.slice(0, 5)) {
      reasons.push(`  [${r.rule}] ${r.description} (${r.severity}) at ${r.location ?? 'unknown'}`);
    }
    if (blockingRisks.length > 5) {
      reasons.push(`  ...and ${blockingRisks.length - 5} more`);
    }
  }

  if (suppressedRisks.length > 0) {
    reasons.push(`${suppressedRisks.length} risk(s) suppressed by policy allowlist`);
  }

  if (warningRisks.length > 0 && blockingRisks.length === 0) {
    reasons.push(`${warningRisks.length} low-severity warning(s) detected`);
  }

  let decision: PolicyEvaluation['decision'];
  if (blockingRisks.length > 0) {
    decision = 'blocked';
  } else if (warningRisks.length > 0 && !policy.allowWarnings) {
    decision = 'blocked';
    reasons.push('Policy does not allow warnings');
  } else if (warningRisks.length > 0) {
    decision = 'warning';
  } else {
    decision = 'approved';
    if (scanResult.risks.length === 0) {
      reasons.push('No risks detected');
    }
  }

  return { decision, blockingRisks, suppressedRisks, warningRisks, reasons };
}

/**
 * Get the effective set of scan rules after applying policy config.
 */
export function getEffectiveRules(config?: Partial<PolicyConfig>): ScanRule[] {
  const policy = { ...DEFAULT_POLICY, ...config };

  const baseRules = SCAN_RULES.filter((r) => {
    if (policy.allowedRuleIds.includes(r.id)) return false;
    if (policy.allowedCategories.includes(r.category)) return false;
    return true;
  });

  return [...baseRules, ...policy.customDenyRules];
}

function getRuleCategory(ruleId: string): string | null {
  const rule = SCAN_RULES.find((r) => r.id === ruleId);
  return rule?.category ?? null;
}
