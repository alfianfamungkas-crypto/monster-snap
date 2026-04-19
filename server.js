require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const vision = require('@google-cloud/vision');

const app = express();
const sharp = require("sharp");
const imghash = require("imghash");


/* =========================
   CORS + JSON
========================= */
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://trezora-monster-snap.vercel.app'
  ]
}));

app.use(express.json());

/* =========================
   CACHE
========================= */
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  next();
});

/* =========================
   SUPABASE
========================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* =========================
   GOOGLE VISION
========================= */
let client;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  client = new vision.ImageAnnotatorClient({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
  });
} else {
  client = new vision.ImageAnnotatorClient({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || './vision-key.json'
  });
}

/* =========================
   UPLOAD
========================= */
const upload = multer({ dest: "uploads/" });

/* =========================
   HELPERS
========================= */
function normalizePhone(phone) {
  return phone.startsWith("08") ? "+62" + phone.slice(1) : phone;
}

function success(res, data) {
  return res.json({ success: true, data });
}

function fail(res, message) {
  return res.status(400).json({ success: false, message });
}


/* =========================
   AUTH
========================= */
app.post("/auth/request-otp", async (req,res)=>{
  const phone = normalizePhone(req.body.phone);
  const otp = "1234";

  await supabase.from("otp_codes").insert([
    { phone_number: phone, otp_code: otp }
  ]);

  return success(res, { otp });
});

app.post("/auth/verify-otp", async (req,res)=>{
  const phone = normalizePhone(req.body.phone);
  const { otp } = req.body;

  const { data } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("phone_number", phone)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data[0]?.otp_code !== otp) {
    return fail(res, "Invalid OTP");
  }

  let { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();

  if (!user) {
    const id = `SS-${Date.now()}`;
    await supabase.from("users").insert({
      id,
      phone_number: phone
    });
    user = { id };
  }

  return success(res, { user_id: user.id });
});

/* =========================
   SETS
========================= */
app.get("/home/sets", async (req,res)=>{
  const { data } = await supabase
    .from("sets_new")
    .select("id, name, logo_url, series, release_date")
    .order("release_date", { ascending: false });

  return success(res, {
    sets: data.map(s => ({
      id: s.id,
      name: s.name,
      logo: s.logo_url,
      series: s.series,
      release_date: s.release_date
    }))
  });
});

/* =========================
   CARDS BY SET
========================= */
app.get("/cards/set/:set_id", async (req,res)=>{
  const { data } = await supabase
    .from("cards_new")
    .select("id,name,number,rarity,image_small,set_id")
    .eq("set_id", req.params.set_id);

  return res.json({
    cards: data.map(c => ({
      card_id: c.id,
      card_name: c.name,
      card_number: c.number,
      rarity: c.rarity,
      image_url: c.image_small,
      set_id: c.set_id
    }))
  });
});

/* =========================
   SEARCH
========================= */
app.get("/search", async (req,res)=>{
  const { q } = req.query;

  if (!q) return res.json({ cards: [] });

  const { data } = await supabase
    .from("cards_new")
    .select("id,name,number,image_small,rarity")
    .ilike("name", `%${q}%`)
    .limit(100);

  return res.json({
    cards: data.map(c => ({
      card_id: c.id,
      card_name: c.name,
      card_number: c.number,
      image_url: c.image_small,
      rarity: c.rarity
    }))
  });
});

