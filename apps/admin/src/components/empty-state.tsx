import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
      <div className="mb-3 text-muted-foreground">
        {icon ?? <Inbox className="h-10 w-10" />}
      </div>
      <h3 className="text-lg font-medium">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
