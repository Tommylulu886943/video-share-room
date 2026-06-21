import { prisma } from "@/lib/db";

export interface FlatCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface CategoryNode extends FlatCategory {
  children: FlatCategory[];
}

export async function getFlatCategories(
  tenantId: string,
): Promise<FlatCategory[]> {
  return prisma.category.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, sortOrder: true },
  });
}

/** Build the two-level tree (top-level nodes each with their children). */
export function buildTree(flat: FlatCategory[]): CategoryNode[] {
  const tops = flat.filter((c) => !c.parentId);
  return tops.map((t) => ({
    ...t,
    children: flat.filter((c) => c.parentId === t.id),
  }));
}

/**
 * Category ids to match when filtering by `selectedId`.
 * A top-level selection includes its sub-categories; a sub-category is exact.
 */
export function categoryIdsForFilter(
  flat: FlatCategory[],
  selectedId: string,
): string[] {
  const node = flat.find((c) => c.id === selectedId);
  if (!node) return [selectedId];
  if (node.parentId) return [node.id];
  const children = flat.filter((c) => c.parentId === node.id).map((c) => c.id);
  return [node.id, ...children];
}

/** Human label for a category, e.g. "教學 / 基本動作". */
export function categoryLabel(
  flat: FlatCategory[],
  categoryId: string | null,
): string | null {
  if (!categoryId) return null;
  const node = flat.find((c) => c.id === categoryId);
  if (!node) return null;
  if (node.parentId) {
    const parent = flat.find((c) => c.id === node.parentId);
    return parent ? `${parent.name} / ${node.name}` : node.name;
  }
  return node.name;
}
