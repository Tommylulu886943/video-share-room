export default function BoardLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5">
      <div className="mb-4 h-8 w-40 animate-pulse rounded bg-slate-200" />
      <div className="card mb-5 h-20 animate-pulse bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="aspect-video animate-pulse bg-slate-200" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
