import { PHASES } from '@/lib/phases';

/** Five numbered circles. Colour is paired with the number and the selected name, never alone. */
export function PhasePicker({ value, onChange, labelledBy }: { value: number; onChange: (n: number) => void; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-1.5 min-[420px]:gap-2">
      {PHASES.map((p) => {
        const checked = p.n === value;
        return (
          <label
            key={p.n}
            title={p.label}
            style={{ borderColor: p.color, background: checked ? p.color : undefined }}
            className="relative grid aspect-square min-w-11 max-w-[60px] flex-1 cursor-pointer place-items-center rounded-full border-2 text-base font-semibold transition-transform hover:scale-105 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-info"
          >
            <input type="radio" name="phase" value={p.n} checked={checked} onChange={() => onChange(p.n)} aria-label={`${p.n}, ${p.label}`} className="absolute inset-0 cursor-pointer opacity-0" />
            <span className={checked ? 'text-white' : 'text-tx'}>{p.n}</span>
          </label>
        );
      })}
    </div>
  );
}
