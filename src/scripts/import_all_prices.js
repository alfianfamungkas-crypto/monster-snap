const fetch = (...args) =>
  import('node-fetch').then(({default: fetch}) => fetch(...args));

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
 "https://mheqakdzirlrpslextab.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTY2MzgsImV4cCI6MjA4ODY5MjYzOH0.XwcrXlyF6WB1qK4HNH9wQQ7zn6qp4kQ7tELdMkNClqg"
);

async function importPokemonPrices(){

 let page = 1;
 let hasMore = true;

 while(hasMore){

  console.log("Fetching page",page);

  const res = await fetch(`https://api.pokemontcg.io/v2/cards?pageSize=250&page=${page}`);

if (!res.ok) {
  console.log("API error page:", page);
  await new Promise(r => setTimeout(r, 2000));
  continue;
}

let json;

try {
  json = await res.json();
} catch (err) {
  console.log("Invalid JSON page:", page);
  await new Promise(r => setTimeout(r, 2000));
  continue;
}

  const cards = json.data;

  if(!cards || cards.length === 0){
   hasMore = false;
   break;
  }

  for(const card of cards){

   const price =
    card.tcgplayer?.prices?.holofoil?.market ||
    card.tcgplayer?.prices?.normal?.market ||
    card.cardmarket?.prices?.averageSellPrice ||
    null;

   if(!price) continue;

   await supabase
    .from("card_prices")
    .upsert({
     card_id: card.id,
     price: price,
     currency: "USD",
     source: "pokemon_api",
     updated_at: new Date()
    });

  }

  console.log("Imported page",page);

  page++;

  await new Promise(r=>setTimeout(r,400));

 }

 console.log("Pokemon price import finished");

}

async function importYugiohPrices(){

 console.log("Fetching Yugioh prices...");

 const res = await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php");
 const json = await res.json();

 const cards = json.data;

 for(const card of cards){

  const price =
   card.card_prices?.[0]?.cardmarket_price ||
   card.card_prices?.[0]?.tcgplayer_price ||
   null;

  if(!price) continue;

  await supabase
   .from("card_prices")
   .upsert({
    card_id: card.id,
    price: price,
    currency: "USD",
    source: "ygoprodeck",
    updated_at: new Date()
   });

 }

 console.log("Yugioh price import finished");

}

async function run(){

 await importPokemonPrices();

 await importYugiohPrices();

 console.log("All prices imported");

}

run();