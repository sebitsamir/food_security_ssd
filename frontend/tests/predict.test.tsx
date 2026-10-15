import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PredictWorkspace } from '@/components/predict/PredictWorkspace';
import { ToastProvider } from '@/components/ui/Toast';
import { counties, json, prediction, readBlob } from './fixtures';

const saved: { name: string; blob: Blob }[] = [];
vi.mock('@/lib/export/download', async (orig) => ({ ...(await orig<typeof import('@/lib/export/download')>()), saveBlob: (name: string, blob: Blob) => saved.push({ name, blob }) }));

const fetchMock = vi.fn();
const renderIt = (initialCounty?: string) =>
  render(<ToastProvider><PredictWorkspace counties={counties} period="2026-04" initialCounty={initialCounty} /></ToastProvider>);

beforeEach(() => { saved.length = 0; fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

const run = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Run prediction' }));

describe('PredictWorkspace', () => {
  it('prefills from the selected county and shows the empty result state', () => {
    renderIt();
    expect(screen.getByLabelText('Population')).toHaveValue('420,000');
    expect(screen.getByLabelText('Start year')).toHaveValue('2026');
    expect(screen.getByLabelText('Cereal gap (t)')).toHaveValue('-23,378');
    expect(screen.getByText('Run a prediction to see the result.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '3, Crisis' })).toBeChecked();
  });

  it('honours ?county= and changing state resets to that state\'s first county', async () => {
    const user = userEvent.setup();
    renderIt('S2B');
    expect(screen.getByLabelText('County')).toHaveValue('S2B');
    await user.selectOptions(screen.getByLabelText('State'), 'S3');
    expect(screen.getByLabelText('County')).toHaveValue('S3A');
  });

  it('validates before calling the API and focuses the first problem', async () => {
    const user = userEvent.setup();
    renderIt();
    await user.clear(screen.getByLabelText('Population'));
    await user.type(screen.getByLabelText('Population'), '0');
    await run(user);
    expect(screen.getByRole('alert')).toHaveTextContent('between 1 and 50,000,000');
    expect(screen.getByLabelText('Population')).toHaveFocus();
    expect(screen.getByLabelText('Population')).toBeInvalid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the parsed payload to the same-origin proxy and shows the result', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(prediction()));
    renderIt();
    await run(user);
    await screen.findByText('Alpha One, Alpha');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/predict');
    expect(JSON.parse(init.body)).toEqual({ county_pcode: 'S1A', start_year: 2026, start_month: 4, population: 420000, previous_ipc_phase: 3, phase3plus_pct: 60, cereal_production_t: 8765, cereal_gap_t: -23378 });
    expect(screen.getByRole('img', { name: 'Risk probability 87.4%' })).toBeInTheDocument();
    expect(screen.getAllByText('87.4%').length).toBeGreaterThan(0);
    expect(screen.getByText('88.9%')).toBeInTheDocument();
    expect(screen.getByText('Spread 1.5 percentage points')).toBeInTheDocument();
    expect(screen.getByText('A model probability, not an official IPC classification.')).toBeInTheDocument();
  });

  it('shows model warnings', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(prediction({ warnings: [{ code: 'OUT_OF_RANGE_POPULATION', severity: 'warning', message: 'Population is outside the observed training range.' }] })));
    renderIt();
    await run(user);
    expect(await screen.findByText('Population is outside the observed training range.')).toBeInTheDocument();
  });

  it.each([
    [new Response('{}', { status: 429, headers: { 'retry-after': '12' } }), /Too many requests.*12 seconds/],
    [new Response('{}', { status: 503 }), /not available right now/],
    [new Response('{}', { status: 422 }), /could not be completed/],
    [json({ nonsense: true }), /unexpected response/],
  ])('reports failures clearly (%#)', async (response, message) => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response);
    renderIt();
    await run(user);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run prediction' })).toBeEnabled();
  });

  it('survives a network failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    renderIt();
    await run(user);
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });

  it('keeps a session history, exports it, and can clear it', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(json(prediction())).mockResolvedValueOnce(json(prediction({ prediction_id: '99999999-2222-4333-8444-555555555555', risk_probability: 0.3, risk_band: 'moderate' })));
    renderIt();
    await run(user); await screen.findByText('Alpha One, Alpha');
    await run(user); await waitFor(() => expect(screen.getAllByText('30.0%').length).toBeGreaterThan(0));

    const history = screen.getByRole('region', { name: 'Runs this session' });
    expect(within(history).getAllByRole('row')).toHaveLength(3); // header + 2 runs
    await user.click(within(history).getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /CSV data/ }));
    const csv = await readBlob(saved.at(-1)!.blob);
    expect(saved.at(-1)!.name).toMatch(/^prediction-runs-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.trim().split('\r\n')).toHaveLength(3);

    await user.click(within(history).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('region', { name: 'Runs this session' })).not.toBeInTheDocument();
  });

  it('exports a single prediction as PDF and CSV', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(prediction()));
    renderIt();
    await run(user); await screen.findByText('Alpha One, Alpha');
    const panel = screen.getByRole('region', { name: 'Prediction result' });
    await user.click(within(panel).getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /PDF report/ }));
    expect(saved.at(-1)!.name).toMatch(/^prediction-alpha-one-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(saved.at(-1)!.blob.type).toBe('application/pdf');
    expect(await readBlob(saved.at(-1)!.blob)).toContain('87.4%');
    await user.click(within(panel).getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /CSV data/ }));
    expect(await readBlob(saved.at(-1)!.blob)).toContain('11111111-2222-4333-8444-555555555555');
  });
});
