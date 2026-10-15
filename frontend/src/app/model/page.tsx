import type { Metadata } from 'next';
import { FoldChart } from '@/components/charts/FoldChart';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatStrip } from '@/components/ui/StatStrip';
import { getModel } from '@/lib/api';
import { formatPeriod } from '@/lib/format';

export const metadata: Metadata = { title: 'Model' };
export const dynamic = 'force-dynamic';

const f3 = (n: number) => n.toFixed(3);

export default async function ModelPage() {
  const m = await getModel();
  const p = m.production;
  const s = m.sensitivity;
  return (
    <div className="space-y-14 lg:space-y-16">
      <div className="space-y-7">
        <PageHeader title="Model" />
        <StatStrip
          label="Validation summary"
          items={[
            { label: 'Mean AUC', value: f3(p.mean) }, { label: 'Std. deviation', value: f3(p.std) }, { label: 'Worst fold', value: f3(p.min) },
            { label: 'Best fold', value: f3(p.max) }, { label: 'Latest fold', value: f3(p.latest) },
          ]}
        />
      </div>

      <Panel aria-labelledby="folds-title">
        <h2 id="folds-title" className="mb-2.5 text-[clamp(1.2rem,2vw,1.45rem)] font-medium tracking-[-0.02em]">ROC-AUC by fold</h2>
        <FoldChart folds={m.folds} />
        <details className="mt-3.5 text-[13px] text-tx2">
          <summary className="cursor-pointer text-center focus-visible:outline-2 focus-visible:outline-info">View as table</summary>
          <div className="overflow-x-auto">
            <table className="rtable">
              <thead><tr><th scope="col">Fold</th><th scope="col">Test period</th><th scope="col" className="num">C = 1.0</th><th scope="col" className="num">C = 100</th></tr></thead>
              <tbody>{m.folds.map((x) => (
                <tr key={x.fold}><td>F{x.fold}</td><td>{formatPeriod(x.test_period)}</td><td className="num">{f3(x.roc_auc)}</td><td className="num">{f3(x.roc_auc_sensitivity)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </Panel>

      <section>
        <h2 className="mb-3.5 text-[clamp(1.2rem,2vw,1.45rem)] font-medium tracking-[-0.02em]">Sensitivity check</h2>
        <Panel className="overflow-x-auto !px-2 !py-1">
          <table className="rtable">
            <thead><tr><th scope="col">Setting</th><th scope="col" className="num">Mean</th><th scope="col" className="num">Worst</th><th scope="col" className="num">Latest</th></tr></thead>
            <tbody>
              <tr><td>C = 1.0 <small className="ml-1 text-tx3">Production</small></td><td className="num">{f3(p.mean)}</td><td className="num">{f3(p.min)}</td><td className="num">{f3(p.latest)}</td></tr>
              <tr><td>C = 100 <small className="ml-1 text-tx3">Sensitivity</small></td><td className="num">{f3(s.mean)}</td><td className="num">{f3(s.min)}</td><td className="num">{f3(s.latest)}</td></tr>
            </tbody>
          </table>
        </Panel>
      </section>
    </div>
  );
}
