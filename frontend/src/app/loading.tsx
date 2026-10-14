const shimmer = 'animate-[pulse-soft_1.4s_ease-in-out_infinite] bg-elev';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-8">
      <div className={`h-24 max-w-md rounded-2xl ${shimmer}`} />
      <div className="grid gap-5 min-[1000px]:grid-cols-[7fr_4fr]">
        <div className={`aspect-[800/585] rounded-[26px] ${shimmer}`} />
        <div className={`h-96 rounded-[22px] ${shimmer}`} />
      </div>
    </div>
  );
}
