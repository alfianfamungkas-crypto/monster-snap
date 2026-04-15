const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

async function scrape() {

  const url = "https://en.onepiece-cardgame.com/cardlist/";

  const { data } = await axios.get(url);

  const $ = cheerio.load(data);

  let cards = [];

  $(".cardlistCol").each((i, el) => {

    const text = $(el).text();

    const idMatch = text.match(/([A-Z]{2}\d{2}-\d{3})/);

    if(!idMatch) return;

    const cardId = idMatch[1];

    const name = $(el).find(".cardName").text().trim();

    const rarity = $(el).find(".rarity").text().trim();

    const setId = cardId.split("-")[0];
    const cardNumber = cardId.split("-")[1];

    cards.push({
      game: "onepiece",
      card_id: cardId,
      card_name: name,
      set_id: setId.toLowerCase(),
      card_number: cardNumber,
      rarity: rarity,
      image_url: ""
    });

  });

  fs.writeFileSync(
    "onepiece_cards_clean.json",
    JSON.stringify(cards,null,2)
  );

  console.log("Cards scraped:", cards.length);

}

scrape();