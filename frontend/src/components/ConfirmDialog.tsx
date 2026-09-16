import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-[320px] rounded-[14px] border border-white/[0.08] bg-card p-5 shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
        style={{ animation: "dialog-in 0.15s ease-out" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {body && <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{body}</p>}
        <div className="mt-4 flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
