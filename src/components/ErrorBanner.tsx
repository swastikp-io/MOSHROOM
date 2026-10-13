import { AlertTriangle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div className="bg-white border-b border-black text-black px-4 py-2 flex items-center justify-between font-mono text-xs z-40 select-none">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-black shrink-0" />
        <span className="font-semibold uppercase tracking-wider">{message}</span>
      </div>
      <button
        onClick={onDismiss}
        className="p-1 hover:bg-neutral-100 cursor-pointer"
        title="Dismiss notice"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
