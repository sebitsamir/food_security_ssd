import { Panel } from '@/components/ui/Panel';

/** Desktop shows this beside the list; phones show only the list. */
export default function CountiesIndex() {
  return (
    <Panel className="grid min-h-[320px] place-items-center text-center text-tx2">
      <p>Select a county to see its modeled risk and history.</p>
    </Panel>
  );
}
