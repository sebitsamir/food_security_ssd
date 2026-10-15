import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CountiesShell } from '@/components/counties/CountiesShell';
import { CountyProfile } from '@/components/counties/CountyProfile';
import { counties, detail } from './fixtures';

let segment: string | null = null;
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => segment }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const shell = () => render(<CountiesShell counties={counties}><div data-testid="detail">detail</div></CountiesShell>);
const rowNames = () => within(screen.getByRole('list', { name: 'Counties' })).getAllByRole('link').map((a) => a.textContent?.split(/\d/)[0]);

describe('CountiesShell', () => {
  it('lists counties by highest risk and links each to its own URL', () => {
    segment = null;
    shell();
    expect(rowNames()).toEqual(['Gamma OneGamma', 'Alpha TwoAlpha', 'Gamma TwoGamma', 'Beta OneBeta', 'Beta TwoBeta', 'Alpha OneAlpha']);
    expect(screen.getByRole('link', { name: /Alpha Two/ })).toHaveAttribute('href', '/counties/S1B');
  });
  it('searches, filters by state and re-sorts', async () => {
    segment = null;
    const user = userEvent.setup();
    shell();
    await user.type(screen.getByLabelText('Search county'), 'one');
    expect(rowNames()).toHaveLength(3);
    await user.selectOptions(screen.getByLabelText('State'), 'S2');
    expect(rowNames()).toEqual(['Beta OneBeta']);
    await user.clear(screen.getByLabelText('Search county'));
    await user.selectOptions(screen.getByLabelText('State'), '');
    await user.click(screen.getByRole('button', { name: 'A to Z' }));
    expect(rowNames()[0]).toBe('Alpha OneAlpha');
  });
  it('explains an empty search', async () => {
    segment = null;
    const user = userEvent.setup();
    shell();
    await user.type(screen.getByLabelText('Search county'), 'zzz');
    expect(screen.getByText('No county found')).toBeInTheDocument();
  });
  it('marks the open county and shows the list OR the detail on phones', () => {
    segment = 'S1B';
    const { rerender } = shell();
    expect(screen.getByRole('link', { name: /Alpha Two/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: 'County list' }).className).toContain('max-[719px]:hidden');
    expect(screen.getByTestId('detail').parentElement!.className).not.toContain('max-[719px]:hidden');
    segment = null;
    rerender(<CountiesShell counties={counties}><div data-testid="detail">detail</div></CountiesShell>);
    expect(screen.getByTestId('detail').parentElement!.className).toContain('max-[719px]:hidden');
  });
});

describe('CountyProfile', () => {
  const peers = counties.filter((c) => c.state_pcode === 'S1');
  it('shows the name, rank, risk and facts', () => {
    render(<CountyProfile detail={detail} peers={peers} total={79} />);
    expect(screen.getByRole('heading', { name: 'Alpha Two' })).toBeInTheDocument();
    expect(screen.getByText('Alpha · Rank 2 of 79')).toBeInTheDocument();
    expect(screen.getByText('85.0%')).toBeInTheDocument();
    expect(screen.getByText('420,000')).toBeInTheDocument();
    expect(screen.getByText('8,765 t')).toBeInTheDocument();
    expect(screen.getByText('−23,378 t')).toBeInTheDocument();
    expect(screen.getByText('Crisis')).toBeInTheDocument();
  });
  it('defaults the history readout to the latest point and describes the chart', () => {
    render(<CountyProfile detail={detail} peers={peers} total={79} />);
    expect(screen.getByText('Oct 2025')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Observed Phase 3 plus population share for Alpha Two, latest 60 percent/ })).toBeInTheDocument();
  });
  it('lists state peers, marks the current one, and links to Predict', () => {
    render(<CountyProfile detail={detail} peers={peers} total={79} />);
    expect(screen.getByRole('link', { name: /Alpha Two/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Alpha One/ })).toHaveAttribute('href', '/counties/S1A');
    expect(screen.getByRole('link', { name: 'Open in Predict' })).toHaveAttribute('href', '/predict?county=S1B');
  });
  it('copes with missing facts', () => {
    render(<CountyProfile detail={{ ...detail, facts: null }} peers={peers} total={79} />);
    expect(screen.getByText('No input data is available for this period.')).toBeInTheDocument();
  });
});
