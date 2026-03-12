import { useEffect, useState } from 'react';
import type {
  SkillSummary,
  SkillIngestionResult,
  VettingRecord,
  PaginatedResponse,
  DetectedRisk,
} from '@openclaw/shared';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorPanel } from '@/components/error-panel';
import { MetricCard } from '@/components/metric-card';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { useApiQuery } from '@/hooks/use-api-query';
import { apiClient, ApiClientError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  PencilLine,
  Plus,
  Puzzle,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';

interface SkillsResponse {
  data: SkillSummary[];
}

interface ApiDataResponse<T> {
  data: T;
}

type InstallableSourceType = 'uploaded' | 'git_repo' | 'marketplace';
type ManualOverrideResult = 'passed' | 'warning';

interface SkillFormState {
  slug: string;
  displayName: string;
  description: string;
  sourceType: InstallableSourceType;
  sourceUrl: string;
  sourceRef: string;
  version: string;
  source: string;
  toolName: string;
  toolDescription: string;
  toolParameters: string;
  executionTimeoutMs: string;
  extraMetadata: string;
  enableAfterIngest: boolean;
}

interface SkillTemplate {
  id: string;
  label: string;
  description: string;
  intent: 'safe' | 'blocked';
  values: SkillFormState;
}

const EMPTY_RESPONSE: SkillsResponse = { data: [] };

const EMPTY_VETTING: PaginatedResponse<VettingRecord> = {
  data: [],
  meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

const TOOL_PARAMETERS_TEMPLATE = JSON.stringify(
  {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Plain-language input for the tool.',
      },
    },
    required: ['input'],
  },
  null,
  2,
);

const SAFE_DEMO_SOURCE = `function summarize_quote(args) {
  const customer = typeof args.customer === 'string' ? args.customer.trim() : 'Customer';
  const amount = Number(args.amount ?? 0);
  const lineItems = Array.isArray(args.lineItems) ? args.lineItems : [];

  return {
    ok: true,
    summary: \`\${customer} has an estimated total of $\${amount.toFixed(2)}.\`,
    lineItemCount: lineItems.length,
    nextStep: 'Send the estimate and ask if they want an invoice generated.',
  };
}

module.exports = { summarize_quote };`;

const BLOCKED_DEMO_SOURCE = `const { exec } = require('child_process');

function shell_helper(args) {
  exec(String(args.command ?? 'whoami'));
  return { ok: true };
}

module.exports = { shell_helper };`;

const SAFE_TEMPLATE: SkillTemplate = {
  id: 'safe-demo',
  label: 'Load Safe Demo',
  description: 'A ready-to-enable quote summarizer for live UI3 demos.',
  intent: 'safe',
  values: {
    slug: 'quote-summarizer',
    displayName: 'Quote Summarizer',
    description: 'Summarizes quote totals and recommends a clear next step for the assistant.',
    sourceType: 'uploaded',
    sourceUrl: '',
    sourceRef: '',
    version: '1.0.0',
    source: SAFE_DEMO_SOURCE,
    toolName: 'summarize_quote',
    toolDescription: 'Summarizes quote totals and line-item counts for the assistant.',
    toolParameters: JSON.stringify(
      {
        type: 'object',
        properties: {
          customer: { type: 'string', description: 'Customer name.' },
          amount: { type: 'number', description: 'Quoted total amount in USD.' },
          lineItems: {
            type: 'array',
            description: 'Optional quote line items.',
            items: { type: 'string' },
          },
        },
        required: ['customer', 'amount'],
      },
      null,
      2,
    ),
    executionTimeoutMs: '3000',
    extraMetadata: JSON.stringify(
      {
        category: 'sales',
        installedFromPortal: true,
      },
      null,
      2,
    ),
    enableAfterIngest: true,
  },
};

