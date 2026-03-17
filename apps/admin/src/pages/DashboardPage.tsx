import { MessageSquare, BarChart3, Puzzle, Activity } from 'lucide-react';
import { MetricCard } from '@/components/metric-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { useApiQuery } from '@/hooks/use-api-query';
import { Skeleton } from '@/components/ui/skeleton';
import { MiniBarChart, Sparkline } from '@/components/charts';

interface DashboardStats {
  data: {
    activeConversations: number;
    messagesToday: number;
    apiCostsMtd: number;
    activeSkills: number;
  };
}

interface RecentActivity {
  data: Array<{
    id: string;
    action: string;
    targetType: string | null;
    createdAt: string;
  }>;
}

interface IntegrationsResponse {
  data: Array<{
    key: string;
    status: 'healthy' | 'degraded' | 'unconfigured' | 'error';
    checkedAt: string;
  }>;
}

interface ConversationTrendResponse {
  data: Array<{ date: string; count: number }>;
}

interface CostTrendResponse {
  data: Array<{ date: string; cost: number }>;
}

const EMPTY_STATS: DashboardStats = {
  data: { activeConversations: 0, messagesToday: 0, apiCostsMtd: 0, activeSkills: 0 },
};

const EMPTY_ACTIVITY: RecentActivity = { data: [] };
const EMPTY_INTEGRATIONS: IntegrationsResponse = { data: [] };
const EMPTY_CONV_TREND: ConversationTrendResponse = { data: [] };
const EMPTY_COST_TREND: CostTrendResponse = { data: [] };

export function DashboardPage() {
  const stats = useApiQuery<DashboardStats>('/dashboard/stats', EMPTY_STATS);
  const activity = useApiQuery<RecentActivity>('/dashboard/recent-activity', EMPTY_ACTIVITY);
  const integrations = useApiQuery<IntegrationsResponse>('/integrations/health', EMPTY_INTEGRATIONS);
  const convTrend = useApiQuery<ConversationTrendResponse>('/dashboard/conversation-trend', EMPTY_CONV_TREND);
  const costTrend = useApiQuery<CostTrendResponse>('/dashboard/cost-trend', EMPTY_COST_TREND);

  const convTrendData = (convTrend.data?.data ?? []).map((d) => ({
    label: d.date.slice(5), // MM-DD
    value: d.count,
  }));

  const costSparklineData = (costTrend.data?.data ?? []).map((d) => d.cost);

  const s = stats.data?.data ?? EMPTY_STATS.data;
  const integrationRows = integrations.data?.data ?? [];
  const integrationHealthy = integrationRows.filter((i) => i.status === 'healthy').length;
  const integrationIssues = integrationRows.filter((i) => i.status === 'degraded' || i.status === 'error').length;
  const integrationUnconfigured = integrationRows.filter((i) => i.status === 'unconfigured').length;
  const formattedMtdCost = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(s.apiCostsMtd ?? 0);

  return (
    <div className="space-y-8">
      {/* Metric cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Conversations"
          value={s.activeConversations}
          icon={<MessageSquare className="h-4 w-4" />}
          loading={stats.loading}
          description="Currently open chats"
        />
        <MetricCard
          title="Messages Today"
          value={s.messagesToday}
          icon={<Activity className="h-4 w-4" />}
          loading={stats.loading}
          description="Inbound and outbound"
        />
        <MetricCard
          title="API Costs (MTD)"
          value={formattedMtdCost}
          icon={<BarChart3 className="h-4 w-4" />}
          loading={stats.loading}
          description="Month to date"
        />
        <MetricCard
          title="Active Skills"
          value={s.activeSkills}
          icon={<Puzzle className="h-4 w-4" />}
          loading={stats.loading}
          description="Enabled and vetted"
        />
      </div>

      {/* Trend charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversation Volume (14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {convTrend.loading ? (
              <Skeleton className="h-[160px] w-full" />
            ) : convTrendData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <MiniBarChart data={convTrendData} height={160} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">API Cost Trend (14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {costTrend.loading ? (
              <Skeleton className="h-12 w-full" />
            ) : costSparklineData.length < 2 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Not enough data for chart.</p>
            ) : (
              <div className="space-y-2">
                <Sparkline data={costSparklineData} width={500} height={80} className="w-full" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{(costTrend.data?.data ?? [])[0]?.date.slice(5)}</span>
                  <span>{((arr) => arr[arr.length - 1]?.date.slice(5))(costTrend.data?.data ?? [])}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System health & recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            {integrations.loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : integrationRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Integration status data is not available yet.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Healthy</span>
                  <StatusBadge status="completed" />
                  <span className="font-semibold">{integrationHealthy}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Issues</span>
                  <StatusBadge status={integrationIssues > 0 ? 'failed' : 'completed'} />
                  <span className="font-semibold">{integrationIssues}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Unconfigured</span>
                  <StatusBadge status={integrationUnconfigured > 0 ? 'pending' : 'completed'} />
                  <span className="font-semibold">{integrationUnconfigured}</span>
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  Last check: {new Date(integrationRows[0]!.checkedAt).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="ml-auto h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : (activity.data?.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No recent activity to display.
              </p>
            ) : (
              <div className="space-y-3">
                {(activity.data?.data ?? []).slice(0, 10).map((event) => (
                  <div key={event.id} className="flex items-center gap-3 text-sm">
                    <StatusBadge status={event.action.includes('fail') ? 'failed' : 'completed'} />
                    <span className="font-medium">{event.action.replace(/_/g, ' ').replace(/\./g, ' ')}</span>
                    {event.targetType && (
                      <span className="text-muted-foreground">on {event.targetType}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