/* =========================
   CARD DETAIL
========================= */
app.get("/cards/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // =========================
    // 1️⃣ CARD
    // =========================
    const { data: card } = await supabase
      .from("cards_new")
      .select(`
        id,
        name,
        number,
        rarity,
        artist,
        image_small,
        image_large,
        set_id
      `)
      .eq("id", id)
      .maybeSingle();

    if (!card) {
      return res.status(404).json({ success: false });
    }

    // =========================
    // 2️⃣ SET
    // =========================
    const { data: set } = await supabase
      .from("sets_new")
      .select("name, release_date")
      .eq("id", card.set_id)
      .maybeSingle();

    // =========================
    // 3️⃣ PRICES (FULL STRUCTURE)
    // =========================
    const { data: prices } = await supabase
      .from("prices_new")
      .select(`
        source,
        variant,
        currency,
        low,
        mid,
        high,
        market,
        direct_low
      `)
      .eq("card_id", id);

    // =========================
    // 4️⃣ FORMAT PRICES
    // =========================
    const formattedPrices = (prices || []).map(p => ({
      source: p.source,
      variant: p.variant,
      currency: p.currency,
      values: {
        low: p.low,
        mid: p.mid,
        high: p.high,
        market: p.market,
        direct_low: p.direct_low
      }
    }));

    // =========================
    // 🔥 LEGACY PRICE (FE lama)
    // =========================
    const bestPrice =
      prices?.find(p => p.market)?.market ||
      prices?.find(p => p.mid)?.mid ||
      prices?.[0]?.low ||
      0;

    // =========================
    // FINAL RESPONSE
    // =========================
    return res.json({
      success: true,
      card: {
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        image: card.image_small,
        image_hd: card.image_large,

        // ✅ NEW
        artist: card.artist,

        set_name: set?.name,
        release_date: set?.release_date,

        // ✅ NEW STRUCTURE
        prices: formattedPrices,

        // ⚠️ LEGACY (JANGAN HAPUS)
        price: bestPrice
      }
    });

  } catch (err) {
    console.log("CARD DETAIL ERROR:", err);
    return res.status(500).json({ success: false });
  }
});

