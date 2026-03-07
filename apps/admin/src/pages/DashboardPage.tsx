import { MessageSquare, BarChart3, Puzzle, Activity } from 'lucide-react';
import { MetricCard } from '@/components/metric-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { useApiQuery } from '@/hooks/use-api-query';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardStats {
  data: {
    activeChats: number;
    messagesToday: number;
    costMtd: string;
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

const EMPTY_STATS: DashboardStats = {
  data: { activeChats: 0, messagesToday: 0, costMtd: '$0.00', activeSkills: 0 },
};

const EMPTY_ACTIVITY: RecentActivity = { data: [] };

export function DashboardPage() {
  const stats = useApiQuery<DashboardStats>('/dashboard/stats', EMPTY_STATS);
  const activity = useApiQuery<RecentActivity>('/dashboard/recent-activity', EMPTY_ACTIVITY);

  const s = stats.data?.data ?? EMPTY_STATS.data;

  return (
    <div className="space-y-8">
      {/* Metric cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Conversations"
          value={s.activeChats}
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
          value={s.costMtd}
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

      {/* Recent activity */}
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
  );
}
