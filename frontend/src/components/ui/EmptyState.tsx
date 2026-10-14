import type { ReactNode } from 'react';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-3 py-14 text-center text-tx2">
      <p className="mb-1.5 text-[17px] font-medium text-tx">{title}</p>
      {children && <p>{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
