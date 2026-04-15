const fs = require("fs");

const cards = JSON.parse(
  fs.readFileSync("yugioh_cards_clean.json")
);

const clean = cards.filter(card =>
  card.set_id && card.set_id.trim() !== ""
);

fs.writeFileSync(
  "yugioh_cards_ready.json",
  JSON.stringify(clean,null,2)
);

console.log("Original:", cards.length);
console.log("Valid cards:", clean.length);