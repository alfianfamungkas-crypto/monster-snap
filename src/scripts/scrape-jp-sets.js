const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

// ==========================
// SOURCE
// ==========================
const URL = "https://www.pokemon-card.com/card-search/";

// ==========================
// SCRAPER
// ==========================
async function scrapeSets() {
  console.log("🌐 Fetch JP sets...");

  const { data } = await axios.get(URL);
  const $ = cheerio.load(data);

  const sets = [];

  $(".ExpansionList a").each((i, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr("href");

    if (!href) return;

    // contoh: /card-search/result/?regulation_sidebar_form=XY
    const match = href.match(/regulation_sidebar_form=([a-z0-9]+)/i);

    if (!match) return;

    const set_code = match[1].toLowerCase();

    sets.push({
      id: `jp_${set_code}`,
      set_code,
      set_name: name,
      logo_url: null
    });
  });

  fs.writeFileSync("jp_sets.json", JSON.stringify(sets, null, 2));

  console.log(`✅ ${sets.length} JP sets saved`);
}

scrapeSets();