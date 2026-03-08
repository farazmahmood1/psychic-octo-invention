import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApiQuery } from '@/hooks/use-api-query';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bot,
  Mail,
  MessageCircle,
  Database,
  Server,
  FileSpreadsheet,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface IntegrationHealth {
  key: string;
  label: string;
  status: 'healthy' | 'degraded' | 'unconfigured' | 'error';
  checkedAt: string;
  message: string | null;
}

interface IntegrationsResponse {
  data: IntegrationHealth[];
}

const EMPTY_RESPONSE: IntegrationsResponse = { data: [] };

interface IntegrationDef {
  key: string;
  name: string;
  description: string;
  icon: ReactNode;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'openrouter',
    name: 'OpenRouter',
    description: 'AI model routing and API access. Powers all AI conversations.',
    icon: <Bot className="h-5 w-5" />,
  },
  {
    key: 'telegram',
    name: 'Telegram',
    description: 'Telegram bot for inbound and outbound messaging.',
    icon: <MessageCircle className="h-5 w-5" />,
  },
  {
    key: 'email',
    name: 'Email (SMTP)',
    description: 'Email sending and receiving via SMTP and inbound webhooks.',
    icon: <Mail className="h-5 w-5" />,
  },
  {
    key: 'ghl',
    name: 'GoHighLevel',
    description: 'CRM integration for contacts, opportunities, and automations.',
    icon: <Zap className="h-5 w-5" />,
  },
  {
    key: 'google_sheets',
    name: 'Google Sheets',
    description: 'Bookkeeping ledger export and receipt tracking.',
    icon: <FileSpreadsheet className="h-5 w-5" />,
  },
  {
    key: 'redis',
    name: 'Redis',
    description: 'Message queue and caching layer for background jobs.',
    icon: <Server className="h-5 w-5" />,
  },
  {
    key: 'database',
    name: 'Database (Postgres)',
    description: 'Primary data store. Hosted on Neon.',
    icon: <Database className="h-5 w-5" />,
  },
];

function statusVariant(status: string) {
  switch (status) {
    case 'healthy':
      return 'success' as const;
    case 'degraded':
      return 'warning' as const;
    case 'error':
      return 'destructive' as const;
    case 'unconfigured':
      return 'muted' as const;
    default:
      return 'outline' as const;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'error':
      return 'Error';
    case 'unconfigured':
      return 'Unconfigured';
    default:
      return status;
  }
}

export function IntegrationsPage() {
  const { data, loading } = useApiQuery<IntegrationsResponse>(
    '/integrations/health',
    EMPTY_RESPONSE,
  );

  const healthMap = new Map(
    (data?.data ?? []).map((h) => [h.key, h]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="View the connection status of all external services."
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((integration) => {
          const health = healthMap.get(integration.key);

          return (
            <Card key={integration.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    {integration.icon}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{integration.name}</CardTitle>
                  </div>
                  {loading ? (
                    <Skeleton className="h-5 w-20" />
                  ) : (
                    <Badge variant={statusVariant(health?.status ?? 'unconfigured')}>
                      {statusLabel(health?.status ?? 'unconfigured')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{integration.description}</CardDescription>
                {health?.message && (
                  <p className="mt-2 text-xs text-muted-foreground">{health.message}</p>
                )}
                {health?.checkedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last checked: {new Date(health.checkedAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
