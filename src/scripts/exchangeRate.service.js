const axios = require("axios");

// 🔥 IN-MEMORY CACHE
let rateCache = {
  USD: null,
  EUR: null,
  lastUpdate: null
};

// ========================
// FETCH FROM EXTERNAL API
// ========================
async function fetchRatesFromAPI() {
  try {
    // contoh pakai exchangerate-api
    const res = await axios.get(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );

    const usdToIdr = res.data.rates.IDR;

    const eurRes = await axios.get(
      "https://api.exchangerate-api.com/v4/latest/EUR"
    );

    const eurToIdr = eurRes.data.rates.IDR;

    return {
      USD: usdToIdr,
      EUR: eurToIdr
    };

  } catch (err) {
    console.log("FETCH RATE ERROR:", err.message);
    return null;
  }
}

// ========================
// UPDATE DB + CACHE
// ========================
async function updateRates(supabase) {
  const rates = await fetchRatesFromAPI();

  if (!rates) return;

  console.log("UPDATING RATES:", rates);

  // update DB
  for (const currency of ["USD", "EUR"]) {
    await supabase
      .from("exchange_rates")
      .upsert({
        base_currency: currency,
        target_currency: "IDR",
        rate: rates[currency],
        updated_at: new Date()
      }, {
        onConflict: "base_currency,target_currency"
      });
  }

  // update cache
  rateCache = {
    USD: rates.USD,
    EUR: rates.EUR,
    lastUpdate: new Date()
  };
}

// ========================
// GET RATE (WITH CACHE)
// ========================
async function getRates(supabase) {

  // 1️⃣ USE CACHE (TTL 1 JAM)
  const now = new Date();
  const diff = (now - new Date(rateCache.lastUpdate)) / 1000;

  if (rateCache.USD && diff < 3600) {
    return rateCache;
  }

  // 2️⃣ FALLBACK DB
  const { data } = await supabase
    .from("exchange_rates")
    .select("*")
    .in("base_currency", ["USD", "EUR"]);

  if (data && data.length > 0) {
    const mapped = {};
    data.forEach(r => {
      mapped[r.base_currency] = r.rate;
    });

    rateCache = {
      ...mapped,
      lastUpdate: new Date()
    };

    return rateCache;
  }

  // 3️⃣ LAST RESORT → FETCH
  await updateRates(supabase);
  return rateCache;
}

module.exports = {
  getRates,
  updateRates
};