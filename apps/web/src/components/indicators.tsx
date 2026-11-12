import type { ReactNode } from 'react';
import { analysisNames } from '../lib/format';
import { Button } from './ui/button';
import { CheckCheck, Clock3, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
export function AnalysisBadge({ status }: { status: string }) {
  if (status === 'completed')
    return (
      <span className="analysis-complete" aria-label="Analiza ukończona">
        <CheckCheck size={14} aria-hidden="true" />
        Przeanalizowano
      </span>
    );
  return (
    <span className={'analysis-badge ' + status}>
      {status === 'processing' ? (
        <LoaderCircle size={12} className="spin" />
      ) : status === 'failed' || status === 'stale' ? (
        <TriangleAlert size={12} />
      ) : (
        <Clock3 size={12} />
      )}
      {analysisNames[status] ?? status}
    </span>
  );
}
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="empty-state">
      <TriangleAlert size={30} />
      <h3>Nie udało się wczytać danych</h3>
      <p>{message}</p>
      <Button variant="outline" onClick={retry}>
        <RefreshCw size={15} /> Spróbuj ponownie
      </Button>
    </div>
  );
}
export function Stat({
  label,
  value,
  icon,
  hint,
  positive = false,
}: {
  label: string;
  value?: number;
  icon: ReactNode;
  hint?: string;
  positive?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat-heading">
        <span>{label}</span>
        <span className={'stat-icon ' + (positive ? 'positive' : '')}>{icon}</span>
      </div>
      <strong className="stat-value">{value ?? <span className="skeleton-number" />}</strong>
      <span className="stat-hint">
        {positive && <span className="tiny-dot" />}
        {hint}
      </span>
    </div>
  );
}
