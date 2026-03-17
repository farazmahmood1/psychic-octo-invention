import { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiQuery } from '@/hooks/use-api-query';
import { useToast } from '@/components/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { apiClient } from '@/api/client';
import {
  Bot,
  Mail,
  MessageCircle,
  Database,
  Server,
  FileSpreadsheet,
  Zap,
  Settings2,
  Loader2,
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

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  helpText: string | null;
  configured: boolean;
  maskedValue: string | null;
}

interface IntegrationConfigResponse {
  data: {
    key: string;
    fields: ConfigField[];
  };
}

function SetupWizard({ integrationKey, integrationName, open, onClose, onSaved }: {
  integrationKey: string;
  integrationName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await apiClient.get<IntegrationConfigResponse['data']>(`/integrations/${integrationKey}/config`);
      setFields(res.fields);
      // Pre-fill empty values
      const initial: Record<string, string> = {};
      for (const f of res.fields) {
        initial[f.key] = '';
      }
      setValues(initial);
    } catch {
      toast('error', 'Failed to load configuration');
    } finally {
      setLoadingConfig(false);
    }
  }, [integrationKey, toast]);

  // Load config when dialog opens
  useEffect(() => {
    if (open) void loadConfig();
  }, [open, loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/integrations/${integrationKey}/config`, { fields: values });
      toast('success', `${integrationName} configuration saved`);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration';
      toast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Configure {integrationName}</DialogTitle>
        <DialogDescription>
          Enter the credentials and settings for this integration. Fields are applied at runtime.
        </DialogDescription>
      </DialogHeader>

      {loadingConfig ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-sm font-medium">
                {field.label}
                {field.required && <span className="ml-1 text-destructive">*</span>}
              </label>
              <Input
                type={field.type === 'password' ? 'password' : 'text'}
                placeholder={field.configured ? `Current: ${field.maskedValue ?? '(set)'}` : 'Not configured'}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
              {field.helpText && (
                <p className="mt-1 text-xs text-muted-foreground">{field.helpText}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Configuration
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export function IntegrationsPage() {
  const { data, loading, refetch } = useApiQuery<IntegrationsResponse>(
    '/integrations/health',
    EMPTY_RESPONSE,
  );

  const [wizardKey, setWizardKey] = useState<string | null>(null);

  const healthMap = new Map(
    (data?.data ?? []).map((h) => [h.key, h]),
  );

  const wizardIntegration = INTEGRATIONS.find((i) => i.key === wizardKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="View the connection status of all external services. Click Configure to set up credentials."
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
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() => setWizardKey(integration.key)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Configure
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {wizardKey && wizardIntegration && (
        <SetupWizard
          integrationKey={wizardKey}
          integrationName={wizardIntegration.name}
          open={!!wizardKey}
          onClose={() => setWizardKey(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
