import Link from "next/link";
import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand)] text-lg">
            🎬
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Film Room 影片室
          </span>
        </Link>
        <div className="card p-6">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          )}
          <div className="mt-5">{children}</div>
        </div>
        {footer && (
          <div className="mt-4 text-center text-sm text-slate-500">{footer}</div>
        )}
      </div>
    </main>
  );
}
