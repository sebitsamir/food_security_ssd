import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForecastsView } from '@/components/forecasts/ForecastsView';
import { ToastProvider } from '@/components/ui/Toast';
import { county, counties, readBlob, states, stateRisk } from './fixtures';

let params = new URLSearchParams();
const replace = vi.fn((url: string) => { params = new URLSearchParams(url.split('?')[1] ?? ''); });
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/forecasts',
  useSearchParams: () => params,
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const saved: { name: string; blob: Blob }[] = [];
vi.mock('@/lib/export/download', async (orig) => ({ ...(await orig<typeof import('@/lib/export/download')>()), saveBlob: (name: string, blob: Blob) => saved.push({ name, blob }) }));

const many = Array.from({ length: 25 }, (_, i) => county(`X${i}`, `County ${String(i).padStart(2, '0')}`, 'S1', 0.99 - i * 0.03, i + 1));

const view = (rows = counties) =>
  render(<ToastProvider><ForecastsView rows={rows} period="2026-04" periods={['2026-04', '2025-10']} modelVersion="1.0.0" states={states} stateRisk={stateRisk} /></ToastProvider>);
const names = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent);

beforeEach(() => { params = new URLSearchParams(); replace.mockClear(); saved.length = 0; });

describe('ForecastsView', () => {
  it('lists counties by highest risk first, with the count', () => {
    view();
    expect(names()).toEqual(['Gamma OneGamma', 'Alpha TwoAlpha', 'Gamma TwoGamma', 'Beta OneBeta', 'Beta TwoBeta', 'Alpha OneAlpha']);
    expect(screen.getByText('6 counties')).toBeInTheDocument();
  });

  it('reads filters from the URL (shareable links)', () => {
    params = new URLSearchParams('band=high&state=S3');
    view();
    expect(names()).toEqual(['Gamma OneGamma']);
    expect(screen.getByRole('button', { name: /High/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('State')).toHaveValue('S3');
    expect(screen.getByText('1 county')).toBeInTheDocument();
  });

  it('writes filter changes to the URL, keeping the others', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: /Lower/ }));
    expect(replace).toHaveBeenLastCalledWith('/forecasts?band=lower', { scroll: false });
  });

  it('keeps existing filters and drops the page when one changes', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams('band=lower&page=4');
    view();
    await user.selectOptions(screen.getByLabelText('State'), 'S2');
    expect(replace).toHaveBeenLastCalledWith('/forecasts?state=S2&band=lower', { scroll: false });
  });

  it('debounces search into the URL', async () => {
    const user = userEvent.setup();
    view();
    await user.type(screen.getByLabelText('Search county'), 'gam');
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(replace).toHaveBeenLastCalledWith('/forecasts?q=gam', { scroll: false });
  });

  it('never lets a quick chip click and a search overwrite each other (stale-filter race)', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: /Lower/ }));
    await user.type(screen.getByLabelText('Search county'), 'gam');
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2), { timeout: 1000 });
    expect(replace).toHaveBeenLastCalledWith('/forecasts?q=gam&band=lower', { scroll: false });
  });

  it('sorts by clicking headers and exposes aria-sort', async () => {
    const user = userEvent.setup();
    const { unmount } = view();
    expect(screen.getByRole('columnheader', { name: /Probability/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: /^County/ }));
    expect(replace).toHaveBeenLastCalledWith('/forecasts?sort=county', { scroll: false });
    unmount();
    params = new URLSearchParams(); // fresh page load
    view();
    await user.click(screen.getByRole('button', { name: /Probability/ })); // already active: toggles direction
    expect(replace).toHaveBeenLastCalledWith('/forecasts?dir=asc', { scroll: false });
  });

  it('paginates ten at a time', async () => {
    const user = userEvent.setup();
    const { unmount } = view(many);
    expect(names()).toHaveLength(10);
    expect(screen.getByText('1–10 of 25')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(replace).toHaveBeenLastCalledWith('/forecasts?page=2', { scroll: false });
    unmount();
    params = new URLSearchParams('page=3');
    view(many);
    expect(names()).toHaveLength(5);
    expect(screen.getByText('21–25 of 25')).toBeInTheDocument();
  });

  it('shows an empty state with a way out', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams('q=zzz');
    view();
    expect(screen.getByText('No counties match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenLastCalledWith('/forecasts', { scroll: false });
  });

  it('exports exactly the filtered rows as CSV, with a descriptive filename', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams('state=S1');
    view();
    await user.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByRole('menuitem', { name: /CSV data/ })).toHaveTextContent('2 counties');
    await user.click(screen.getByRole('menuitem', { name: /CSV data/ }));
    expect(saved[0]!.name).toMatch(/^forecasts-alpha-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = (await readBlob(saved[0]!.blob)).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines.slice(1).every((l) => l.includes(',Alpha,S1,'))).toBe(true);
  });

  it('exports a PDF report that states the filters', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams('band=high');
    view();
    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /PDF report/ }));
    const pdf = await readBlob(saved[0]!.blob);
    expect(saved[0]!.name).toMatch(/\.pdf$/);
    expect(pdf).toContain('Filters: High band.');
    expect(pdf).toContain('Gamma One');
    expect(pdf).not.toContain('Beta Two');
  });

  it('switches to the map view through the URL', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(replace).toHaveBeenLastCalledWith('/forecasts?view=map', { scroll: false });
  });

  it('renders the map and state card in map view', () => {
    params = new URLSearchParams('view=map');
    view();
    expect(screen.queryByRole('table', { name: /County forecasts/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('area-S3')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Gamma summary' })).toBeInTheDocument();
  });
});
