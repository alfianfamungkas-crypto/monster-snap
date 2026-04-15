require('dotenv').config()

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");

const { createClient } = require("@supabase/supabase-js");
const vision = require("@google-cloud/vision");


// ===== HELPER FUNCTION =====
function normalizePhone(phone) {
  if (phone.startsWith("08")) {
    return "+62" + phone.slice(1);
  }
  return phone;
}

function success(res, data) {
  return res.json({
    success: true,
    data
  });
}

function fail(res, message) {
  return res.status(400).json({
    success: false,
    message
  });
}

function formatIDR(priceUSD) {
  if (!priceUSD) return null;

  const rate = 17300; // 🔥 bisa nanti diganti dynamic
  const idr = Math.round(priceUSD * rate);

  return {
    usd: priceUSD,
    idr,
    display: `IDR ${idr.toLocaleString('id-ID')} ($${priceUSD})`
  };
}

const app = express();
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  next();
});

app.use(cors());
app.use(express.json());

/* -----------------------------
   SUPABASE
----------------------------- */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* -----------------------------
   GOOGLE VISION
----------------------------- */

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

/* -----------------------------
   FILE UPLOAD
----------------------------- */

const upload = multer({ dest: "uploads/" });

/* -----------------------------
   AUTH - SEND OTP
----------------------------- */

app.post("/auth/request-otp", async (req,res)=>{

 const phone = normalizePhone(req.body.phone);

 const otp = "1234";

 console.log("SEND OTP:", phone, otp);

 const {data,error} = await supabase
  .from("otp_codes")
  .insert([
    {
      phone_number: phone,
      otp_code: String(otp)
    }
  ])
  .select();

 if(error){
  console.log("OTP INSERT ERROR:", error);
  return res.json({success:false, error});
 }

 console.log("OTP INSERTED:", data);

 return res.json({
  success:true,
  otp // debug sementara
 });

});

/* -----------------------------
   AUTH - VERIFY OTP
----------------------------- */

app.post("/auth/verify-otp", async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const { otp } = req.body;

  const { data } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("phone_number", phone)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) {
    return fail(res, "OTP not found");
  }

  const latest = data[0];

  if (String(latest.otp_code) !== String(otp)) {
    return fail(res, "Invalid OTP");
  }

  // CHECK USER
  const { data: existingUser } = await supabase
    .from("users")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();

  let user_id;

  if (existingUser) {
    user_id = existingUser.id;
  } else {
    user_id = `SS-${Date.now()}`;

    const { error } = await supabase
      .from("users")
      .insert([
        {
          id: user_id,
          phone_number: phone
        }
      ]);

    if (error) return fail(res, error.message);
  }

  return success(res, { user_id });
});

///////////////////////////////////////////////
// COLLECTION LIST
//////////////////////////////////////////////

app.get("/collection/:user_id", async (req,res)=>{

 const {user_id} = req.params;

 const {data,error} = await supabase
  .from("user_collections")
  .select(`
   card_id,
   quantity,
   cards (
     card_name,
     image_url,
     rarity,
     sets (
       set_name
     )
   )
  `)
  .eq("user_id", user_id);

  const grouped = {};

  data.forEach(item => {

   const key = item.card_id;

   if(!grouped[key]){
    grouped[key] = {
     card_id: item.card_id,
     card_name: item.cards.card_name,
     image_url: item.cards.image_url,
     rarity: item.cards.rarity,
     set_name: item.cards.sets?.set_name,
     quantity: 0
  };
 }

 grouped[key].quantity += item.quantity;

});

 res.json(Object.values(grouped));

});

//////////////////////////////////////////////
// GET ALL SETS
//////////////////////////////////////////////
app.get("/home/sets", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sets")
      .select("id, set_name, logo_url")
      .eq("game", "pokemon") // 🔥 INI KUNCI
      .order("set_name", { ascending: true });

    if (error) throw error;

    return success(res, {
      sets: data.map(s => ({
        id: s.id,
        name: s.set_name,
        logo: s.logo_url
      }))
    });

  } catch (err) {
    return fail(res, err.message);
  }
  console.log("SETS RAW:", data);
});


