const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabase = createClient(
"https://mheqakdzirlrpslextab.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTY2MzgsImV4cCI6MjA4ODY5MjYzOH0.XwcrXlyF6WB1qK4HNH9wQQ7zn6qp4kQ7tELdMkNClqg"
);

const sets = JSON.parse(fs.readFileSync("pokemon_sets.json"));

async function upload() {

const { data, error } = await supabase
.from("sets")
.insert(sets);

if (error) {
console.log(error);
} else {
console.log("Sets uploaded successfully");
}

}

upload();