import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="display display-xl">Not found</p>
        <p className="mt-2 text-muted">That page doesn&apos;t exist.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-semibold text-on-accent">
          Go home
        </Link>
      </div>
    </div>
  );
}
