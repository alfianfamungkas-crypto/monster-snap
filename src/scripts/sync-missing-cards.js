require('dotenv').config()

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const pLimit = require('p-limit').default

// ========================
// 🔧 CONFIG
// ========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const limit = pLimit(5)

// ========================
// 🔥 FETCH MISSING CARD IDS
// ========================
async function getMissingCardIds() {
  const { data, error } = await supabase.rpc('get_missing_card_ids')

  if (error) {
    console.log("❌ RPC ERROR:", error)
    throw error
  }

  return data.map(d => d.card_id)
}

// ========================
// 🔥 FALLBACK (kalau belum ada RPC)
// ========================
async function getMissingManual() {
  const { data: prints } = await supabase
    .from('card_prints')
    .select('card_id')

  const { data: cards } = await supabase
    .from('cards')
    .select('card_id')

  const cardSet = new Set(cards.map(c => c.card_id))

  return [...new Set(
    prints
      .map(p => p.card_id)
      .filter(id => !cardSet.has(id))
  )]
}

// ========================
// 🔥 FETCH CARD FROM API
// ========================
async function fetchCard(cardId) {
  try {
    const res = await axios.get(`https://api.pokemontcg.io/v2/cards/${cardId}`)
    return res.data.data
  } catch (err) {
    console.log(`❌ API FAIL: ${cardId}`)
    return null
  }
}

// ========================
// 🔥 INSERT CARD
// ========================
async function insertCard(card) {
  const payload = {
    card_id: card.id,
    card_name: card.name,
    card_number: card.number,
    rarity: card.rarity || null,
    image_url: card.images?.small || null,
    set_id: card.set?.id || null
  }

  const { error } = await supabase
    .from('cards')
    .upsert(payload, { onConflict: 'card_id' })

  if (error) {
    console.log("❌ INSERT ERROR:", card.id, error.message)
    return false
  }

  return true
}

// ========================
// 🚀 MAIN
// ========================
async function run() {
  console.log("🚀 START SYNC MISSING CARDS")

  let missingIds = []

  try {
    missingIds = await getMissingCardIds()
  } catch {
    console.log("⚠️ RPC not found, fallback manual")
    missingIds = await getMissingManual()
  }

  console.log(`📦 TOTAL MISSING: ${missingIds.length}`)

  let success = 0
  let failed = 0

  const jobs = missingIds.map(id => limit(async () => {
    const card = await fetchCard(id)

    if (!card) {
      failed++
      return
    }

    const ok = await insertCard(card)

    if (ok) {
      success++
      console.log(`✅ ${id}`)
    } else {
      failed++
    }
  }))

  await Promise.all(jobs)

  console.log("\n🎉 DONE")
  console.log("✅ SUCCESS:", success)
  console.log("❌ FAILED:", failed)
}

run()