import type { DetectedRisk } from '@openclaw/shared';

/**
 * Layered static analysis scanner for skill source code.
 *
 * Layer 1: Signature/pattern scan — detects dangerous function calls
 * Layer 2: Dependency/import risk heuristics — flags risky imports
 * Layer 3: File path policy checks — detects sandbox escapes
 * Layer 4: Dynamic code execution detection
 *
 * Extensible: add new rules to SCAN_RULES or new scanners to runAllScanners().
 */

export interface ScanRule {
  id: string;
  severity: DetectedRisk['severity'];
  description: string;
  /** Regex pattern to match against source code */
  pattern: RegExp;
  /** Category for grouping and filtering */
  category: 'os_command' | 'shell_exec' | 'filesystem' | 'network' | 'dynamic_code' | 'env_access' | 'subprocess' | 'import_risk';
}

// ── Built-in scan rules ─────────────────────────────────────

export const SCAN_RULES: ScanRule[] = [
  // OS command execution
  {
    id: 'SEC-001',
    severity: 'critical',
    description: 'Direct OS command execution via os.system',
    pattern: /os\s*\.\s*system\s*\(/g,
    category: 'os_command',
  },
  {
    id: 'SEC-002',
    severity: 'critical',
    description: 'OS command execution via os.popen',
    pattern: /os\s*\.\s*popen\s*\(/g,
    category: 'os_command',
  },
  {
    id: 'SEC-003',
    severity: 'critical',
    description: 'OS command execution via os.exec variants',
    pattern: /os\s*\.\s*exec[lv]?[pe]?\s*\(/g,
    category: 'os_command',
  },

  // Shell / child process execution
  {
    id: 'SEC-010',
    severity: 'critical',
    description: 'Node.js child_process execution',
    pattern: /child_process/g,
    category: 'shell_exec',
  },
  {
    id: 'SEC-011',
    severity: 'critical',
    description: 'Shell execution via exec/execSync',
    pattern: /\bexecSync?\s*\(/g,
    category: 'shell_exec',
  },
  {
    id: 'SEC-012',
    severity: 'critical',
    description: 'Shell execution via spawn/spawnSync',
    pattern: /\bspawnSync?\s*\(/g,
    category: 'shell_exec',
  },
  {
    id: 'SEC-013',
    severity: 'critical',
    description: 'Shell execution via execFile/execFileSync',
    pattern: /\bexecFileSync?\s*\(/g,
    category: 'shell_exec',
  },
  {
    id: 'SEC-014',
    severity: 'critical',
    description: 'Shell execution via fork',
    pattern: /\bfork\s*\(/g,
    category: 'shell_exec',
  },

  // Python subprocess
  {
    id: 'SEC-020',
    severity: 'critical',
    description: 'Python subprocess module usage',
    pattern: /subprocess\s*\.\s*(call|run|Popen|check_output|check_call)\s*\(/g,
    category: 'subprocess',
  },
  {
    id: 'SEC-021',
    severity: 'critical',
    description: 'Python subprocess import',
    pattern: /import\s+subprocess/g,
    category: 'subprocess',
  },

  // Dynamic code execution
  {
    id: 'SEC-030',
    severity: 'critical',
    description: 'Dynamic code execution via eval()',
    pattern: /\beval\s*\(/g,
    category: 'dynamic_code',
  },
  {
    id: 'SEC-031',
    severity: 'critical',
    description: 'Dynamic code execution via Function constructor',
    pattern: /new\s+Function\s*\(/g,
    category: 'dynamic_code',
  },
  {
    id: 'SEC-032',
    severity: 'high',
    description: 'Dynamic code execution via setTimeout/setInterval with string',
    pattern: /\b(setTimeout|setInterval)\s*\(\s*['"`]/g,
    category: 'dynamic_code',
  },
  {
    id: 'SEC-033',
    severity: 'critical',
    description: 'Python exec() built-in',
    pattern: /\bexec\s*\(\s*['"]/g,
    category: 'dynamic_code',
  },
  {
    id: 'SEC-034',
    severity: 'critical',
    description: 'Python compile() for code execution',
    pattern: /\bcompile\s*\([^)]*['"]exec['"]/g,
    category: 'dynamic_code',
  },

  // Filesystem access outside sandbox
  {
    id: 'SEC-040',
    severity: 'high',
    description: 'Direct filesystem write operations',
    pattern: /\b(writeFileSync?|appendFileSync?|createWriteStream)\s*\(/g,
    category: 'filesystem',
  },
  {
    id: 'SEC-041',
    severity: 'high',
    description: 'Filesystem deletion or rename operations',
    pattern: /\b(unlinkSync?|rmdirSync?|rmSync?|renameSync?)\s*\(/g,
    category: 'filesystem',
  },
  {
    id: 'SEC-042',
    severity: 'medium',
    description: 'Path traversal attempt',
    pattern: /\.\.\//g,
    category: 'filesystem',
  },
  {
    id: 'SEC-043',
    severity: 'high',
    description: 'Python file open in write mode',
    pattern: /open\s*\([^)]*['"][wax]['"]/g,
    category: 'filesystem',
  },

  // Environment variable access
  {
    id: 'SEC-050',
    severity: 'high',
    description: 'Direct access to process.env secrets',
    pattern: /process\s*\.\s*env\s*(\[|\.)/g,
    category: 'env_access',
  },
  {
    id: 'SEC-051',
    severity: 'high',
    description: 'Python os.environ access',
    pattern: /os\s*\.\s*environ/g,
    category: 'env_access',
  },
  {
    id: 'SEC-052',
    severity: 'high',
    description: 'Python os.getenv access',
    pattern: /os\s*\.\s*getenv\s*\(/g,
    category: 'env_access',
  },

  // Risky imports
  {
    id: 'SEC-060',
    severity: 'high',
    description: 'Import of native networking module',
    pattern: /require\s*\(\s*['"](?:net|dgram|tls|http2|https?)['"]\s*\)/g,
    category: 'import_risk',
  },
  {
    id: 'SEC-061',
    severity: 'medium',
    description: 'Import of native fs module',
    pattern: /require\s*\(\s*['"](?:fs|fs\/promises)['"]\s*\)/g,
    category: 'import_risk',
  },
  {
    id: 'SEC-062',
    severity: 'high',
    description: 'Import of native os module',
    pattern: /require\s*\(\s*['"]os['"]\s*\)/g,
    category: 'import_risk',
  },
  {
    id: 'SEC-063',
    severity: 'high',
    description: 'ES import of dangerous modules',
    pattern: /import\s+.*from\s+['"](?:child_process|net|dgram|tls|http2)['"]/g,
    category: 'import_risk',
  },
  {
    id: 'SEC-064',
    severity: 'critical',
    description: 'Python os module import',
    pattern: /^import\s+os\b/gm,
    category: 'import_risk',
  },

  // Network access
  {
    id: 'SEC-070',
    severity: 'medium',
    description: 'Outbound HTTP request via fetch/axios/request',
    pattern: /\b(fetch|axios|request|got|needle)\s*\(/g,
    category: 'network',
  },
  {
    id: 'SEC-071',
    severity: 'medium',
    description: 'WebSocket creation',
    pattern: /new\s+WebSocket\s*\(/g,
    category: 'network',
  },
];

// ── Scanner Engine ──────────────────────────────────────────

export interface ScanResult {
  risks: DetectedRisk[];
  scannedRules: number;
  passed: boolean;
}

/**
 * Run all scan rules against the provided source code.
 * Returns detected risks sorted by severity (critical first).
 */
export function scanSource(source: string, rules?: ScanRule[]): ScanResult {
  const activeRules = rules ?? SCAN_RULES;
  const risks: DetectedRisk[] = [];
  const lines = source.split('\n');

  for (const rule of activeRules) {
    // Reset regex state for global patterns
    rule.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(source)) !== null) {
      const beforeMatch = source.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lineContent = lines[lineNumber - 1] ?? '';

      risks.push({
        rule: rule.id,
        severity: rule.severity,
        description: rule.description,
        location: `line ${lineNumber}`,
        line: lineNumber,
        snippet: lineContent.trim().slice(0, 200),
      });
    }

    // Reset after use
    rule.pattern.lastIndex = 0;
  }

  // Sort: critical > high > medium > low
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  risks.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

  const hasCritical = risks.some((r) => r.severity === 'critical');
  const hasHigh = risks.some((r) => r.severity === 'high');

  return {
    risks,
    scannedRules: activeRules.length,
    passed: !hasCritical && !hasHigh,
  };
}
