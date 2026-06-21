export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-20 animate-pulse bg-slate-100" />
        ))}
      </div>
      <div className="card h-64 animate-pulse bg-slate-100" />
    </div>
  );
}
