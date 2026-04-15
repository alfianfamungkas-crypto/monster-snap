const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
"https://mheqakdzirlrpslextab.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzExNjYzOCwiZXhwIjoyMDg4NjkyNjM4fQ.rNgYsO-TtUgnPFJbgZOKMc4yakDCBkGlFk2kZhy7nb0"
)

const API_URL = "https://api.pokemontcg.io/v2/cards?pageSize=50"

async function fetchCards(page = 1) {
  const res = await axios.get(`${API_URL}&page=${page}`)
  return res.data.data
}

async function insertCard(card) {
  try {

    // =========================
    // 1. UPSERT SET (WAJIB)
    // =========================
    const set_id = card.set?.id

    await supabase
      .from("sets")
      .upsert([{
        id: set_id,
        set_name: card.set?.name,
        release_date: card.set?.releaseDate,
        language: "EN"
      }], { onConflict: "id" })


    // =========================
    // 2. UPSERT CARD (MASTER)
    // =========================
    await supabase
      .from("cards")
      .upsert([{
        card_id: card.id,
        card_name: card.name,
        card_number: card.number,
        set_id: set_id,
        rarity: card.rarity,
        image_url: card.images?.small
      }], { onConflict: "card_id" })


    // =========================
    // 3. GET CARD ID (ENSURE EXIST)
    // =========================
    const { data: existingCard } = await supabase
      .from("cards")
      .select("card_id")
      .eq("card_id", card.id)
      .single()


    // =========================
    // 4. UPSERT PRINT
    // =========================
    const { data: print } = await supabase
      .from("card_prints")
      .upsert([{
        card_id: existingCard.card_id,
        language: "EN",
        card_name: card.name,
        image_url: card.images?.small,
        set_id: set_id
      }], {
        onConflict: "card_id,language"
      })
      .select()
      .single()


    // =========================
    // 5. VARIANTS
    // =========================
    const prices = card.tcgplayer?.prices || {}

    const variantMap = [
      { key: "normal", type: "normal" },
      { key: "holofoil", type: "holo" },
      { key: "reverseHolofoil", type: "reverse_holo" }
    ]

    for (const v of variantMap) {
      if (!prices[v.key]) continue

      const { data: variant } = await supabase
        .from("card_variants")
        .upsert([{
          print_id: print.id,
          variant_type: v.type
        }], {
          onConflict: "print_id,variant_type"
        })
        .select()
        .single()


      // =========================
      // 6. PRICES
      // =========================
      const p = prices[v.key]

      const priceRows = []

      if (p.market) {
        priceRows.push({
          variant_id: variant.id,
          grade: "RAW",
          price: p.market
        })
      }

      if (p.high) {
        priceRows.push({
          variant_id: variant.id,
          grade: "PSA10",
          price: p.high
        })
      }

      if (p.mid) {
        priceRows.push({
          variant_id: variant.id,
          grade: "PSA9",
          price: p.mid
        })
      }

      if (priceRows.length > 0) {
        await supabase
          .from("card_prices")
          .upsert(priceRows, {
            onConflict: "variant_id,grade"
          })
      }
    }

    console.log("SUCCESS:", card.name)

  } catch (err) {
    console.log("ERROR:", err.message)
    console.log("Processing:", card.name)
  }
  
}

async function run() {
  let page = 1

  while (true) {
    console.log("Fetching page:", page)

    const cards = await fetchCards(page)

    if (!cards || cards.length === 0) break

    for (const card of cards) {
      await insertCard(card)
    }

    page++

    // biar gak kena rate limit
    await new Promise(r => setTimeout(r, 200))
  }

  console.log("DONE")
}

run()