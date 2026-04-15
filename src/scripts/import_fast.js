const axios = require('axios')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

// ==========================
// CONFIG
// ==========================
const SUPABASE_URL = "https://mheqakdzirlrpslextab.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzExNjYzOCwiZXhwIjoyMDg4NjkyNjM4fQ.rNgYsO-TtUgnPFJbgZOKMc4yakDCBkGlFk2kZhy7nb0"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const API_URL = "https://api.pokemontcg.io/v2/cards?pageSize=50"
const CONCURRENCY = 5 // 🔥 paralel request
const DELAY = 200 // delay kecil biar aman

// ==========================
// PROGRESS SYSTEM
// ==========================
function getProgress() {
  if (!fs.existsSync('progress.json')) return { page: 1 }
  return JSON.parse(fs.readFileSync('progress.json'))
}

function saveProgress(page) {
  fs.writeFileSync('progress.json', JSON.stringify({ page }))
}

// ==========================
// FETCH WITH RETRY
// ==========================
async function fetchCards(page, retry = 3) {
  try {
    const res = await axios.get(`${API_URL}&page=${page}`, {
      timeout: 10000
    })
    return res.data.data
  } catch (err) {
    if (retry > 0) {
      console.log(`Retry page ${page}...`)
      await new Promise(r => setTimeout(r, 2000))
      return fetchCards(page, retry - 1)
    }
    throw err
  }
}

// ==========================
// TRANSFORM DATA
// ==========================
function transform(card) {
  const set_id = card.set?.id

  const base = {
    set: {
      id: set_id,
      set_name: card.set?.name,
      release_date: card.set?.releaseDate,
      language: "EN"
    },
    card: {
      card_id: card.id,
      card_name: card.name,
      card_number: card.number,
      set_id,
      rarity: card.rarity,
      image_url: card.images?.small
    },
    print: {
      card_id: card.id,
      language: "EN",
      card_name: card.name,
      image_url: card.images?.small,
      set_id
    },
    variants: []
  }

  const prices = card.tcgplayer?.prices || {}

  const variantMap = [
    { key: "normal", type: "normal" },
    { key: "holofoil", type: "holo" },
    { key: "reverseHolofoil", type: "reverse_holo" }
  ]

  for (const v of variantMap) {
    if (!prices[v.key]) continue

    const p = prices[v.key]

    const variant = {
      type: v.type,
      prices: []
    }

    if (p.market) {
      variant.prices.push({ grade: "RAW", price: p.market })
    }
    if (p.high) {
      variant.prices.push({ grade: "PSA10", price: p.high })
    }
    if (p.mid) {
      variant.prices.push({ grade: "PSA9", price: p.mid })
    }

    base.variants.push(variant)
  }

  return base
}

// ==========================
// INSERT BATCH
// ==========================
async function insertBatch(cards) {
  try {
    const transformed = cards.map(transform)

    // ================= SETS =================
    await supabase.from("sets").upsert(
      transformed.map(t => t.set),
      { onConflict: "id" }
    )

    // ================= CARDS =================
    await supabase.from("cards").upsert(
      transformed.map(t => t.card),
      { onConflict: "card_id" }
    )

    // ================= PRINTS =================
    const { data: prints } = await supabase
      .from("card_prints")
      .upsert(
        transformed.map(t => t.print),
        { onConflict: "card_id,language" }
      )
      .select()

    // mapping print_id
    const printMap = {}
    prints.forEach(p => {
      printMap[`${p.card_id}_EN`] = p.id
    })

    // ================= VARIANTS =================
    let variantRows = []

    transformed.forEach(t => {
      const print_id = printMap[`${t.print.card_id}_EN`]
      if (!print_id) return

      t.variants.forEach(v => {
        variantRows.push({
          print_id,
          variant_type: v.type
        })
      })
    })

    const { data: variants } = await supabase
      .from("card_variants")
      .upsert(variantRows, {
        onConflict: "print_id,variant_type"
      })
      .select()

    // mapping variant_id
    const variantMapDB = {}
    variants.forEach(v => {
      variantMapDB[`${v.print_id}_${v.variant_type}`] = v.id
    })

    // ================= PRICES =================
    let priceRows = []

    transformed.forEach(t => {
      const print_id = printMap[`${t.print.card_id}_EN`]

      t.variants.forEach(v => {
        const variant_id = variantMapDB[`${print_id}_${v.type}`]

        v.prices.forEach(p => {
          priceRows.push({
            variant_id,
            grade: p.grade,
            price: p.price
          })
        })
      })
    })

    if (priceRows.length > 0) {
      await supabase
        .from("card_prices")
        .upsert(priceRows, {
          onConflict: "variant_id,grade"
        })
    }

    console.log(`Inserted batch: ${cards.length}`)

  } catch (err) {
    console.log("BATCH ERROR:", err.message)
  }
}

// ==========================
// PARALLEL RUNNER
// ==========================
async function run() {
  let { page } = getProgress()

  while (true) {
    console.log("Processing page:", page)

    const pages = []

    for (let i = 0; i < CONCURRENCY; i++) {
      pages.push(page + i)
    }

    try {
      const results = await Promise.all(
        pages.map(p => fetchCards(p))
      )

      const allCards = results.flat()

      if (!allCards.length) break

      await insertBatch(allCards)

      page += CONCURRENCY
      saveProgress(page)

      await new Promise(r => setTimeout(r, DELAY))

    } catch (err) {
      console.log("ERROR:", err.message)
      console.log("Retrying...")

      await new Promise(r => setTimeout(r, 5000))
    }
  }

  console.log("DONE IMPORT 🚀")
}

run()