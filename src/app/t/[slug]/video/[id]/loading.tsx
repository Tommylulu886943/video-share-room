export default function VideoLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5">
      <div className="mb-3 h-4 w-24 animate-pulse rounded bg-slate-200" />
      <div className="aspect-video w-full animate-pulse rounded-xl bg-slate-300" />
      <div className="mt-4 space-y-3">
        <div className="h-6 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="flex gap-2">
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </main>
  );
}
