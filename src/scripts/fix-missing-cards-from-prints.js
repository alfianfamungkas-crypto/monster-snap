require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// ========================
// 🚀 MAIN
// ========================
async function run() {
  console.log("🚀 FIX MISSING CARDS FROM PRINTS")

  // ambil missing card_id
  const { data: missing } = await supabase.rpc('get_missing_card_ids')

  if (!missing || missing.length === 0) {
    console.log("🎉 NO MISSING DATA")
    return
  }

  console.log("TOTAL MISSING:", missing.length)

  let success = 0

  for (const row of missing) {
    const cardId = row.card_id

    try {
      // ambil 1 print sebagai sumber data
      const { data: print } = await supabase
        .from('card_prints')
        .select('image_url')
        .eq('card_id', cardId)
        .limit(1)
        .single()

      // fallback data
      const payload = {
        card_id: cardId,
        card_name: cardId.toUpperCase(), // fallback
        card_number: null,
        rarity: null,
        image_url: print?.image_url || null,
        game: "pokemon"
      }

      const { error } = await supabase
        .from('cards')
        .insert(payload)

      if (error) throw error

      success++
      console.log("✅ FIXED:", cardId)

    } catch (err) {
      console.log("❌ FAIL:", cardId, err.message)
    }
  }

  console.log("\n🎉 DONE")
  console.log("SUCCESS:", success)
}

run()