/* =========================
   SCAN (FIXED)
========================= */
app.post("/scan", upload.single("image"), async (req, res) => {
  try {
    console.log("SCAN FINAL HYBRID HIT");

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded"
      });
    }

    // =========================
    // STEP 1 — OCR
    // =========================
    let keyword = "";
    let cardNumber = null;

    try {
      const [ocr] = await client.textDetection(req.file.path);
      const text = ocr.fullTextAnnotation?.text || "";

      console.log("OCR RAW:", text);

      // extract name (ambil line pertama yang valid)
      const lines = text
        .split("\n")
        .map(l => l.trim().toLowerCase())
        .filter(l =>
          l.length > 3 &&
          l.length < 20 &&
          /^[a-zA-Z\s\-]+$/.test(l)
        );

      keyword = lines[0] || "";

      // extract number (format: 050/088)
      const numberMatch = text.match(/(\d{1,3})\/(\d{1,3})/);

      if (numberMatch) {
        cardNumber = String(parseInt(numberMatch[1])); // normalize "050" → "50"
      }

      console.log("OCR NAME:", keyword);
      console.log("OCR NUMBER:", cardNumber);

    } catch (err) {
      console.log("OCR ERROR:", err.message);
    }

    // =========================
    // STEP 2 — QUERY CANDIDATES
    // =========================
    let candidates = [];

    // PRIORITY 1: number + name
    if (keyword && cardNumber) {
      const { data } = await supabase
        .from("cards_new")
        .select(`
          id,
          name,
          number,
          image_small,
          rarity,
          artist,
          set_id,
          sets_new ( name )
        `)
        .ilike("name", `%${keyword}%`)
        .eq("number", cardNumber)
        .limit(50);

      candidates = data || [];
      console.log("CANDIDATES (NAME + NUMBER):", candidates.length);
    }

    // PRIORITY 2: name only
    if (candidates.length === 0 && keyword) {
      const { data } = await supabase
        .from("cards_new")
        .select(`
          id,
          name,
          number,
          image_small,
          rarity,
          artist,
          set_id,
          sets_new ( name )
        `)
        .ilike("name", `%${keyword}%`)
        .limit(50);

      candidates = data || [];
      console.log("CANDIDATES (NAME ONLY):", candidates.length);
    }

    // PRIORITY 3: fallback (random latest)
    if (candidates.length === 0) {
      const { data } = await supabase
        .from("cards_new")
        .select(`
          id,
          name,
          number,
          image_small,
          rarity,
          artist,
          set_id,
          sets_new ( name )
        `)
        .limit(50);

      candidates = data || [];
      console.log("CANDIDATES (FALLBACK):", candidates.length);
    }

    if (!candidates || candidates.length === 0) {
      return res.json({
        success: false,
        message: "No candidates found"
      });
    }

    // =========================
    // STEP 3 — GENERATE PHASH
    // =========================
    const buffer = await sharp(req.file.path)
      .resize(256, 256, { fit: "fill" })
      .grayscale()
      .toBuffer();

    const inputHash = await imghash.hash(buffer, 8, "hex");

    console.log("INPUT HASH:", inputHash);

    // =========================
    // STEP 4 — GET HASHES
    // =========================
    const cardIds = candidates.map(c => c.id);

    const { data: hashes } = await supabase
      .from("card_hashes")
      .select("card_id, phash")
      .in("card_id", cardIds);

    // =========================
    // HAMMING FUNCTION
    // =========================
    function hammingDistance(h1, h2) {
      const b1 = BigInt("0x" + h1);
      const b2 = BigInt("0x" + h2);

      let x = b1 ^ b2;
      let dist = 0;

      while (x > 0n) {
        dist++;
        x &= x - 1n;
      }

      return dist;
    }

    // =========================
    // STEP 5 — MATCHING
    // =========================
    const results = hashes.map(h => {
      const dist = hammingDistance(inputHash, h.phash);
      return { card_id: h.card_id, dist };
    });

    results.sort((a, b) => a.dist - b.dist);

    const top = results.slice(0, 5);

    // =========================
    // STEP 6 — FINAL MERGE
    // =========================
    const MAX_BITS = 64;

    const finalResults = top.map(r => {
      const card = candidates.find(c => c.id === r.card_id);

      const similarity = Math.max(
        0,
        Math.round((1 - r.dist / MAX_BITS) * 100)
      );

      return {
        id: card.id,
        name: card.name,
        number: card.number,
        image: card.image_small,
        set: card.sets_new?.name,
        artist: card.artist,
        distance: r.dist,
        similarity
      };
    });

    console.log("FINAL RESULTS:", finalResults);

    // =========================
    // STEP 7 — RESPONSE
    // =========================
    return res.json({
      success: true,
      card: finalResults[0] || null,
      results: finalResults
    });

  } catch (err) {
    console.log("SCAN FINAL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Scan failed"
    });
  }
});

/* =========================
   COLLECTION
========================= */
app.get("/collection/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "Missing user_id"
      });
    }

    console.log("GET COLLECTION:", user_id);

    // ========================
    // GET COLLECTION + CARD
    // ========================
    const { data, error } = await supabase
      .from("user_collections")
      .select(`
        card_id,
        quantity,
        cards_new (
          id,
          name,
          image_small,
          rarity,
          set_id,
          sets_new ( name )
        )
      `)
      .eq("user_id", user_id);

    if (error) {
      console.log("GET ERROR:", error);
      return res.status(500).json({ success: false });
    }

    const cardIds = (data || []).map(i => i.card_id);

    // ========================
    // GET PRICES (BULK)
    // ========================
    const { data: prices } = await supabase
      .from("prices_new")
      .select(`
        card_id,
        market,
        mid,
        low,
        high,
        direct_low
      `)
      .in("card_id", cardIds);

    // ========================
    // ADVANCED PRICE LOGIC
    // ========================
    function getBestPrice(cardPrices) {
      if (!cardPrices?.length) return 0;

      for (const p of cardPrices) {
        if (p.market) return p.market;
        if (p.direct_low) return p.direct_low;
        if (p.mid) return p.mid;
        if (p.high) return p.high;
        if (p.low) return p.low;
      }

      return 0;
    }

    // ========================
    // FORMAT RESULT
    // ========================
    let totalValue = 0;

    const result = (data || []).map(item => {
      const card = item.cards_new;

      const cardPrices =
        prices?.filter(p => p.card_id === item.card_id) || [];

      const bestPrice = getBestPrice(cardPrices);
      const total = bestPrice * item.quantity;

      totalValue += total;

      return {
        card_id: item.card_id,
        quantity: item.quantity,

        card_name: card?.name,
        image_url: card?.image_small,
        rarity: card?.rarity,
        set_name: card?.sets_new?.name,

        price: bestPrice,
        total_value: total
      };
    });

    return res.json({
      success: true,
      data: result,
      total_value: totalValue
    });

  } catch (err) {
    console.log("GET COLLECTION ERROR:", err);
    return res.status(500).json({ success: false });
  }
});

