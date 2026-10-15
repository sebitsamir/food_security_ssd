'use client';

import { ActionMenu } from '@/components/ui/ActionMenu';
import { useToast } from '@/components/ui/Toast';
import { saveBlob } from '@/lib/export/download';

export type ExportAction = { kind: 'PDF' | 'CSV'; title: string; description: string; filename: string; build: () => Blob };

const DOWNLOAD_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </svg>
);

/** One Export button used everywhere: builds the file on demand, saves it, confirms with a toast. */
export function ExportMenu({ actions, disabled }: { actions: ExportAction[]; disabled?: boolean }) {
  const toast = useToast();
  return (
    <ActionMenu
      label="Export"
      icon={DOWNLOAD_ICON}
      disabled={disabled}
      items={actions.map((a) => ({
        id: a.kind,
        tag: a.kind,
        title: a.title,
        description: a.description,
        onSelect: () => {
          try {
            saveBlob(a.filename, a.build());
            toast(`Saved ${a.filename}`);
          } catch {
            toast('Export failed. Please try again.');
          }
        },
      }))}
    />
  );
}
