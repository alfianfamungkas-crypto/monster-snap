require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");
const sharp = require("sharp");
const imghash = require("imghash");
const pLimit = require("p-limit").default;

// ========================
// CONFIG
// ========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const BATCH_SIZE = 50;
const CONCURRENCY = 5;
const RETRY_LIMIT = 3;

const limit = pLimit(CONCURRENCY);

// ========================
// HELPER: DOWNLOAD IMAGE
// ========================
async function downloadImage(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${url}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ========================
// HELPER: NORMALIZE IMAGE
// ========================
async function normalizeImage(buffer) {
  return await sharp(buffer)
    .resize(256, 256, { fit: "fill" }) // penting untuk konsistensi
    .grayscale() // buang warna (lebih stabil)
    .toBuffer();
}

// ========================
// HELPER: HEX → BIGINT
// ========================
function hexToBigInt(hex) {
  return BigInt("0x" + hex);
}

// ========================
// HELPER: ASPECT RATIO
// ========================
async function getImageMeta(buffer) {
  const meta = await sharp(buffer).metadata();
  const ratio = meta.width / meta.height;

  return {
    width: meta.width,
    height: meta.height,
    aspect_ratio: ratio
  };
}

// ========================
// PROCESS 1 CARD
// ========================
async function processCard(card) {
  let attempt = 0;

  while (attempt < RETRY_LIMIT) {
    try {
      console.log(`🔄 Processing: ${card.id}`);

      // skip jika sudah ada
      const { data: existing } = await supabase
        .from("card_hashes")
        .select("id")
        .eq("card_id", card.id)
        .maybeSingle();

      if (existing) {
        console.log(`⏭️ Skip (already exist): ${card.id}`);
        return;
      }

      // download
      const originalBuffer = await downloadImage(card.image_small);

      // metadata
      const meta = await getImageMeta(originalBuffer);

      // normalize
      const buffer = await normalizeImage(originalBuffer);

      // generate phash
      const phashHex = await imghash.hash(buffer, 8, "hex"); // 64-bit

      const phash = phashHex; // simpan langsung hex

      // insert
      const { error } = await supabase.from("card_hashes").insert({
        card_id: card.id,
        phash: phash,
        phash_hex: phash,
        image_url: card.image_small,
        width: meta.width,
        height: meta.height,
        aspect_ratio: meta.aspect_ratio
    });

      if (error) {
        throw error;
      }

      console.log(`✅ Success: ${card.id}`);
      return;

    } catch (err) {
      attempt++;
      console.log(`❌ Error (${attempt}) ${card.id}:`, err.message);

      if (attempt >= RETRY_LIMIT) {
        console.log(`💀 Failed permanently: ${card.id}`);
      }
    }
  }
}

// ========================
// MAIN RUNNER
// ========================
async function run() {
  console.log("🚀 START GENERATE HASH");

  let from = 0;

  while (true) {
    console.log(`📦 Fetch batch ${from} - ${from + BATCH_SIZE}`);

    const { data: cards, error } = await supabase
      .from("cards_new")
      .select("id, image_small")
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      console.log("❌ Fetch error:", error);
      break;
    }

    if (!cards || cards.length === 0) {
      console.log("🎉 DONE ALL");
      break;
    }

    await Promise.all(
      cards.map(card =>
        limit(() => processCard(card))
      )
    );

    from += BATCH_SIZE;
  }
}

// ========================
// EXECUTE
// ========================
run();