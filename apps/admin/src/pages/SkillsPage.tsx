import { useState } from 'react';
import type { SkillSummary, VettingRecord, PaginatedResponse } from '@openclaw/shared';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorPanel } from '@/components/error-panel';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { useApiQuery } from '@/hooks/use-api-query';
import { apiClient } from '@/api/client';
import { Puzzle, History, X } from 'lucide-react';

interface SkillsResponse {
  data: SkillSummary[];
}

const EMPTY_RESPONSE: SkillsResponse = { data: [] };

const EMPTY_VETTING: PaginatedResponse<VettingRecord> = {
  data: [],
  meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

function sourceLabel(type: string): string {
  const map: Record<string, string> = {
    builtin: 'Built-in',
    uploaded: 'Uploaded',
    git_repo: 'Git Repository',
    marketplace: 'Marketplace',
  };
  return map[type] ?? type;
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
                  {rec.reviewerNote && (
                    <p className="text-sm">{rec.reviewerNote}</p>
                  )}
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

function SkillCard({
  skill,
  onToggle,
  onShowHistory,
}: {
  skill: SkillSummary;
  onToggle: () => void;
  onShowHistory: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const { toast } = useToast();

  const handleToggle = async () => {
    setToggling(true);
    try {
      await apiClient.patch(`/skills/${skill.id}/enabled`, { enabled: !skill.enabled });
      toast('success', `${skill.displayName} ${skill.enabled ? 'disabled' : 'enabled'} successfully.`);
      onToggle();
    } catch {
      toast('error', `Failed to ${skill.enabled ? 'disable' : 'enable'} ${skill.displayName}.`);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{skill.displayName}</CardTitle>
            <CardDescription className="mt-1">
              {skill.description ?? 'No description available.'}
            </CardDescription>
          </div>
          <Badge variant={skill.enabled ? 'success' : 'muted'}>
            {skill.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Source:</span>
          <span>{sourceLabel(skill.sourceType)}</span>

          {skill.currentVersion && (
            <>
              <span className="text-muted-foreground">Version:</span>
              <span className="font-mono text-xs">{skill.currentVersion}</span>
            </>
          )}

          {skill.latestVetting && (
            <>
              <span className="text-muted-foreground">Vetting:</span>
              <StatusBadge status={skill.latestVetting} />
            </>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <ConfirmDialog
            trigger={
              <Button variant={skill.enabled ? 'outline' : 'default'} size="sm" disabled={toggling}>
                {skill.enabled ? 'Disable' : 'Enable'}
              </Button>
            }
            title={skill.enabled ? 'Disable Skill' : 'Enable Skill'}
            description={
              skill.enabled
                ? `This will immediately stop "${skill.displayName}" from being used in conversations. You can re-enable it later.`
                : `This will allow "${skill.displayName}" to be used in conversations. Make sure it has passed vetting.`
            }
            confirmLabel={skill.enabled ? 'Disable' : 'Enable'}
            variant={skill.enabled ? 'destructive' : 'default'}
            onConfirm={handleToggle}
          />
          <Button variant="ghost" size="sm" onClick={onShowHistory}>
            <History className="mr-1 h-3 w-3" /> Vetting History
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SkillsPage() {
  const { data, loading, error, refetch } = useApiQuery<SkillsResponse>('/skills', EMPTY_RESPONSE);
  const [historySkillId, setHistorySkillId] = useState<string | null>(null);

  const skills = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills"
        description="Manage installed skills, toggle availability, and review vetting status."
      />

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
          description="Skills will appear here once they're registered in the system. Skills extend what the AI agent can do."
        />
      )}

      {!loading && !error && skills.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={refetch}
              onShowHistory={() => setHistorySkillId(skill.id)}
            />
          ))}
        </div>
      )}

      {historySkillId && (
        <VettingHistoryDrawer
          skillId={historySkillId}
          onClose={() => setHistorySkillId(null)}
        />
      )}
    </div>
  );
}
