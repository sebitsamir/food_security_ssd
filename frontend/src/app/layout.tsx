import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { TopBar } from '@/components/layout/TopBar';
import { Footer } from '@/components/layout/Footer';
import { RouteFocus } from '@/components/layout/RouteFocus';
import { ToastProvider } from '@/components/ui/Toast';
import { getGeoMeta, getModel } from '@/lib/api';

export const metadata: Metadata = {
  title: { default: 'South Sudan Food Security Intelligence', template: '%s | Food Security Intelligence' },
  description: 'County-level modeled risk of Crisis-or-worse food insecurity in South Sudan.',
};

// The shell shows live metadata (attribution, development-data notice), so never bake it at build time.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = { themeColor: '#08111A', viewportFit: 'cover', width: 'device-width', initialScale: 1 };

// Runs before first paint so the page never flashes the wrong theme.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#F2F4F6':'#08111A')}catch(e){document.documentElement.dataset.theme='dark'}})()`;

// The shell must render even when the data service is down, so these never throw.
const safe = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [meta, model] = await Promise.all([safe(getGeoMeta()), safe(getModel())]);
  const notice = meta?.synthetic
    ? 'Development data: placeholder boundaries. Not for real decisions.'
    : model?.synthetic
      ? 'Development data: synthetic model scores. Boundaries are real; not for real decisions.'
      : null;

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${GeistSans.className} min-h-dvh text-[15px] leading-[1.55]`}>
        <ToastProvider>
          <a href="#main" className="absolute -top-16 left-3 z-[100] rounded-lg bg-btn px-3.5 py-2.5 text-btn-tx focus:top-3">Skip to content</a>
          <TopBar />
          {notice && (
            <p role="note" className="border-b border-line bg-surface px-5 py-2 text-center text-[12.5px] text-tx2">
              {notice}
            </p>
          )}
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1360px] px-[max(1.25rem,env(safe-area-inset-left))] pb-10 pt-7 outline-none lg:px-8 lg:pb-12 lg:pt-11">
            {children}
          </main>
          <Footer meta={meta} />
          <RouteFocus />
        </ToastProvider>
      </body>
    </html>
  );
}
