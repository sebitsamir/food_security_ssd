import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Gauge } from '@/components/charts/Gauge';
import { ScaleBar } from '@/components/charts/ScaleBar';
import { LineChart } from '@/components/charts/LineChart';
import { FoldChart } from '@/components/charts/FoldChart';
import { RiskBadge } from '@/components/risk/RiskBadge';
import { PhaseChip } from '@/components/risk/PhaseChip';

const folds = [1, 2, 3].map((n) => ({ fold: n, test_period: `2024-0${n}`, roc_auc: 0.8 + n / 100, roc_auc_sensitivity: 0.79 }));

describe('charts', () => {
  it('Gauge describes its value, and its empty state', () => {
    const { rerender } = render(<Gauge value={0.874} />);
    expect(screen.getByRole('img', { name: 'Risk probability 87.4%' })).toBeInTheDocument();
    expect(screen.getByText('87.4%')).toBeInTheDocument();
    rerender(<Gauge value={null} />);
    expect(screen.getByRole('img', { name: 'No prediction yet' })).toBeInTheDocument();
  });
  it('ScaleBar labels its position and band', () => {
    render(<ScaleBar value={0.874} />);
    expect(screen.getByRole('img', { name: /87\.4% on a 0 to 100 percent scale, High band/ })).toBeInTheDocument();
  });
  it('FoldChart summarises for assistive tech and renders every fold', () => {
    const { container } = render(<FoldChart folds={folds} />);
    expect(screen.getByRole('img', { name: 'ROC-AUC across 3 validation folds, mean 0.820' })).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });
  it('LineChart renders a point per value, and degrades with too little data', () => {
    const { container, unmount } = render(<LineChart values={[10, 40, 70]} labels={['a', 'b', 'c']} ariaLabel="History" />);
    expect(screen.getByRole('img', { name: 'History' })).toBeInTheDocument();
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3);
    unmount();
    render(<LineChart values={[10]} labels={['a']} ariaLabel="x" />);
    expect(screen.getByText('Not enough history to chart.')).toBeInTheDocument();
  });
});

describe('risk atoms', () => {
  it('RiskBadge shows label for a probability and "No data" otherwise', () => {
    const { rerender } = render(<RiskBadge probability={0.9} />);
    expect(screen.getByText('High')).toBeInTheDocument();
    rerender(<RiskBadge probability={Number.NaN} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
  it('PhaseChip names the phase', () => {
    render(<PhaseChip phase={4} />);
    expect(screen.getByText('Emergency')).toBeInTheDocument();
  });
});
