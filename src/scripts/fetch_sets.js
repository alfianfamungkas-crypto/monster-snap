const fs = require("fs");

async function fetchSets() {

const res = await fetch("https://api.pokemontcg.io/v2/sets");

const data = await res.json();

const sets = data.data.map(set => ({
 id: set.id,
 game: "pokemon",
 set_name: set.name,
 series: set.series,
 release_date: set.releaseDate,
 symbol_url: set.images.symbol,
 logo_url: set.images.logo
}));

fs.writeFileSync("pokemon_sets.json", JSON.stringify(sets,null,2));

console.log("Sets dataset created");

}

fetchSets();