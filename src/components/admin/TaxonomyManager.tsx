"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client";

type Child = { id: string; name: string };
type TopCategory = { id: string; name: string; children: Child[] };

export function TaxonomyManager({
  slug,
  tree,
  tags,
}: {
  slug: string;
  tree: TopCategory[];
  tags: { id: string; name: string }[];
}) {
  const router = useRouter();

  const [newTop, setNewTop] = useState("");
  const [newTag, setNewTag] = useState("");
  const [childInputs, setChildInputs] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function setChildInput(topId: string, value: string) {
    setChildInputs((prev) => ({ ...prev, [topId]: value }));
  }

  function setEditValue(id: string, value: string) {
    setEditing((prev) => ({ ...prev, [id]: value }));
  }

  function startEdit(id: string, current: string) {
    setEditing((prev) => ({ ...prev, [id]: current }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function addTop() {
    const name = newTop.trim();
    if (!name) return;
    setError(null);
    try {
      await apiPost("/api/t/" + slug + "/categories", { name });
      setNewTop("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addChild(topId: string) {
    const name = (childInputs[topId] ?? "").trim();
    if (!name) return;
    setError(null);
    try {
      await apiPost("/api/t/" + slug + "/categories", { name, parentId: topId });
      setChildInput(topId, "");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function renameCategory(id: string) {
    const name = (editing[id] ?? "").trim();
    if (!name) return;
    setError(null);
    try {
      await apiPatch("/api/t/" + slug + "/categories/" + id, { name });
      cancelEdit(id);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteCategory(id: string, isTop: boolean) {
    const message = isTop
      ? "確定要刪除此大分類嗎？其下的子分類也會一併刪除。"
      : "確定要刪除此子分類嗎？";
    if (!confirm(message)) return;
    setError(null);
    try {
      await apiDelete("/api/t/" + slug + "/categories/" + id);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    setError(null);
    try {
      await apiPost("/api/t/" + slug + "/tags", { name });
      setNewTag("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteTag(id: string) {
    if (!confirm("確定要刪除此標籤嗎？")) return;
    setError(null);
    try {
      await apiDelete("/api/t/" + slug + "/tags/" + id);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="card p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">分類管理</h2>
        <p className="mt-1 text-sm text-slate-500">
          分類為兩層結構：大分類底下可新增子分類。
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            placeholder="新增大分類名稱"
            value={newTop}
            onChange={(e) => setNewTop(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTop();
              }
            }}
          />
          <button type="button" className="btn-brand" onClick={addTop}>
            新增大分類
          </button>
        </div>

        <ul className="mt-5 space-y-4">
          {tree.length === 0 ? (
            <li className="text-sm text-slate-500">目前尚無分類。</li>
          ) : null}
          {tree.map((top) => {
            const topEditing = editing[top.id] !== undefined;
            return (
              <li key={top.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {topEditing ? (
                    <input
                      className="input flex-1"
                      value={editing[top.id]}
                      onChange={(e) => setEditValue(top.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          renameCategory(top.id);
                        }
                      }}
                    />
                  ) : (
                    <span className="flex-1 font-medium text-slate-900">
                      {top.name}
                    </span>
                  )}
                  <div className="flex gap-2">
                    {topEditing ? (
                      <>
                        <button
                          type="button"
                          className="btn-brand"
                          onClick={() => renameCategory(top.id)}
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => cancelEdit(top.id)}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => startEdit(top.id, top.name)}
                        >
                          重新命名
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => deleteCategory(top.id, true)}
                        >
                          刪除
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <ul className="mt-3 space-y-2 border-l border-slate-200 pl-4">
                  {top.children.map((child) => {
                    const childEditing = editing[child.id] !== undefined;
                    return (
                      <li
                        key={child.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        {childEditing ? (
                          <input
                            className="input flex-1"
                            value={editing[child.id]}
                            onChange={(e) => setEditValue(child.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                renameCategory(child.id);
                              }
                            }}
                          />
                        ) : (
                          <span className="flex-1 text-sm text-slate-700">
                            {child.name}
                          </span>
                        )}
                        <div className="flex gap-2">
                          {childEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn-brand"
                                onClick={() => renameCategory(child.id)}
                              >
                                儲存
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={() => cancelEdit(child.id)}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => startEdit(child.id, child.name)}
                              >
                                重新命名
                              </button>
                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() => deleteCategory(child.id, false)}
                              >
                                刪除
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}

                  <li className="flex flex-col gap-2 pt-1 sm:flex-row">
                    <input
                      className="input flex-1"
                      placeholder="新增子分類名稱"
                      value={childInputs[top.id] ?? ""}
                      onChange={(e) => setChildInput(top.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addChild(top.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => addChild(top.id)}
                    >
                      新增子分類
                    </button>
                  </li>
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">標籤管理</h2>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            placeholder="新增標籤名稱"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <button type="button" className="btn-brand" onClick={addTag}>
            新增標籤
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <span className="text-sm text-slate-500">目前尚無標籤。</span>
          ) : null}
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="chip bg-slate-100 text-slate-600 inline-flex items-center gap-1"
            >
              {tag.name}
              <button
                type="button"
                className="text-slate-400 hover:text-red-600"
                aria-label={"刪除標籤 " + tag.name}
                onClick={() => deleteTag(tag.id)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
