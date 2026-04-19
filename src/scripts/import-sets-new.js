import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

import dotenv from 'dotenv'
dotenv.config()
// ==========================
// 🔑 INIT SUPABASE
// ==========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// ==========================
// ⚙️ CONFIG
// ==========================
const API_URL = "https://api.pokemontcg.io/v2/sets";
const PAGE_SIZE = 250;

// ==========================
// 🔄 FETCH ALL SETS
// ==========================
async function fetchAllSets() {
  let page = 1;
  let allSets = [];
  let hasMore = true;

  while (hasMore) {
    console.log(`📄 Fetch sets page ${page}`);

    const res = await fetch(`${API_URL}?page=${page}&pageSize=${PAGE_SIZE}`);
    const json = await res.json();

    const sets = json.data || [];
    allSets.push(...sets);

    if (sets.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      page++;
    }
  }

  console.log(`✅ Total sets fetched: ${allSets.length}`);
  return allSets;
}

// ==========================
// 🔄 TRANSFORM DATA
// ==========================
function transformSet(set) {
  return {
    id: set.id,
    game_id: "pokemon",
    name: set.name,
    series: set.series,
    printed_total: set.printedTotal || null,
    total: set.total || null,
    ptcgo_code: set.ptcgoCode || null,
    release_date: set.releaseDate
      ? new Date(set.releaseDate)
      : null,
    updated_at: set.updatedAt
      ? new Date(set.updatedAt)
      : null,
    symbol_url: set.images?.symbol || null,
    logo_url: set.images?.logo || null,
    metadata: set // simpan full JSON kalau butuh
  };
}

// ==========================
// 💾 UPSERT TO DB
// ==========================
async function upsertSets(sets) {
  const batchSize = 100;

  for (let i = 0; i < sets.length; i += batchSize) {
    const batch = sets.slice(i, i + batchSize).map(transformSet);

    const { error } = await supabase
      .from("sets_new")
      .upsert(batch, {
        onConflict: "id"
      });

    if (error) {
      console.error("❌ Insert error:", error);
    } else {
      console.log(
        `✅ Inserted batch ${i} - ${i + batch.length}`
      );
    }
  }
}

// ==========================
// 🚀 RUN
// ==========================
async function run() {
  console.log("🚀 START IMPORT SETS");

  const sets = await fetchAllSets();

  await upsertSets(sets);

  console.log("🎉 DONE IMPORT SETS");
}

run();