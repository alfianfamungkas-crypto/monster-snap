const fs = require("fs");

const raw = JSON.parse(fs.readFileSync("yugioh_cards.json"));

const cards = raw.data.map(card => {

  const setName = card.card_sets?.[0]?.set_name || "";
  const setCode = card.card_sets?.[0]?.set_code || "";
  const cardNumber = setCode.split("-")[1] || "";

  return {
    game: "yugioh",
    card_id: card.id.toString(),
    card_name: card.name || "",
    set_id: setCode.split("-")[0].toLowerCase(),
    card_number: cardNumber,
    rarity: card.card_sets?.[0]?.set_rarity || "",
    image_url: card.card_images?.[0]?.image_url_small || ""
  };

});

fs.writeFileSync(
  "yugioh_cards_clean.json",
  JSON.stringify(cards,null,2)
);

console.log("Yugioh dataset created:", cards.length);