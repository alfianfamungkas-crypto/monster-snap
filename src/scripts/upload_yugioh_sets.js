const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://mheqakdzirlrpslextab.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzExNjYzOCwiZXhwIjoyMDg4NjkyNjM4fQ.rNgYsO-TtUgnPFJbgZOKMc4yakDCBkGlFk2kZhy7nb0"
);

const sets = JSON.parse(
  fs.readFileSync("yugioh_sets_clean.json")
);

async function uploadSets(){

  const { error } = await supabase
    .from("sets")
    .upsert(sets, { onConflict: "id" });

  if(error){
    console.log(error);
  }else{
    console.log("Sets uploaded:", sets.length);
  }

}

uploadSets();