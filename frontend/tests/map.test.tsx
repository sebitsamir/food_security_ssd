import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SouthSudanMap } from '@/components/map/SouthSudanMap';
import { StateExplorer } from '@/components/map/StateExplorer';
import { buildMapModel, nextByDirection, rewindForD3, VIEW } from '@/lib/geo/projection';
import { counties, states, stateRisk } from './fixtures';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const setup = (props: Partial<React.ComponentProps<typeof SouthSudanMap>> = {}) => {
  const onSelect = vi.fn();
  render(<SouthSudanMap areas={states} values={stateRisk} onSelect={onSelect} {...props} />);
  return { onSelect };
};

describe('SouthSudanMap', () => {
  it('renders one accessible button per area with name, value and band', () => {
    setup();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Gamma, 92.0%, High modeled risk' })).toBeInTheDocument();
  });
  it('is a single tab stop (roving tabindex)', () => {
    setup();
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
  });
  it('selects on click, Enter and Space', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.click(screen.getByTestId('area-S2'));
    expect(onSelect).toHaveBeenLastCalledWith('S2');
    screen.getByTestId('area-S3').focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('S3');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(3);
  });
  it('moves focus with arrow keys', async () => {
    const user = userEvent.setup();
    setup();
    screen.getByTestId('area-S1').focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('area-S2')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('area-S1')).toHaveFocus();
  });
  it('marks the selected area with aria-pressed', () => {
    setup({ selected: 'S2' });
    expect(screen.getByTestId('area-S2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('area-S1')).toHaveAttribute('aria-pressed', 'false');
  });
  it('shows "no data" for missing and invalid values instead of a colour', () => {
    setup({ values: { S1: 0.5, S2: Number.NaN } });
    expect(screen.getByRole('button', { name: 'Beta, no data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gamma, no data' })).toBeInTheDocument();
  });
  it('offers a screen-reader table of every area', () => {
    setup();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('92.0%')).toBeInTheDocument();
  });
  it('hides labels in dense mode and lists every band in the legend', () => {
    setup({ labels: 'none' });
    expect(document.querySelectorAll('svg text')).toHaveLength(0);
    expect(within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('projection', () => {
  it('fits every shape inside the viewport, deterministically', () => {
    const m = buildMapModel(states);
    expect(m.shapes.map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
    m.shapes.forEach((s) => { expect(s.cx).toBeGreaterThan(0); expect(s.cx).toBeLessThan(VIEW.width); expect(s.cy).toBeLessThan(VIEW.height); });
    expect(buildMapModel(states)).toEqual(m);
  });
  it('renders identically whichever way the source is wound (d3 vs RFC 7946)', () => {
    const reversed = { ...states, features: states.features.map((f) => ({ ...f, geometry: { ...f.geometry, coordinates: (f.geometry as { coordinates: number[][][] }).coordinates.map((r) => [...r].reverse()) } })) } as typeof states;
    expect(buildMapModel(reversed)).toEqual(buildMapModel(states));
    buildMapModel(reversed).shapes.forEach((s) => expect(s.d.length).toBeLessThan(400)); // never a sphere-sized path
  });
  it('does not mutate its input', () => {
    const before = JSON.stringify(states);
    rewindForD3(states.features[0]!);
    expect(JSON.stringify(states)).toBe(before);
  });
  it('navigates by direction', () => {
    const { shapes } = buildMapModel(states);
    expect(nextByDirection(shapes, 'S1', 'right')).toBe('S2');
    expect(nextByDirection(shapes, 'S1', 'up')).toBe('S3');
    expect(nextByDirection(shapes, 'S1', 'left')).toBeNull();
    expect(nextByDirection(shapes, 'NOPE', 'left')).toBeNull();
  });
});

describe('StateExplorer', () => {
  it('starts on the highest-risk state and shows its top counties', () => {
    render(<StateExplorer layout="split" states={states} stateRisk={stateRisk} counties={counties} />);
    const card = screen.getByRole('complementary', { name: 'Gamma summary' });
    expect(within(card).getByText('92.0%')).toBeInTheDocument();
    expect(within(card).getByText('High')).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Gamma One95.0%', 'Gamma Two70.0%']);
  });
  it('updates the card when another state is chosen, and links to its forecasts', async () => {
    const user = userEvent.setup();
    render(<StateExplorer layout="split" states={states} stateRisk={stateRisk} counties={counties} />);
    await user.click(screen.getByTestId('area-S1'));
    const card = screen.getByRole('complementary', { name: 'Alpha summary' });
    expect(within(card).getByRole('link', { name: 'All 2 counties' })).toHaveAttribute('href', '/forecasts?state=S1');
    expect(within(card).getByRole('link', { name: 'Alpha Two' })).toHaveAttribute('href', '/counties/S1B');
  });
  it('renders the hero layout with its intro', () => {
    render(<StateExplorer layout="hero" states={states} stateRisk={stateRisk} counties={counties} intro={<h1>Hello</h1>} />);
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBe(3);
  });
});
