const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
 "https://mheqakdzirlrpslextab.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTY2MzgsImV4cCI6MjA4ODY5MjYzOH0.XwcrXlyF6WB1qK4HNH9wQQ7zn6qp4kQ7tELdMkNClqg"
);

async function searchCard(game,setId,cardNumber){

 const { data, error } = await supabase
   .from("cards")
   .select(`
     card_name,
     card_number,
     rarity,
     image_url,
     sets (
       set_name,
       release_date
     )
   `)
   .eq("game",game)
   .eq("set_id",setId)
   .eq("card_number",cardNumber)
   .limit(1);

 if(error){
   console.log(error);
 }else{
   console.log(data);
 }

}

searchCard("pokemon","sv3","32");