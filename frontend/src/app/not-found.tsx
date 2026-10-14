import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="grid min-h-[50dvh] place-items-center text-center">
      <div>
        <h1 tabIndex={-1} className="text-[clamp(2rem,4vw,3rem)] font-light tracking-[-0.04em] outline-none">Page not found</h1>
        <p className="mt-2 text-tx2">That page or county does not exist.</p>
        <ButtonLink href="/" variant="primary" className="mt-6">Back to overview</ButtonLink>
      </div>
    </div>
  );
}
