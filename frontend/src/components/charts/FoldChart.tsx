'use client';

import { useElementWidth } from '@/lib/hooks/useElementWidth';
import { formatPeriodShort } from '@/lib/format';

export type Fold = { fold: number; test_period: string; roc_auc: number; roc_auc_sensitivity: number };

const L = 38, R = 6, T = 10;
const LO = 0.5, HI = 1; // AUC axis. 0.5 = chance.

/** ROC-AUC per validation fold. Bars: production model. Rings: C = 100 sensitivity. Dashed: mean. */
export function FoldChart({ folds, compact = false }: { folds: Fold[]; compact?: boolean }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const W = Math.max(measured, 260);
  const H = compact ? 200 : 300;
  const B = compact ? 26 : 46;
  const pw = W - L - R, ph = H - T - B, n = folds.length;
  const y = (v: number) => T + ph * (1 - (v - LO) / (HI - LO));
  const bw = pw / Math.max(1, n);
  const mean = folds.reduce((a, f) => a + f.roc_auc, 0) / Math.max(1, n);
  const aria = `ROC-AUC across ${n} validation folds, mean ${mean.toFixed(3)}`;

  return (
    <div ref={ref} style={{ minHeight: H }} className="w-full">
      {measured > 0 && n > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={aria} className="block h-auto w-full overflow-visible">
          {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-line" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-tx3 text-xs">{v.toFixed(1)}</text>
            </g>
          ))}
          {folds.map((f, i) => {
            const bx = L + i * bw + bw * 0.2, w = bw * 0.6, cx = bx + w / 2;
            return (
              <g key={f.fold}>
                <rect x={bx} y={y(f.roc_auc)} width={w} height={y(LO) - y(f.roc_auc)} rx={4} className="fill-info" fillOpacity={i === n - 1 ? 1 : 0.55}>
                  <title>{`Fold ${f.fold}, test ${f.test_period}: ${f.roc_auc.toFixed(3)} (C=100: ${f.roc_auc_sensitivity.toFixed(3)})`}</title>
                </rect>
                {!compact && <circle cx={cx} cy={y(f.roc_auc_sensitivity)} r={4.5} strokeWidth={1.6} className="fill-surface stroke-tx" />}
                <text x={cx} y={H - B + 18} textAnchor="middle" className="fill-tx3 text-xs">F{f.fold}</text>
                {!compact && <text x={cx} y={H - B + 34} textAnchor="middle" className="fill-tx3 text-[11px]">{formatPeriodShort(f.test_period)}</text>}
              </g>
            );
          })}
          <line x1={L} x2={W - R} y1={y(mean)} y2={y(mean)} strokeDasharray="5 4" strokeWidth={1.3} className="stroke-tx" />
        </svg>
      )}
    </div>
  );
}
