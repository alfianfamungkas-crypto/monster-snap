const fs = require("fs");

const raw = JSON.parse(
 fs.readFileSync("onepiece_raw.json")
);

let cards = [];

raw.forEach(card => {

 const setId = card.id.split("-")[0];

 cards.push({
   game: "onepiece",
   card_id: card.id,
   card_name: card.name || "",
   card_number: card.id.split("-")[1] || "",
   set_id: setId.toLowerCase(),
   rarity: card.rarity || "",
   image_url: card.images?.small || ""
 });

});

fs.writeFileSync(
 "onepiece_cards_clean.json",
 JSON.stringify(cards,null,2)
);

console.log("Cards processed:", cards.length);