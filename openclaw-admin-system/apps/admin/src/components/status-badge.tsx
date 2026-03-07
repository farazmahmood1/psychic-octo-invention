import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';

type StatusVariant = BadgeProps['variant'];

const STATUS_MAP: Record<string, { label: string; variant: StatusVariant }> = {
  // Conversation
  active: { label: 'Active', variant: 'success' },
  archived: { label: 'Archived', variant: 'muted' },
  closed: { label: 'Closed', variant: 'secondary' },
  // Message
  pending: { label: 'Pending', variant: 'warning' },
  sent: { label: 'Sent', variant: 'info' },
  delivered: { label: 'Delivered', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  received: { label: 'Received', variant: 'success' },
  // Vetting
  passed: { label: 'Passed', variant: 'success' },
  warning: { label: 'Warning', variant: 'warning' },
  // Job
  running: { label: 'Running', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  retrying: { label: 'Retrying', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  // Integration
  inactive: { label: 'Inactive', variant: 'muted' },
  error: { label: 'Error', variant: 'destructive' },
  // Sub-agent
  queued: { label: 'Queued', variant: 'secondary' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const mapped = STATUS_MAP[status];
  return (
    <Badge variant={mapped?.variant ?? 'outline'} className={className}>
      {mapped?.label ?? status.replace(/_/g, ' ')}
    </Badge>
  );
}
