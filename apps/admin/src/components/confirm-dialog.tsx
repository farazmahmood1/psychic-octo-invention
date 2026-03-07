import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => !loading && setOpen(false)} />
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button variant={variant} onClick={() => void handleConfirm()} disabled={loading}>
                {loading ? 'Please wait...' : confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
