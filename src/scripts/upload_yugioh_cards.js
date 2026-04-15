const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://mheqakdzirlrpslextab.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTY2MzgsImV4cCI6MjA4ODY5MjYzOH0.XwcrXlyF6WB1qK4HNH9wQQ7zn6qp4kQ7tELdMkNClqg"
);

const cards = JSON.parse(
  fs.readFileSync("yugioh_cards_ready.json")
);

async function uploadCards(){

  const chunkSize = 500;

  for (let i=0;i<cards.length;i+=chunkSize){

    const chunk = cards.slice(i,i+chunkSize);

    const { error } = await supabase
      .from("cards")
      .insert(chunk);

    if(error){
      console.log(error);
      return;
    }

    console.log("Uploaded:", i + chunk.length);

  }

}

uploadCards();