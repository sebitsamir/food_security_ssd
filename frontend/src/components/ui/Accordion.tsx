import type { ReactNode } from 'react';

export type AccordionItem = { title: string; body: ReactNode };

/** Native <details>: keyboard accessible, no JavaScript, works with print and find-in-page. */
export function Accordion({ items, openFirst = true }: { items: AccordionItem[]; openFirst?: boolean }) {
  return (
    <div className="border-t border-line">
      {items.map((item, i) => (
        <details key={item.title} open={openFirst && i === 0} className="group border-b border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-medium tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-info [&::-webkit-details-marker]:hidden">
            {item.title}
            <span aria-hidden="true" className="text-2xl font-light text-tx3 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="max-w-[64ch] pb-[22px] text-tx2">{item.body}</div>
        </details>
      ))}
    </div>
  );
}
