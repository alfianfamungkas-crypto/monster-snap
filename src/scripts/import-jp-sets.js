require("dotenv").config();
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://mheqakdzirlrpslextab.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTY2MzgsImV4cCI6MjA4ODY5MjYzOH0.XwcrXlyF6WB1qK4HNH9wQQ7zn6qp4kQ7tELdMkNClqg"
);

// ==========================
// LOAD DATA
// ==========================
const sets = JSON.parse(fs.readFileSync("./jp_sets.json", "utf-8"));

// ==========================
// INSERT
// ==========================
async function run() {
  const { error } = await supabase
    .from("sets")
    .upsert(
      sets.map(s => ({
        id: s.id,
        set_name: s.set_name,
        logo_url: s.logo_url
      })),
      { onConflict: "id" }
    );

  if (error) {
    console.log("❌ INSERT ERROR:", error);
  } else {
    console.log(`✅ JP sets inserted: ${sets.length}`);
  }
}

run();