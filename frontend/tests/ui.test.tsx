import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Segmented } from '@/components/ui/Segmented';
import { Pager } from '@/components/ui/Pager';
import { Accordion } from '@/components/ui/Accordion';
import { StatStrip } from '@/components/ui/StatStrip';
import { Field, Input } from '@/components/ui/Field';
import { ToastProvider, useToast } from '@/components/ui/Toast';

const items = (a = vi.fn(), b = vi.fn()) => [
  { id: 'pdf', tag: 'PDF', title: 'PDF report', description: 'd', onSelect: a },
  { id: 'csv', tag: 'CSV', title: 'CSV data', description: 'd', onSelect: b },
];

describe('ActionMenu', () => {
  it('opens, focuses the first item, and exposes menu semantics', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="Export" items={items()} />);
    const btn = screen.getByRole('button', { name: /Export/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /PDF report/ })).toHaveFocus();
  });
  it('navigates with arrows (wrapping) and closes on Escape returning focus', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="Export" items={items()} />);
    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /CSV data/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /PDF report/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: /CSV data/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/ })).toHaveFocus();
  });
  it('runs the selected action and closes; closes on outside click', async () => {
    const user = userEvent.setup();
    const pdf = vi.fn(), csv = vi.fn();
    render(<div><ActionMenu label="Export" items={items(pdf, csv)} /><p>outside</p></div>);
    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /CSV data/ }));
    expect(csv).toHaveBeenCalledTimes(1);
    expect(pdf).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
  it('cannot be opened when disabled', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="Export" items={items()} disabled />);
    await user.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('small components', () => {
  it('Segmented marks the active option and reports changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Segmented label="View" value="table" onChange={onChange} options={[{ value: 'table', label: 'Table' }, { value: 'map', label: 'Map' }]} />);
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(onChange).toHaveBeenCalledWith('map');
  });
  it('Pager shows the range and disables at the ends', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Pager page={1} pageSize={10} total={25} onChange={onChange} />);
    expect(screen.getByText('1–10 of 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<Pager page={3} pageSize={10} total={25} onChange={onChange} />);
    expect(screen.getByText('21–25 of 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    rerender(<Pager page={1} pageSize={10} total={0} onChange={onChange} />);
    expect(screen.getByText('0–0 of 0')).toBeInTheDocument();
  });
  it('Accordion opens only the first item by default', () => {
    const { container } = render(<Accordion items={[{ title: 'A', body: 'a' }, { title: 'B', body: 'b' }]} />);
    const d = container.querySelectorAll('details');
    expect(d[0]).toHaveAttribute('open');
    expect(d[1]).not.toHaveAttribute('open');
  });
  it('StatStrip lists every figure', () => {
    render(<StatStrip label="Summary" items={[{ label: 'A', value: '1' }, { label: 'B', value: '2' }]} />);
    expect(screen.getAllByRole('term')).toHaveLength(2);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
  it('Field links its error to the input', () => {
    render(<Field label="Population" htmlFor="p" error="Too small"><Input id="p" aria-invalid aria-describedby="p-error" /></Field>);
    expect(screen.getByLabelText('Population')).toHaveAccessibleDescription('Too small');
    expect(screen.getByRole('alert')).toHaveTextContent('Too small');
  });
  it('Toast announces messages politely', async () => {
    const user = userEvent.setup();
    const Trigger = () => { const t = useToast(); return <button onClick={() => t('Saved file.pdf')}>go</button>; };
    render(<ToastProvider><Trigger /></ToastProvider>);
    await user.click(screen.getByText('go'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved file.pdf');
  });
});
