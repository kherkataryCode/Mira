import { Art, LogoMark } from '@/components/Art';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <Art seed={3} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-cream">
          <p className="display display-xl">Plan. Learn.<br />Stay informed.</p>
          <p className="mt-3 max-w-md text-sm text-cream/85">A calm personal assistant for your tasks, reminders, daily brief, news and bite-sized learning.</p>
        </div>
      </div>
      <div className="safe-x flex flex-col justify-center py-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <LogoMark size={36} />
            <span className="display text-4xl">Friday</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
