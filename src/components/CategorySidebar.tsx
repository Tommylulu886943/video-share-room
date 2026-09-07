import Link from "next/link";

type CategoryNode = {
  id: string;
  name: string;
  children: { id: string; name: string }[];
};

type Props = {
  basePath: string;
  categories: CategoryNode[];
  counts: Record<string, number>;
  totalCount: number;
  selectedCatId: string;
  search: {
    q: string;
    tagIds: string[];
    sort: string;
    favOnly: boolean;
  };
};

export function CategorySidebar({
  basePath,
  categories,
  counts,
  totalCount,
  selectedCatId,
  search,
}: Props) {
  function href(categoryId: string) {
    const params = new URLSearchParams();
    if (search.q) params.set("q", search.q);
    params.set("cat", categoryId || "all");
    search.tagIds.forEach((id) => params.append("tag", id));
    if (search.sort !== "new") params.set("sort", search.sort);
    if (search.favOnly) params.set("fav", "1");
    return `${basePath}?${params.toString()}`;
  }

  const rowClass = (active: boolean) =>
    `flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
      active
        ? "bg-[var(--brand)] font-semibold text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  const list = (
    <nav aria-label="影片分類" className="space-y-1">
      <Link href={href("")} className={rowClass(!selectedCatId)}>
        <span>全部影片</span>
        <span className={selectedCatId ? "text-slate-400" : "text-white/80"}>
          {totalCount}
        </span>
      </Link>
      {categories.map((category) => {
        const categoryCount =
          (counts[category.id] ?? 0) +
          category.children.reduce((sum, child) => sum + (counts[child.id] ?? 0), 0);
        return (
          <div key={category.id} className="pt-1">
            <Link
              href={href(category.id)}
              className={rowClass(selectedCatId === category.id)}
            >
              <span>{category.name}</span>
              <span
                className={
                  selectedCatId === category.id ? "text-white/80" : "text-slate-400"
                }
              >
                {categoryCount}
              </span>
            </Link>
            {category.children.length > 0 && (
              <div className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-2">
                {category.children.map((child) => (
                  <Link
                    key={child.id}
                    href={href(child.id)}
                    className={rowClass(selectedCatId === child.id)}
                  >
                    <span>{child.name}</span>
                    <span
                      className={
                        selectedCatId === child.id
                          ? "text-white/80"
                          : "text-slate-400"
                      }
                    >
                      {counts[child.id] ?? 0}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="card sticky top-20 hidden self-start p-3 lg:block">
        <h2 className="mb-2 px-3 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
          影片分類
        </h2>
        {list}
      </aside>
      <details className="card group lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">
          <span>瀏覽分類</span>
          <span className="text-sm font-normal text-slate-500 group-open:hidden">
            展開 ▾
          </span>
          <span className="hidden text-sm font-normal text-slate-500 group-open:inline">
            收合 ▴
          </span>
        </summary>
        <div className="border-t border-slate-100 p-3">{list}</div>
      </details>
    </>
  );
}
