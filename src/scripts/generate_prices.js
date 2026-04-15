const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
 "https://mheqakdzirlrpslextab.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzExNjYzOCwiZXhwIjoyMDg4NjkyNjM4fQ.rNgYsO-TtUgnPFJbgZOKMc4yakDCBkGlFk2kZhy7nb0"
);

async function generatePrices(){

 let start = 0;
 const limit = 1000;
 let total = 0;

 while(true){

  const { data: cards, error } = await supabase
   .from("cards")
   .select("card_id, rarity")
   .range(start, start + limit - 1);

  if(error){
   console.log(error);
   return;
  }

  if(!cards || cards.length === 0) break;

  let prices = [];

  cards.forEach(card => {

   let price = 1;

   if(card.rarity?.includes("Common")) price = 0.5;
   if(card.rarity?.includes("Uncommon")) price = 1;
   if(card.rarity?.includes("Rare")) price = 5;
   if(card.rarity?.includes("Ultra")) price = 15;
   if(card.rarity?.includes("Secret")) price = 40;

   prices.push({
    card_id: card.card_id,
    price: price,
    currency: "USD",
    source: "estimated_market"
   });

  });

  const { error: insertError } = await supabase
   .from("card_prices")
   .insert(prices);

  if(insertError){
   console.log(insertError);
   return;
  }

  total += prices.length;
  console.log("Generated:", total);

  start += limit;

 }

 console.log("DONE");

}

generatePrices();