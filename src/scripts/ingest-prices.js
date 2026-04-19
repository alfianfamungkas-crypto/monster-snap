import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const PAGE_SIZE = 250;
const DELAY = 500;

// =========================
// LOGGER
// =========================
function log(...args) {
  console.log(new Date().toISOString(), "-", ...args);
}

// =========================
// UPSERT CARD
// =========================
async function upsertCard(card) {
  const { data: existing } = await supabase
    .from("cards")
    .select("id")
    .eq("external_id", card.id)
    .maybeSingle();

  if (existing) {
    log("⏩ Skip card:", card.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("cards")
    .insert({
      external_id: card.id,
      card_name: card.name,
      rarity: card.rarity || null,
      set_id: card.set?.id || null,
      image_url: card.images?.small || null,
      game: "pokemon",
      is_active: true
    })
    .select()
    .single();

  if (error) {
    log("❌ Card insert error:", card.id, error.message);
    return null;
  }

  log("✅ Card inserted:", card.id);
  return data.id;
}

// =========================
// UPSERT PRINT
// =========================
async function upsertPrint(card, cardId) {
  const { data: existing } = await supabase
    .from("card_prints")
    .select("id")
    .eq("external_id", card.id)
    .maybeSingle();

  if (existing) {
    log("⏩ Skip print:", card.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("card_prints")
    .insert({
      card_id: cardId,
      external_id: card.id,
      language: "EN",
      card_name: card.name,
      image_url: card.images?.small || null,
      set_id: card.set?.id || null,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    log("❌ Print insert error:", card.id, error.message);
    return null;
  }

  log("✅ Print inserted:", card.id);
  return data.id;
}

// =========================
// INSERT VARIANTS (SAFE)
// =========================
async function insertVariants(printId) {
  const variants = ["normal", "holo", "reverse_holo"];

  for (const variant of variants) {
    const { data: existing } = await supabase
      .from("card_variants")
      .select("id")
      .eq("print_id", printId)
      .eq("variant_type", variant)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase
      .from("card_variants")
      .insert({
        print_id: printId,
        variant_type: variant
      });

    if (error) {
      log("❌ Variant insert error:", variant, error.message);
    }
  }
}

// =========================
// MAIN RUNNER
// =========================
async function run() {
  log("🚀 START FULL INGEST");

  let page = 1;
  let hasMore = true;
  let totalProcessed = 0;

  while (hasMore) {
    log(`📄 Fetch page ${page}`);

    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=${PAGE_SIZE}`
    );

    const json = await res.json();
    const cards = json.data;

    if (!cards || cards.length === 0) {
      hasMore = false;
      break;
    }

    log(`📦 Processing ${cards.length} cards`);

    for (const card of cards) {
      try {
        const cardId = await upsertCard(card);
        if (!cardId) continue;

        const printId = await upsertPrint(card, cardId);
        if (!printId) continue;

        await insertVariants(printId);

        totalProcessed++;
      } catch (err) {
        log("🔥 Fatal card error:", card.id, err.message);
      }
    }

    log(`✅ Page ${page} done | Total: ${totalProcessed}`);

    page++;

    // ⛔ rate limit safety
    await new Promise((r) => setTimeout(r, DELAY));
  }

  log("🎉 INGEST COMPLETE | Total cards:", totalProcessed);
}

// =========================
// RUN
// =========================
run().catch((err) => {
  log("🔥 GLOBAL ERROR:", err);
});