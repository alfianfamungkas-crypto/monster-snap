const fs = require("fs");

const raw = JSON.parse(fs.readFileSync("yugioh_cards.json"));

let setsMap = {};

raw.data.forEach(card => {

  if(card.card_sets){

    card.card_sets.forEach(set => {

      const setId = set.set_code.split("-")[0].toLowerCase();

      if(!setsMap[setId]){
        setsMap[setId] = {
          id: setId,
          game: "yugioh",
          set_name: set.set_name,
          release_date: null
        };
      }

    });

  }

});

const sets = Object.values(setsMap);

fs.writeFileSync(
  "yugioh_sets_clean.json",
  JSON.stringify(sets,null,2)
);

console.log("Total sets:", sets.length);