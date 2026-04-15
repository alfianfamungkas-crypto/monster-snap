const fs = require("fs");
const path = require("path");

const folder = ".";
let prices = [];

fs.readdirSync(folder).forEach(file => {

  if (!file.endsWith(".json")) return;
  if (file.includes("yugioh")) return;
  if (file.includes("clean")) return;
  if (file.includes("price")) return;

  try {

    const raw = fs.readFileSync(path.join(folder,file),"utf8");
    const json = JSON.parse(raw);

    // support dua format dataset
    const cards = Array.isArray(json) ? json : json.data;

    if(!cards) return;

    cards.forEach(card => {

      const price =
        card.tcgplayer?.prices?.holofoil?.market ||
        card.tcgplayer?.prices?.normal?.market ||
        card.cardmarket?.prices?.averageSellPrice ||
        null;

      if (!price) return;

      prices.push({
        card_id: card.id,
        price: price,
        currency: "USD",
        source: "pokemon_dataset"
      });

    });

  } catch(err){

    console.log("Skipping file:",file);

  }

});

fs.writeFileSync(
  "pokemon_prices_clean.json",
  JSON.stringify(prices,null,2)
);

console.log("Pokemon prices extracted:",prices.length);