const BLOCKED_TEMPLATE: SkillTemplate = {
  id: 'blocked-demo',
  label: 'Load Security Demo',
  description: 'A malicious sample that should be blocked by vetting for SEC1.',
  intent: 'blocked',
  values: {
    slug: 'shell-helper',
    displayName: 'Shell Helper',
    description: 'Intentionally unsafe skill to prove the vetting layer blocks child_process usage.',
    sourceType: 'uploaded',
    sourceUrl: '',
    sourceRef: '',
    version: '1.0.0',
    source: BLOCKED_DEMO_SOURCE,
    toolName: 'shell_helper',
    toolDescription: 'Unsafe shell command executor used only for security testing.',
    toolParameters: JSON.stringify(
      {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
        },
        required: ['command'],
      },
      null,
      2,
    ),
    executionTimeoutMs: '1500',
    extraMetadata: JSON.stringify(
      {
        category: 'security-demo',
        installedFromPortal: true,
      },
      null,
      2,
    ),
    enableAfterIngest: false,
  },
};

const SKILL_TEMPLATES: SkillTemplate[] = [SAFE_TEMPLATE, BLOCKED_TEMPLATE];

function createEmptySkillForm(): SkillFormState {
  return {
    slug: '',
    displayName: '',
    description: '',
    sourceType: 'uploaded',
    sourceUrl: '',
    sourceRef: '',
    version: '1.0.0',
    source: '',
    toolName: '',
    toolDescription: '',
    toolParameters: TOOL_PARAMETERS_TEMPLATE,
    executionTimeoutMs: '4000',
    extraMetadata: JSON.stringify(
      {
        installedFromPortal: true,
      },
      null,
      2,
    ),
    enableAfterIngest: true,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sourceLabel(type: string): string {
  const map: Record<string, string> = {
    builtin: 'Built-in',
    uploaded: 'Uploaded',
    git_repo: 'Git Repository',
    marketplace: 'Marketplace',
  };
  return map[type] ?? type;
}

function parseRecordJson(value: string, label: string): Record<string, unknown> {
  if (!value.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function buildIngestPayload(form: SkillFormState) {
  if (!form.slug.trim()) throw new Error('Slug is required.');
  if (!/^[a-z0-9-]+$/.test(form.slug.trim())) {
    throw new Error('Slug must be lowercase letters, numbers, and hyphens only.');
  }
  if (!form.displayName.trim()) throw new Error('Display name is required.');
  if (!form.version.trim()) throw new Error('Version is required.');
  if (!form.toolName.trim()) throw new Error('Tool name is required.');
  if (!/^[a-z0-9_]+$/.test(form.toolName.trim())) {
    throw new Error('Tool name must use lowercase letters, numbers, and underscores only.');
  }
  if (!form.toolDescription.trim()) throw new Error('Tool description is required.');
  if (!form.source.trim()) throw new Error('Source code is required.');

  const toolParameters = parseRecordJson(form.toolParameters, 'Tool parameters');
  const extraMetadata = parseRecordJson(form.extraMetadata, 'Advanced metadata');

  const executionTimeoutMs = form.executionTimeoutMs.trim()
    ? Number(form.executionTimeoutMs.trim())
    : undefined;

  if (executionTimeoutMs !== undefined && (!Number.isFinite(executionTimeoutMs) || executionTimeoutMs <= 0)) {
    throw new Error('Execution timeout must be a positive number.');
  }

  return {
    slug: form.slug.trim(),
    displayName: form.displayName.trim(),
    description: form.description.trim() || undefined,
    sourceType: form.sourceType,
    sourceUrl: form.sourceUrl.trim() || undefined,
    sourceRef: form.sourceRef.trim() || undefined,
    version: form.version.trim(),
    source: form.source,
    metadata: {
      ...extraMetadata,
      installedFromPortal: true,
      toolDefinition: {
        name: form.toolName.trim(),
        description: form.toolDescription.trim(),
        parameters: toolParameters,
      },
      ...(executionTimeoutMs !== undefined ? { executionTimeoutMs } : {}),
    },
  };
}

function riskTone(risk: DetectedRisk['severity']): 'destructive' | 'warning' | 'info' | 'muted' {
  if (risk === 'critical' || risk === 'high') return 'destructive';
  if (risk === 'medium') return 'warning';
  if (risk === 'low') return 'info';
  return 'muted';
}

function VettingHistoryDrawer({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const { data, loading, error } = useApiQuery<PaginatedResponse<VettingRecord>>(
    `/skills/${skillId}/vetting-history?pageSize=10`,
    EMPTY_VETTING,
  );

  const records = data?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Vetting History</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && <ErrorPanel message={error} />}

        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded" />
            ))}
          </div>
        )}

        {!loading && records.length === 0 && (
          <p className="text-sm text-muted-foreground">No vetting records found.</p>
        )}

        {!loading && records.length > 0 && (
          <div className="space-y-4">
            {records.map((rec) => (
              <Card key={rec.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={rec.result} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(rec.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Reviewer: </span>
                    <Badge variant="outline">{rec.reviewerType}</Badge>
                  </div>
                  {rec.reviewerNote && <p className="text-sm">{rec.reviewerNote}</p>}
                  {rec.reasons != null && (
                    <div className="text-xs text-muted-foreground">
                      {Array.isArray(rec.reasons)
                        ? (rec.reasons as string[]).map((r, i) => <p key={i}>{String(r)}</p>)
                        : <p>{String(rec.reasons)}</p>}
                    </div>
                  )}
                  <div className="font-mono text-[10px] text-muted-foreground">
                    Hash: {rec.codeHash.slice(0, 16)}...
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IngestionResultPanel({ result }: { result: SkillIngestionResult }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Latest Security Review</CardTitle>
            <CardDescription>
              The ingestion pipeline already scanned the uploaded source and stored the result.
            </CardDescription>
          </div>
          <StatusBadge status={result.vettingResult} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Skill ID</div>
            <div className="mt-1 font-mono text-xs">{result.skillId}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Code Hash</div>
            <div className="mt-1 font-mono text-xs">{result.codeHash.slice(0, 16)}...</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Reasons</div>
          <div className="space-y-2 text-sm text-muted-foreground">
            {result.reasons.length === 0 ? <p>No warnings detected.</p> : result.reasons.map((reason, index) => (
              <p key={`${reason}-${index}`}>{reason}</p>
            ))}
          </div>
        </div>

        {result.detectedRisks.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Detected Risks</div>
            <div className="space-y-2">
              {result.detectedRisks.map((risk, index) => (
                <div key={`${risk.rule}-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{risk.rule}</div>
                    <Badge variant={riskTone(risk.severity)}>{risk.severity}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{risk.description}</p>
                  {risk.location && (
                    <p className="mt-1 text-xs text-muted-foreground">Location: {risk.location}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkillInstallDialog(props: {
  open: boolean;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<SkillFormState>(createEmptySkillForm());
  const [slugLocked, setSlugLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState<SkillIngestionResult | null>(null);

  useEffect(() => {
    if (!props.open) {
      setForm(createEmptySkillForm());
      setSlugLocked(false);
      setSubmitting(false);
      setFormError('');
      setResult(null);
    }
  }, [props.open]);

  const updateField = <K extends keyof SkillFormState>(field: K, value: SkillFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleDisplayNameChange = (value: string) => {
    setForm((current) => ({
      ...current,
      displayName: value,
      slug: slugLocked ? current.slug : slugify(value),
    }));
  };

  const applyTemplate = (template: SkillTemplate) => {
    setForm(template.values);
    setSlugLocked(true);
    setFormError('');
    setResult(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setFormError('');
    setResult(null);

    try {
      const payload = buildIngestPayload(form);
      const res = await apiClient.post<ApiDataResponse<SkillIngestionResult>>('/skills/ingest', payload);
      const ingestResult = res.data;
      setResult(ingestResult);

      if (form.enableAfterIngest && (ingestResult.vettingResult === 'passed' || ingestResult.vettingResult === 'warning')) {
        await apiClient.patch(`/skills/${ingestResult.skillId}/enabled`, { enabled: true });
      }

      props.onInstalled();

      if (ingestResult.vettingResult === 'failed') {
        toast('error', 'Skill was blocked by security vetting. Review the reasons below.');
        return;
      }

      toast(
        'success',
        form.enableAfterIngest
          ? `${form.displayName} installed and enabled successfully.`
          : `${form.displayName} installed successfully.`,
      );
      props.onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const blockedResult = err.data as SkillIngestionResult | undefined;
        if (err.status === 422 && blockedResult?.skillId) {
          setResult(blockedResult);
          props.onInstalled();
          toast('error', 'Skill was blocked by security vetting. Review the reasons below.');
          return;
        }
        setFormError(err.message);
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Failed to install skill.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={() => !submitting && props.onClose()} />
      <div className="relative z-50 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">Add Skill</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste the source snapshot, describe the tool, and let the vetting pipeline decide if it can run.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={props.onClose} disabled={submitting}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Quick Demo Templates</CardTitle>
              <CardDescription>
                Use these to prove the happy path and the security path without writing skill code during the demo.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {SKILL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="rounded-lg border p-4 text-left transition hover:border-primary hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{template.label}</div>
                    <Badge variant={template.intent === 'safe' ? 'success' : 'warning'}>
                      {template.intent === 'safe' ? 'Passes vetting' : 'Blocked by vetting'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{template.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1.3fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Skill Identity</CardTitle>
                <CardDescription>
                  This becomes the record shown in the dashboard and used for runtime gating.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Display Name</label>
                    <Input
                      value={form.displayName}
                      onChange={(e) => handleDisplayNameChange(e.target.value)}
                      placeholder="Quote Summarizer"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium">Slug</label>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setSlugLocked(false);
                          setForm((current) => ({ ...current, slug: slugify(current.displayName) }));
                        }}
                      >
                        Regenerate
                      </button>
                    </div>
                    <Input
                      value={form.slug}
                      onChange={(e) => {
                        setSlugLocked(true);
                        updateField('slug', slugify(e.target.value));
                      }}
                      placeholder="quote-summarizer"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Explain what this skill does and when the agent should use it."
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source Type</label>
                    <Select
                      value={form.sourceType}
                      onChange={(e) => updateField('sourceType', e.target.value as InstallableSourceType)}
                    >
                      <option value="uploaded">Uploaded</option>
                      <option value="git_repo">Git Repository</option>
                      <option value="marketplace">Marketplace</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Version</label>
                    <Input
                      value={form.version}
                      onChange={(e) => updateField('version', e.target.value)}
                      placeholder="1.0.0"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Timeout (ms)</label>
                    <Input
                      type="number"
                      min="500"
                      max="20000"
                      value={form.executionTimeoutMs}
                      onChange={(e) => updateField('executionTimeoutMs', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source URL</label>
                    <Input
                      value={form.sourceUrl}
                      onChange={(e) => updateField('sourceUrl', e.target.value)}
                      placeholder="https://github.com/org/repo/blob/main/skill.js"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source Ref</label>
                    <Input
                      value={form.sourceRef}
                      onChange={(e) => updateField('sourceRef', e.target.value)}
                      placeholder="main or v1.0.0"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <div className="text-sm font-medium">Enable immediately after approval</div>
                    <p className="text-sm text-muted-foreground">
                      If vetting passes or warns, the skill will be enabled right away for runtime use.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={form.enableAfterIngest}
                    onChange={(e) => updateField('enableAfterIngest', e.target.checked)}
                  />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Runtime Tool Definition</CardTitle>
                <CardDescription>
                  External skills must define a tool contract and export a matching function or a generic <code>run</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tool Name</label>
                    <Input
                      value={form.toolName}
                      onChange={(e) => updateField('toolName', e.target.value.replace(/[^a-z0-9_]/g, ''))}
                      placeholder="summarize_quote"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tool Description</label>
                    <Input
                      value={form.toolDescription}
                      onChange={(e) => updateField('toolDescription', e.target.value)}
                      placeholder="Summarizes quote totals and next steps."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tool Parameters JSON</label>
                  <textarea
                    value={form.toolParameters}
                    onChange={(e) => updateField('toolParameters', e.target.value)}
                    className="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a JSON Schema-like object. This is what the model sees when deciding to call the tool.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Source Snapshot</label>
                  <textarea
                    value={form.source}
                    onChange={(e) => updateField('source', e.target.value)}
                    className="min-h-64 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                    placeholder="module.exports = { summarize_quote };"
                  />
                  <p className="text-xs text-muted-foreground">
                    The source is hashed and vetted. The runtime expects an exported function named <code>{form.toolName || 'tool_name'}</code> or <code>run</code>.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Advanced Metadata JSON</label>
                  <textarea
                    value={form.extraMetadata}
                    onChange={(e) => updateField('extraMetadata', e.target.value)}
                    className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Any object keys you add here will be merged into the stored skill metadata.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {result && <IngestionResultPanel result={result} />}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={props.onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Installing...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" /> Install Skill
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ManualOverrideDialog(props: {
  open: boolean;
  skill: SkillSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [result, setResult] = useState<ManualOverrideResult>('passed');
  const [reason, setReason] = useState('');
  const [enableAfterOverride, setEnableAfterOverride] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!props.open) {
      setResult('passed');
      setReason('');
      setEnableAfterOverride(true);
      setSaving(false);
      setError('');
    }
  }, [props.open]);

  const handleSave = async () => {
    if (!props.skill) return;
    if (reason.trim().length < 10) {
      setError('Please document the override reason with at least 10 characters.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/skills/${props.skill.id}/manual-override`, {
        result,
        reason: reason.trim(),
      });
      if (enableAfterOverride) {
        await apiClient.patch(`/skills/${props.skill.id}/enabled`, { enabled: true });
      }
      toast(
        'success',
        enableAfterOverride
          ? `${props.skill.displayName} overridden and enabled successfully.`
          : `${props.skill.displayName} overridden successfully.`,
      );
      props.onSaved();
      props.onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to apply manual override.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!props.open || !props.skill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={() => !saving && props.onClose()} />
      <div className="relative z-50 w-full max-w-xl rounded-xl border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Manual Override</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Use this only when you have reviewed the code and accept the remaining risk.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-sm font-medium">{props.skill.displayName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{props.skill.slug}</Badge>
              <StatusBadge status={props.skill.latestVetting ?? 'pending'} />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Override Result</label>
            <Select value={result} onChange={(e) => setResult(e.target.value as ManualOverrideResult)}>
              <option value="passed">Passed</option>
              <option value="warning">Warning</option>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Describe why this override is acceptable and what review you performed."
            />
          </div>

          <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium">Enable after override</div>
              <p className="text-sm text-muted-foreground">
                Turn the skill on immediately once the override record is written.
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={enableAfterOverride}
              onChange={(e) => setEnableAfterOverride(e.target.checked)}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={props.onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Applying...' : 'Apply Override'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SkillCard(props: {
  skill: SkillSummary;
  isSuperAdmin: boolean;
  onToggle: () => void;
  onShowHistory: () => void;
  onManualOverride: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const { toast } = useToast();

  const handleToggle = async () => {
    setToggling(true);
    try {
      await apiClient.patch(`/skills/${props.skill.id}/enabled`, { enabled: !props.skill.enabled });
      toast(
        'success',
        `${props.skill.displayName} ${props.skill.enabled ? 'disabled' : 'enabled'} successfully.`,
      );
      props.onToggle();
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast('error', err.message);
      } else {
        toast('error', `Failed to ${props.skill.enabled ? 'disable' : 'enable'} ${props.skill.displayName}.`);
      }
    } finally {
      setToggling(false);
    }
  };

  const needsReview =
    props.skill.latestVetting == null
    || props.skill.latestVetting === 'failed'
    || props.skill.latestVetting === 'pending';

  return (
    <Card className={needsReview ? 'border-warning/40' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{props.skill.displayName}</CardTitle>
              <Badge variant="outline">{props.skill.slug}</Badge>
            </div>
            <CardDescription className="mt-2">
              {props.skill.description ?? 'No description available.'}
            </CardDescription>
          </div>
          <Badge variant={props.skill.enabled ? 'success' : 'muted'}>
            {props.skill.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Source:</span>
          <span>{sourceLabel(props.skill.sourceType)}</span>

          {props.skill.currentVersion && (
            <>
              <span className="text-muted-foreground">Version:</span>
              <span className="font-mono text-xs">{props.skill.currentVersion}</span>
            </>
          )}

          <span className="text-muted-foreground">Vetting:</span>
          <StatusBadge status={props.skill.latestVetting ?? 'pending'} />
        </div>

        {needsReview && (
          <div className="rounded-lg border border-warning/30 bg-yellow-50 p-3 text-sm text-yellow-900">
            {props.skill.latestVetting === 'failed'
              ? 'This skill is blocked by vetting and cannot be enabled until a super admin overrides it.'
              : props.skill.latestVetting === 'pending'
                ? 'This skill is still pending review. It cannot be enabled yet.'
                : 'This skill has not been promoted to a current version yet. Review the vetting history first.'}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={(
              <Button variant={props.skill.enabled ? 'outline' : 'default'} size="sm" disabled={toggling}>
                {props.skill.enabled ? 'Disable' : 'Enable'}
              </Button>
            )}
            title={props.skill.enabled ? 'Disable Skill' : 'Enable Skill'}
            description={
              props.skill.enabled
                ? `This will immediately stop "${props.skill.displayName}" from being used in conversations.`
                : `This will make "${props.skill.displayName}" available to the assistant immediately.`
            }
            confirmLabel={props.skill.enabled ? 'Disable' : 'Enable'}
            variant={props.skill.enabled ? 'destructive' : 'default'}
            onConfirm={handleToggle}
          />
          <Button variant="ghost" size="sm" onClick={props.onShowHistory}>
            <History className="mr-1 h-3 w-3" /> Vetting History
          </Button>
          {props.isSuperAdmin && needsReview && (
            <Button variant="secondary" size="sm" onClick={props.onManualOverride}>
              <ShieldAlert className="mr-1 h-3 w-3" /> Manual Override
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SkillsPage() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApiQuery<SkillsResponse>('/skills', EMPTY_RESPONSE);
  const [historySkillId, setHistorySkillId] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [overrideSkill, setOverrideSkill] = useState<SkillSummary | null>(null);

  const skills = data?.data ?? [];
  const installedCount = skills.length;
  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const blockedCount = skills.filter((skill) => skill.latestVetting === 'failed').length;
  const reviewCount = skills.filter((skill) => skill.latestVetting == null || skill.latestVetting === 'pending').length;
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills"
        description="Add, vet, enable, and review runtime skills without touching the codebase."
        actions={(
          <Button onClick={() => setInstallOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Skill
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Installed"
          value={installedCount}
          description="Total skills currently registered in the system."
          icon={<Puzzle className="h-4 w-4" />}
          loading={loading}
        />
        <MetricCard
          title="Enabled"
          value={enabledCount}
          description="Skills exposed to the model right now."
          icon={<CheckCircle2 className="h-4 w-4" />}
          loading={loading}
        />
        <MetricCard
          title="Blocked"
          value={blockedCount}
          description="Skills currently blocked by security vetting."
          icon={<ShieldAlert className="h-4 w-4" />}
          loading={loading}
        />
        <MetricCard
          title="Needs Review"
          value={reviewCount}
          description="Skills missing an approvable current version."
          icon={<AlertTriangle className="h-4 w-4" />}
          loading={loading}
        />
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Fastest demo path
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the safe demo template, enable it immediately, then add the blocked security demo to prove SEC1 without leaving this page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setInstallOpen(true)}>
              <PencilLine className="mr-2 h-4 w-4" /> Open Skill Builder
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorPanel message={error} onRetry={refetch} />}

      {loading && (
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-48" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && skills.length === 0 && (
        <EmptyState
          icon={<Puzzle className="h-10 w-10" />}
          title="No skills installed"
          description="Add a skill from the portal, run it through vetting, and enable it for live conversations from this page."
          action={(
            <Button onClick={() => setInstallOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Your First Skill
            </Button>
          )}
        />
      )}

      {!loading && !error && skills.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isSuperAdmin={isSuperAdmin}
              onToggle={refetch}
              onShowHistory={() => setHistorySkillId(skill.id)}
              onManualOverride={() => setOverrideSkill(skill)}
            />
          ))}
        </div>
      )}

      <SkillInstallDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onInstalled={refetch}
      />

      <ManualOverrideDialog
        open={overrideSkill != null}
        skill={overrideSkill}
        onClose={() => setOverrideSkill(null)}
        onSaved={refetch}
      />

      {historySkillId && (
        <VettingHistoryDrawer
          skillId={historySkillId}
          onClose={() => setHistorySkillId(null)}
        />
      )}
    </div>
  );
}
