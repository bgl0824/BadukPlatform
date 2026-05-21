import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

export const SUPABASE_CURRICULUM_CATEGORIES_TABLE = "curriculum_categories";

function rowToCategory(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    order: Number(row.sort_order ?? 0),
    levelGroup: row.level_group ?? "입문",
    status: row.status ?? "active",
  };
}

function categoryToRow(category) {
  return {
    id: category.id,
    name: category.name,
    level_group: category.levelGroup ?? "입문",
    sort_order: Number.isFinite(Number(category.order)) ? Number(category.order) : 0,
    status: category.status ?? "active",
    updated_at: new Date().toISOString(),
  };
}

export async function fetchCategoriesFromSupabase() {
  if (!isSupabaseConfigured()) {
    return { ok: false, source: "local", categories: [] };
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_CURRICULUM_CATEGORIES_TABLE)
    .select("*")
    .eq("status", "active")
    .order("level_group", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[Category] fetch.error", error.message);
    return { ok: false, categories: [], message: error.message };
  }

  return {
    ok: true,
    source: "supabase",
    categories: (data ?? []).map(rowToCategory).filter(Boolean),
  };
}

export async function persistCategoriesToSupabase(categories) {
  if (!isSupabaseConfigured() || !categories.length) {
    return { ok: true, source: "local" };
  }

  const client = getSupabaseClient();
  const rows = categories
    .filter((category) => category.status !== "deleted")
    .map(categoryToRow);

  const { error } = await client
    .from(SUPABASE_CURRICULUM_CATEGORIES_TABLE)
    .upsert(rows, { onConflict: "id" });

  console.info("[Category] persist", { count: rows.length, ok: !error, error: error?.message });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function markCategoryDeletedInSupabase(category) {
  if (!isSupabaseConfigured() || !category?.id) {
    return { ok: true, source: "local" };
  }

  const client = getSupabaseClient();
  const { error } = await client
    .from(SUPABASE_CURRICULUM_CATEGORIES_TABLE)
    .update({
      status: "deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", category.id);

  if (error) {
    console.warn("[Category] delete.remote.error", error.message);
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
