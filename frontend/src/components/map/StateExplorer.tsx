'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { SouthSudanMap } from './SouthSudanMap';
import { StateCard } from './StateCard';
import type { AreaCollection, CountyRecord } from '@/lib/schemas';

type Props = {
  states: AreaCollection;
  stateRisk: Record<string, number>;
  counties: CountyRecord[];
  /** 'hero': text + card on the left, map on the right. 'split': map beside the card. */
  layout: 'hero' | 'split';
  intro?: ReactNode;
};

/** The state map with its summary card. Selection defaults to the highest-risk state. */
export function StateExplorer({ states, stateRisk, counties, layout, intro }: Props) {
  const initial = useMemo(
    () => Object.entries(stateRisk).sort((a, b) => b[1] - a[1])[0]?.[0] ?? states.features[0]?.properties.pcode ?? null,
    [stateRisk, states],
  );
  const [selected, setSelected] = useState<string | null>(initial);
  const state = states.features.find((f) => f.properties.pcode === selected)?.properties;

  const map = <SouthSudanMap areas={states} values={stateRisk} selected={selected} onSelect={setSelected} className={layout === 'hero' ? 'w-full' : ''} />;
  const card = state ? (
    <StateCard pcode={state.pcode} name={state.name} mean={stateRisk[state.pcode]} counties={counties.filter((c) => c.state_pcode === state.pcode)} />
  ) : null;

  if (layout === 'split') {
    return <div className="grid gap-5 min-[1000px]:grid-cols-[7fr_4fr] min-[1000px]:items-start">{map}{card}</div>;
  }
  return (
    <section className="grid gap-7 min-[1000px]:grid-cols-[5fr_7fr] min-[1000px]:items-stretch min-[1000px]:gap-10">
      <div className="flex flex-col justify-between gap-8 max-[999px]:contents">
        <div className="max-[999px]:order-1">{intro}</div>
        <div className="max-[999px]:order-3">{card}</div>
      </div>
      <div className="flex max-[999px]:order-2 [&>div]:flex-1">{map}</div>
    </section>
  );
}