app.post("/collection/add", async (req, res) => {
  try {
    const { user_id, card_id, quantity = 1 } = req.body;

    console.log("ADD COLLECTION:", { user_id, card_id, quantity });

    if (!user_id || !card_id) {
      return res.status(400).json({
        success: false,
        message: "Missing user_id or card_id"
      });
    }

    // ========================
    // CHECK EXISTING
    // ========================
    const { data: existing, error: fetchError } = await supabase
      .from("user_collections")
      .select("*")
      .eq("user_id", user_id)
      .eq("card_id", card_id)
      .maybeSingle();

    if (fetchError) {
      console.log("FETCH ERROR:", fetchError);
      return res.status(500).json({ success: false });
    }

    // ========================
    // UPDATE
    // ========================
    if (existing) {
      const newQty = existing.quantity + quantity;

      const { error: updateError } = await supabase
        .from("user_collections")
        .update({ quantity: newQty })
        .eq("id", existing.id);

      if (updateError) {
        console.log("UPDATE ERROR:", updateError);
        return res.status(500).json({ success: false });
      }

      return res.json({
        success: true,
        message: "Collection updated",
        quantity: newQty
      });
    }

    // ========================
    // INSERT (FIX UTAMA)
    // ========================
    const { data: inserted, error: insertError } = await supabase
      .from("user_collections")
      .insert([
        {
          user_id,
          card_id,
          quantity
        }
      ])
      .select();

    console.log("INSERT RESULT:", inserted);

    if (insertError) {
      console.log("INSERT ERROR:", insertError);
      return res.status(500).json({ success: false });
    }

    return res.json({
      success: true,
      message: "Added to collection",
      quantity
    });

  } catch (err) {
    console.log("ADD COLLECTION ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

app.post("/collection/remove", async (req, res) => {
  try {
    const { user_id, card_id } = req.body;

    if (!user_id || !card_id) {
      return res.status(400).json({
        success: false,
        message: "Missing user_id or card_id"
      });
    }

    const { data: existing } = await supabase
      .from("user_collections")
      .select("*")
      .eq("user_id", user_id)
      .eq("card_id", card_id)
      .maybeSingle();

    if (!existing) {
      return res.json({ success: true });
    }

    if (existing.quantity > 1) {
      await supabase
        .from("user_collections")
        .update({ quantity: existing.quantity - 1 })
        .eq("id", existing.id);

      return res.json({ success: true });
    }

    await supabase
      .from("user_collections")
      .delete()
      .eq("id", existing.id);

    return res.json({ success: true });

  } catch (err) {
    console.log("REMOVE COLLECTION ERROR:", err);
    return res.status(500).json({ success: false });
  }
});

/* =========================
   USER
========================= */
app.get("/user/:id", async (req,res)=>{
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  return success(res, { user:data });
});

app.put("/user", async (req,res)=>{
  const { user_id, username } = req.body;

  const { data } = await supabase
    .from("users")
    .update({ username })
    .eq("id", user_id)
    .select()
    .maybeSingle();

  return success(res, { user:data });
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log(`🚀 Server running on ${PORT}`);
});