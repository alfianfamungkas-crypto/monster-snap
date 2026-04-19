import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const API_URL = "https://api.pokemontcg.io/v2/cards";
const PAGE_SIZE = 250;

// ==========================
// FETCH ALL CARDS
// ==========================
async function fetchAllCards() {
  let page = 1;
  let allCards = [];
  let hasMore = true;

  while (hasMore) {
    console.log(`📄 Fetch cards page ${page}`);

    const res = await fetch(`${API_URL}?page=${page}&pageSize=${PAGE_SIZE}`);
    const json = await res.json();

    const cards = json.data || [];
    allCards.push(...cards);

    if (cards.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      page++;
    }
  }

  console.log(`✅ Total cards fetched: ${allCards.length}`);
  return allCards;
}

// ==========================
// TRANSFORM MAIN CARD
// ==========================
function transformCard(card) {
  return {
    id: card.id,
    set_id: card.set?.id || null,
    name: card.name,
    supertype: card.supertype,
    hp: card.hp || null,
    evolves_from: card.evolvesFrom || null,
    rarity: card.rarity || null,
    artist: card.artist || null,
    flavor_text: card.flavorText || null,
    number: card.number,
    image_small: card.images?.small || null,
    image_large: card.images?.large || null,
    metadata: card
  };
}

// ==========================
// CHILD MAPPERS
// ==========================
function mapTypes(card) {
  return (card.types || []).map((t) => ({
    card_id: card.id,
    type: t
  }));
}

function mapAbilities(card) {
  return (card.abilities || []).map((a) => ({
    card_id: card.id,
    name: a.name,
    text: a.text,
    type: a.type
  }));
}

function mapAttacks(card) {
  return (card.attacks || []).map((a) => ({
    card_id: card.id,
    name: a.name,
    damage: a.damage || null,
    text: a.text,
    energy_cost: a.cost || [],
    converted_energy_cost: a.convertedEnergyCost || null
  }));
}

function mapWeaknesses(card) {
  return (card.weaknesses || []).map((w) => ({
    card_id: card.id,
    type: w.type,
    value: w.value
  }));
}

function mapRetreat(card) {
  return (card.retreatCost || []).map((c) => ({
    card_id: card.id,
    cost: c
  }));
}

function mapLegalities(card) {
  if (!card.legalities) return [];

  return Object.entries(card.legalities).map(([format, status]) => ({
    card_id: card.id,
    format,
    status
  }));
}

function mapPrices(card) {
  let prices = [];

  if (card.tcgplayer?.prices) {
    Object.entries(card.tcgplayer.prices).forEach(([variant, data]) => {
      prices.push({
        card_id: card.id,
        source: "tcgplayer",
        variant,
        low: data.low || null,
        mid: data.mid || null,
        high: data.high || null,
        market: data.market || null,
        direct_low: data.directLow || null,
        updated_at: card.tcgplayer.updatedAt
      });
    });
  }

  if (card.cardmarket?.prices) {
    prices.push({
      card_id: card.id,
      source: "cardmarket",
      variant: "default",
      low: card.cardmarket.prices.lowPrice || null,
      mid: card.cardmarket.prices.trendPrice || null,
      high: null,
      market: card.cardmarket.prices.averageSellPrice || null,
      direct_low: null,
      updated_at: card.cardmarket.updatedAt
    });
  }

  return prices;
}

// ==========================
// UPSERT BATCH
// ==========================
async function processBatch(cards) {
  const main = cards.map(transformCard);

  const { error } = await supabase
    .from("cards_new")
    .upsert(main, { onConflict: "id" });

  if (error) {
    console.error("❌ Cards insert error:", error);
    return;
  }

  let types = [];
  let abilities = [];
  let attacks = [];
  let weaknesses = [];
  let retreat = [];
  let legalities = [];
  let prices = [];

  cards.forEach((card) => {
    types.push(...mapTypes(card));
    abilities.push(...mapAbilities(card));
    attacks.push(...mapAttacks(card));
    weaknesses.push(...mapWeaknesses(card));
    retreat.push(...mapRetreat(card));
    legalities.push(...mapLegalities(card));
    prices.push(...mapPrices(card));
  });

  // Insert children (no conflict handling needed)
  if (types.length)
    await supabase.from("card_types_new").insert(types);

  if (abilities.length)
    await supabase.from("card_abilities_new").insert(abilities);

  if (attacks.length)
    await supabase.from("card_attacks_new").insert(attacks);

  if (weaknesses.length)
    await supabase.from("card_weaknesses_new").insert(weaknesses);

  if (retreat.length)
    await supabase.from("card_retreat_cost_new").insert(retreat);

  if (legalities.length)
    await supabase.from("card_legalities_new").insert(legalities);

  if (prices.length)
    await supabase.from("prices_new").insert(prices);
}

// ==========================
// RUN
// ==========================
async function run() {
  console.log("🚀 START IMPORT CARDS");

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`📄 Processing page ${page}`);

    const res = await fetch(`${API_URL}?page=${page}&pageSize=${PAGE_SIZE}`);
    const json = await res.json();

    const cards = json.data || [];

    if (cards.length === 0) break;

    await processBatch(cards);

    if (cards.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      page++;
    }
  }

  console.log("🎉 DONE IMPORT CARDS");
}

run();