/*/////////////////////////////////////////////
// CARD LIST BY SET
/////////////////////////////////////////////*/
app.get("/cards/set/:set_id", async (req, res) => {
  const { set_id } = req.params;

  try {
    const { data, error } = await supabase
      .from("cards")
      .select(`
        card_id,
        card_name,
        card_number,
        rarity,
        image_url,
        set_id,
        sets (set_name)
      `)
      .eq("set_id", set_id)
      .limit(1000);

    if (error) throw error;

    return res.json({
      cards: data || []
    });

  } catch (err) {
    console.log("GET CARDS BY SET ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

//////////////////////////////////////////////
// GET CARDS BY SET
//////////////////////////////////////////////
app.post("/scan", upload.single("image"), async (req, res) => {
  try {
    console.log("SCAN REQUEST RECEIVED");

    if (!req.file) {
      return res.status(400).json({ success: false });
    }

    // ========================
    // 🧠 HELPERS
    // ========================

    function extractCardNumber(rawText) {
      const lines = rawText.split("\n");
      let candidates = [];

      for (const line of lines) {
        const match = line.match(/(\d{1,3})\s*\/\s*(\d{2,3})/);

        if (match) {
          const num = parseInt(match[1], 10);
          if (num > 0 && num < 300) {
            candidates.push({
              value: String(num),
              line
            });
          }
        }
      }

      if (candidates.length > 0) {
        const best = candidates[candidates.length - 1];
        console.log("NUMBER LINE:", best.line);
        return best.value;
      }

      return null;
    }

    function extractMainName(rawText) {
      const lines = rawText
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

      const topLines = lines.slice(0, 6);

      let bestCandidate = null;
      let bestScore = 0;

      for (const line of topLines) {
        const lower = line.toLowerCase();
        let score = 0;

        if (
          lower.includes("ability") ||
          lower.includes("energi") ||
          lower.includes("digunakan") ||
          lower.includes("kartu") ||
          lower.includes("peraturan")
        ) continue;

        if (line.length > 30) continue;
        if (/^\d+$/.test(line)) continue;

        if (line.includes("-")) score += 2;
        if (lower.includes("ex")) score += 2;
        if (/^[a-zA-Z\- ]+$/.test(line)) score += 1;
        if (/\d/.test(line)) score -= 1;

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = line;
        }
      }

      return bestCandidate;
    }

    function cleanName(name) {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9\- ]/g, "")
        .replace(/\b(c|ck|e|exx)\b/g, "") // 🔥 buang noise OCR
        .replace(/\d+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getCoreKeywords(name) {
      const words = cleanName(name).split(" ");

      return words.filter(w =>
        w.includes("-") || // ho-oh
        w.length > 3       // ethan
      );
    }

    function detectLanguage(text) {
      if (/[ぁ-んァ-ン一-龯]/.test(text)) return "JP";

      if (
        text.includes("kartu") ||
        text.includes("giliran") ||
        text.includes("lawan")
      ) return "ID";

      return "EN";
    }

    // ========================
    // 1️⃣ OCR
    // ========================
    const [result] = await client.textDetection(req.file.path);
    const rawText = result.fullTextAnnotation?.text || "";

    console.log("OCR RAW:", rawText);

    const text = rawText.toLowerCase();

    // ========================
    // 2️⃣ NUMBER
    // ========================
    const number = extractCardNumber(rawText);
    console.log("FINAL NUMBER:", number);

    // ========================
    // 3️⃣ NAME
    // ========================
    let mainName = extractMainName(rawText);

    if (mainName) {
      mainName = cleanName(mainName);
    }

    console.log("MAIN NAME:", mainName);

    // ========================
    // 4️⃣ LANGUAGE
    // ========================
    const detectedLanguage = detectLanguage(text);
    console.log("LANG:", detectedLanguage);

    // ========================
    // 🔍 5️⃣ SEARCH BY KEYWORDS
    // ========================
    let matchedCards = [];

    if (mainName) {
      const keywords = getCoreKeywords(mainName);

      console.log("KEYWORDS:", keywords);

      if (keywords.length > 0) {
        let query = supabase
          .from("cards")
          .select(`
            card_id,
            card_name,
            card_number,
            rarity,
            set_id,
            sets (set_name)
          `);

        keywords.forEach(k => {
          query = query.ilike("card_name", `%${k}%`);
        });

        const { data } = await query.limit(5);
        matchedCards = data || [];
      }
    }

    // ========================
    // 🔁 FALLBACK NUMBER
    // ========================
    if ((!matchedCards || matchedCards.length === 0) && number) {
      console.log("FALLBACK → NUMBER");

      const { data } = await supabase
        .from("cards")
        .select(`
          card_id,
          card_name,
          card_number,
          rarity,
          set_id,
          sets (set_name)
        `)
        .eq("card_number", number)
        .limit(5);

      return res.json({
        success: true,
        mode: "fallback",
        candidates: data || []
      });
    }

    // ========================
    // ❌ NO RESULT
    // ========================
    if (!matchedCards || matchedCards.length === 0) {
      return res.json({
        success: false,
        message: "Card not found"
      });
    }

    // ========================
    // 6️⃣ PICK BEST
    // ========================
    const bestCard = matchedCards[0];

    console.log("BEST CARD:", bestCard.card_name);

    // ========================
    // 7️⃣ GET PRINTS
    // ========================
    const { data: prints } = await supabase
      .from("card_prints")
      .select(`
        card_id,
        language,
        card_name,
        image_url
      `)
      .eq("card_id", bestCard.card_id);

    if (!prints || prints.length === 0) {
      return res.json({
        success: false,
        message: "No prints found"
      });
    }

    const exactPrint = prints.find(
      p => p.language === detectedLanguage
    );

    const fallbackPrint = prints[0];

    // ========================
    // ✅ FINAL RESPONSE
    // ========================
    return res.json({
      success: true,
      mode: "auto",
      debug: {
        mainName,
        number,
        detectedLanguage
      },
      card: {
        id: bestCard.card_id,
        name: exactPrint?.card_name || fallbackPrint.card_name,
        number: bestCard.card_number,
        image: exactPrint?.image_url || fallbackPrint.image_url,
        rarity: bestCard.rarity,
        set: bestCard.sets?.set_name || "-",
        language: exactPrint?.language || fallbackPrint.language
      }
    });

  } catch (err) {
    console.log("SCAN ERROR:", err);
    return res.status(500).json({ success: false });
  }
});

//////////////////////////////////////////////
// SEARCH CARD BY NAME
//////////////////////////////////////////////
app.get("/search", async (req, res) => {
  const { q } = req.query;

  if (!q) return res.json({ cards: [] });

  try {
    const { data, error } = await supabase
      .from("cards")
      .select(`
        card_id,
        card_name,
        card_number,
        image_url,
        rarity,
        sets (set_name)
      `)
      .ilike("card_name", `%${q}%`)
      .limit(20);

    if (error) throw error;

    return res.json({ cards: data });
  } catch (err) {
    console.log("SEARCH ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

//////////////////////////////////////////////
// CARD DETAIL
//////////////////////////////////////////////
app.get("/cards/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // =========================
    // 1️⃣ GET CARD (BASE)
    // =========================
    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select(`
        card_id,
        card_name,
        card_number,
        rarity,
        image_url,
        set_id
      `)
      .eq("card_id", id)
      .maybeSingle();

    if (cardError) {
      console.log("CARD ERROR:", cardError);
      return res.status(500).json({ success: false, message: "DB error" });
    }

    if (!card) {
      return res.status(404).json({
        success: false,
        message: "Card not found"
      });
    }

    // =========================
    // 2️⃣ GET SET
    // =========================
    const { data: set, error: setError } = await supabase
      .from("sets")
      .select("set_name, release_date")
      .eq("id", card.set_id)
      .maybeSingle();

    if (setError) {
      console.log("SET ERROR:", setError);
    }

    // =========================
    // 3️⃣ GET PRINTS + VARIANTS + PRICES
    // =========================
    const { data: prints, error: printsError } = await supabase
      .from("card_prints")
      .select(`
        id,
        language,
        card_name,
        image_url,
        card_variants (
          id,
          variant_type,
          card_prices (
            grade,
            price
          )
        )
      `)
      .eq("card_id", card.card_id);

    if (printsError) {
      console.log("PRINTS ERROR:", printsError);
      console.log("CARD ID:", card.card_id);

    const { data: prints, error } = await supabase
      .from("card_prints")
      .select("*")
      .eq("card_id", card.card_id);

    console.log("PRINTS RAW:", prints);
    console.log("PRINTS ERROR:", error);
    }
    

    // =========================
    // 🔥 FORMAT RESPONSE
    // =========================
    const result = {
      id: card.card_id,
      name: card.card_name,
      number: card.card_number,
      rarity: card.rarity,
      image: card.image_url,

      set_name: set?.set_name || null,
      release_date: set?.release_date || null,

      prints: []

    };

    for (const p of prints || []) {
      const printObj = {
        language: p.language,
        name: p.card_name,
        image: p.image_url,
        variants: []
      };

      for (const v of p.card_variants || []) {
        const variantObj = {
          type: v.variant_type,
          prices: {}
        };

        for (const price of v.card_prices || []) {
          variantObj.prices[price.grade] = formatIDR(price.price);
        }

        printObj.variants.push(variantObj);
      }

      result.prints.push(printObj);
    }

    return res.json({
      success: true,
      card: result
    });

  } catch (err) {
    console.log("CARD DETAIL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* -----------------------------
   ADD COLLECTION
------------------------------*/
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
    // 1️⃣ CHECK EXISTING
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
    // 2️⃣ UPDATE (IF EXISTS)
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
    // 3️⃣ INSERT (IF NEW)
    // ========================
    const { error: insertError } = await supabase
      .from("user_collections")
      .insert([
        {
          user_id,
          card_id,
          quantity
        }
      ]);

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

/* -----------------------------
   GET COLLECTION
----------------------------- */
app.get("/collection/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "Missing user_id"
      });
    }

  const { data, error } = await supabase
  .from("user_collections")
  .select(`
    card_id,
    quantity,
    cards (
      card_name,
      image_url,
      rarity,
      sets (set_name),
      card_prints (
        id,
        card_variants (
          id,
          variant_type,
          card_prices (
            grade,
            price
          )
        )
      )
    )
  `)
  .eq("user_id", user_id);

    if (error) throw error;

function getBestPrice(variants) {
  let psa10 = null;
  let raw = null;

  (variants || []).forEach(v => {
    (v.card_prices || []).forEach(p => {
      if (p.grade === "PSA10") psa10 = p.price;
      if (p.grade === "RAW") raw = p.price;
    });
  });

  return psa10 || raw || 0;
}

const result = data.map(item => {
  const prints = item.cards?.card_prints || [];

  let bestPrice = 0;

  prints.forEach(print => {
    const variants = print.card_variants || [];

    const price = getBestPrice(variants);

    if (price > bestPrice) {
      bestPrice = price;
    }
  });

  return {
    card_id: item.card_id,
    card_name: item.cards?.card_name,
    image_url: item.cards?.image_url,
    rarity: item.cards?.rarity,
    set_name: item.cards?.sets?.set_name,
    quantity: item.quantity,
    price: bestPrice
  };
});

    return res.json({
      success: true,
      data: result
    });
    

  } catch (err) {
    console.log("GET COLLECTION ERROR:", err);
    return res.status(500).json({ success: false });
  }
  console.log("PRINTS:", item.cards?.card_prints)
console.log("VARIANTS:", item.cards?.card_prints?.[0]?.card_variants)
});

/* -----------------------------
   REMOVE COLLECTION
----------------------------- */
app.post("/collection/remove", async (req, res) => {
  try {
    const { user_id, card_id } = req.body;

    if (!user_id || !card_id) {
      return res.status(400).json({
        success: false,
        message: "Missing user_id or card_id"
      });
    }

    // cek existing
    const { data: existing } = await supabase
      .from("user_collections")
      .select("*")
      .eq("user_id", user_id)
      .eq("card_id", card_id)
      .maybeSingle();

    if (!existing) {
      return res.json({ success: true });
    }

    // kalau quantity > 1 → kurangi
    if (existing.quantity > 1) {
      await supabase
        .from("user_collections")
        .update({ quantity: existing.quantity - 1 })
        .eq("id", existing.id);

      return res.json({ success: true });
    }

    // kalau 1 → delete
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

/* -----------------------------
   USER - UPDATE NAME
----------------------------- */

app.put("/user", async (req, res) => {
  try {
    const { user_id, username } = req.body;

    if (!user_id || !username) {
      return fail(res, "Missing user_id or username");
    }

    const { data, error } = await supabase
      .from("users")
      .update({ username })
      .eq("id", user_id)
      .select()
      .maybeSingle();

    if (error) {
      console.log("UPDATE USER ERROR:", error);
      return fail(res, error.message);
    }

    return success(res, {
      user: {
        id: data.id,
        username: data.username,
        phone_number: data.phone_number
      }
    });

  } catch (err) {
    return fail(res, err.message);
  }
});

app.get("/user/:id", async (req, res) => {
  const { id } = req.params;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return success(res, { user: data });
});

/* -----------------------------
   SERVER START
----------------------------- */

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})