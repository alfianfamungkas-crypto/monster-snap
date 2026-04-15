const fs = require("fs");
const path = require("path");

const folder = ".";
let allCards = [];

fs.readdirSync(folder).forEach(file => {

  if (file.endsWith(".json") && file !== "pokemon_cards_clean.json") {

    const data = JSON.parse(
      fs.readFileSync(path.join(folder, file), "utf8")
    );

    data.forEach(card => {

      const setId = card.id ? card.id.split("-")[0] : "";

      allCards.push({
        game: "pokemon",
        card_id: card.id || "",
        card_name: card.name || "",
        set_id: setId,
        set_name: card.set?.name || "",
        card_number: card.number || "",
        rarity: card.rarity || "",
        release_date: card.set?.releaseDate || "",
        image_url: card.images?.small || ""
      });

    });

  }

});

fs.writeFileSync(
  "pokemon_cards_clean.json",
  JSON.stringify(allCards, null, 2)
);

console.log("Clean dataset created:", allCards.length, "cards");