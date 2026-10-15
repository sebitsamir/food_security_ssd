'use client';

import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { ExportMenu } from '@/components/export/ExportMenu';
import { RiskBadge } from '@/components/risk/RiskBadge';
import { ProbabilityCell } from '@/components/risk/ProbabilityCell';
import { predictionCsv } from '@/lib/export/csv';
import { makeListPdf } from '@/lib/export/reports';
import { dayStamp } from '@/lib/export/download';
import type { PredictionRecord } from '@/lib/export/types';

export function RunHistory({ runs, onClear }: { runs: PredictionRecord[]; onClear: () => void }) {
  if (!runs.length) return null;
  const n = runs.length;
  const noun = n === 1 ? 'run' : 'runs';
  return (
    <section aria-labelledby="runs-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="runs-title" className="text-[clamp(1.2rem,2vw,1.45rem)] font-medium tracking-[-0.02em]">Runs this session</h2>
        <div className="flex gap-2.5">
          <ExportMenu
            actions={[
              {
                kind: 'PDF', title: 'PDF report', description: `All ${n} ${noun}, formatted`, filename: `prediction-runs-${dayStamp()}.pdf`,
                build: () => makeListPdf({
                  title: 'Prediction runs', label: 'Session report', noun: 'Runs',
                  subtitle: `${n} ${n === 1 ? 'scenario' : 'scenarios'} run in this session. Newest first.`,
                  rows: runs.map((r, i) => ({ rank: n - i, county: r.county, state: r.state, p: r.p1 })),
                }),
              },
              { kind: 'CSV', title: 'CSV data', description: `All ${n} ${noun} with inputs`, filename: `prediction-runs-${dayStamp()}.csv`, build: () => predictionCsv(runs) },
            ]}
          />
          <Button size="sm" onClick={onClear}>Clear</Button>
        </div>
      </div>
      <Panel className="overflow-x-auto !px-2 !py-1">
        <table className="rtable">
          <caption className="sr-only">Prediction runs this session</caption>
          <thead><tr><th scope="col">County</th><th scope="col">Probability</th><th scope="col">Risk band</th><th scope="col">Time</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td><span className="block font-medium">{r.county}</span><small className="block text-[13px] text-tx3">{r.state}</small></td>
                <td className="c-p"><ProbabilityCell probability={r.p1} /></td>
                <td className="c-b"><RiskBadge probability={r.p1} /></td>
                <td className="c-t whitespace-nowrap text-[13px] text-tx3">{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}
