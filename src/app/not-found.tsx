/**
 * Global 404 page.
 */
import Link from "next/link";

export default function NotFound(): React.JSX.Element {
  return (
    <main className="min-h-screen">
      <section className="container-tight flex min-h-screen flex-col items-start justify-center py-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-700">404</p>
        <h1 className="text-4xl font-bold text-slate-900">Page not found.</h1>
        <p className="mt-4 max-w-lg text-slate-600">
          The page you were looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
