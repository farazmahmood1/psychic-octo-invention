import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiClientError } from '@/api/client';
import { useToast } from '@/components/toast';
import { useApiQuery } from '@/hooks/use-api-query';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import type { RoutingSettings } from '@openclaw/shared';
import { Plus, Trash2 } from 'lucide-react';

const EMPTY_SETTINGS: { data: RoutingSettings } = {
  data: {
    primaryModel: '',
    fallbackModel: null,
    maxCostPerRequestUsd: null,
    maxMonthlyBudgetUsd: null,
    routingRules: [],
  },
};

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post<unknown>('/auth/change-password', { currentPassword, newPassword });
      toast('success', 'Password changed successfully. Redirecting to login...');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change Password</CardTitle>
        <CardDescription>
          You will be logged out of all sessions after changing your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="max-w-md space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <label htmlFor="currentPassword" className="text-sm font-medium">Current Password</label>
            <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required disabled={submitting} />
          </div>
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">New Password</label>
            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required disabled={submitting} />
            <p className="text-xs text-muted-foreground">Min 12 characters. Must include uppercase, lowercase, number, and symbol.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</label>
            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required disabled={submitting} />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Changing...' : 'Change Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface RuleRow {
  pattern: string;
  model: string;
  priority: number;
}

function RoutingSettingsForm() {
  const { data, loading } = useApiQuery<{ data: RoutingSettings }>('/settings/routing', EMPTY_SETTINGS);
  const { toast } = useToast();

  const [primaryModel, setPrimaryModel] = useState('');
  const [fallbackModel, setFallbackModel] = useState('');
  const [maxCostPerRequest, setMaxCostPerRequest] = useState('');
  const [maxMonthlyBudget, setMaxMonthlyBudget] = useState('');
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (data?.data) {
      const s = data.data;
      setPrimaryModel(s.primaryModel || '');
      setFallbackModel(s.fallbackModel || '');
      setMaxCostPerRequest(s.maxCostPerRequestUsd?.toString() || '');
      setMaxMonthlyBudget(s.maxMonthlyBudgetUsd?.toString() || '');
      setRules(s.routingRules.map((r) => ({ ...r })));
    }
  }, [data]);

  const addRule = () => {
    setRules([...rules, { pattern: '', model: '', priority: rules.length }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, field: keyof RuleRow, value: string | number) => {
    setRules(rules.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setValidationError('');

    if (!primaryModel.trim()) {
      setValidationError('Primary model is required');
      return;
    }

    const costPerReq = maxCostPerRequest ? parseFloat(maxCostPerRequest) : undefined;
    const monthlyBudget = maxMonthlyBudget ? parseFloat(maxMonthlyBudget) : undefined;

    if (costPerReq !== undefined && (isNaN(costPerReq) || costPerReq <= 0 || costPerReq > 10)) {
      setValidationError('Max cost per request must be between $0.01 and $10');
      return;
    }

    if (monthlyBudget !== undefined && (isNaN(monthlyBudget) || monthlyBudget <= 0)) {
      setValidationError('Monthly budget must be a positive number');
      return;
    }

    const invalidRule = rules.find((r) => r.pattern && !r.model);
    if (invalidRule) {
      setValidationError('Each routing rule needs both a pattern and a model');
      return;
    }

    setSaving(true);
    try {
      await apiClient.patch('/settings/routing', {
        primaryModel: primaryModel.trim(),
        fallbackModel: fallbackModel.trim() || undefined,
        maxCostPerRequestUsd: costPerReq,
        maxMonthlyBudgetUsd: monthlyBudget,
        routingRules: rules.filter((r) => r.pattern && r.model),
      });
      toast('success', 'Routing settings saved successfully.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast('error', err.message);
      } else {
        toast('error', 'Failed to save routing settings.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Model Routing</CardTitle>
        <CardDescription>
          Configure which AI models handle different types of requests. Controls cost and quality tradeoffs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {validationError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{validationError}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Model</label>
            <Input value={primaryModel} onChange={(e) => setPrimaryModel(e.target.value)} placeholder="e.g. google/gemini-2.5-flash" />
            <p className="text-xs text-muted-foreground">Main model for standard requests.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Fallback Model</label>
            <Input value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} placeholder="e.g. anthropic/claude-sonnet-4" />
            <p className="text-xs text-muted-foreground">Used when primary model is unavailable.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Cost Per Request ($)</label>
            <Input type="number" step="0.01" min="0" max="10" value={maxCostPerRequest} onChange={(e) => setMaxCostPerRequest(e.target.value)} placeholder="e.g. 0.50" />
            <p className="text-xs text-muted-foreground">Requests exceeding this cost will be throttled.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Monthly Budget ($)</label>
            <Input type="number" step="1" min="0" value={maxMonthlyBudget} onChange={(e) => setMaxMonthlyBudget(e.target.value)} placeholder="e.g. 500" />
            <p className="text-xs text-muted-foreground">Total monthly AI spending limit.</p>
          </div>
        </div>

        {/* Routing rules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Routing Rules</label>
            <Button variant="outline" size="sm" onClick={addRule}>
              <Plus className="mr-1 h-3 w-3" /> Add Rule
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Rules match message patterns to specific models. Higher priority rules are evaluated first.
          </p>
          {rules.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No custom routing rules. All requests will use the primary model.
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Pattern (e.g. *receipt*)"
                    value={rule.pattern}
                    onChange={(e) => updateRule(i, 'pattern', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Model ID"
                    value={rule.model}
                    onChange={(e) => updateRule(i, 'model', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={rule.priority}
                    onChange={(e) => updateRule(i, 'priority', parseInt(e.target.value) || 0)}
                    className="w-20"
                    title="Priority"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeRule(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <ConfirmDialog
            trigger={
              <Button disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            }
            title="Save Routing Settings"
            description="This will update the AI model routing configuration for all new conversations immediately. Are you sure?"
            confirmLabel="Save"
            onConfirm={handleSave}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your account and system configuration."
      />

      {/* Profile section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Display Name</span>
              <p className="font-medium">{user?.displayName ?? '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Role</span>
              <p>
                <Badge variant="outline">{formatRole(user?.role ?? '')}</Badge>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security section */}
      <ChangePasswordForm />

      {/* Model routing config */}
      <RoutingSettingsForm />
    </div>
  );
}
