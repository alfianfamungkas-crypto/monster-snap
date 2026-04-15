const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://mheqakdzirlrpslextab.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTY2MzgsImV4cCI6MjA4ODY5MjYzOH0.XwcrXlyF6WB1qK4HNH9wQQ7zn6qp4kQ7tELdMkNClqg";

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadCards() {

  const data = JSON.parse(
    fs.readFileSync("pokemon_cards_clean.json")
  );

  for (let i = 0; i < data.length; i += 500) {

    const batch = data.slice(i, i + 500);

    const { error } = await supabase
      .from("cards")
      .insert(batch);

    if (error) {
      console.log(error);
      return;
    }

    console.log(`Uploaded ${i + batch.length} cards`);

  }

}

uploadCards();