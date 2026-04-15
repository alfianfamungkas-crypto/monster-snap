const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const supabase = createClient(
 "https://mheqakdzirlrpslextab.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZXFha2R6aXJscnBzbGV4dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTY2MzgsImV4cCI6MjA4ODY5MjYzOH0.XwcrXlyF6WB1qK4HNH9wQQ7zn6qp4kQ7tELdMkNClqg"
);
////////////////////////////////////////////////////
// 1️⃣ Card Lookup API
////////////////////////////////////////////////////

app.get("/card/:game/:set/:number", async (req,res)=>{

 const {game,set,number} = req.params;

 console.log(game,set,number);   // letakkan di sini

 const {data,error} = await supabase
  .from("cards")
  .select(`
   card_id,
   card_name,
   card_number,
   rarity,
   image_url,
   sets (
     set_name
   ),
   card_prices (
     price,
     currency,
     source
   )
  `)
  .eq("game",game)
  .eq("set_id",set)
  .eq("card_number",number)
  .limit(1);

 console.log("ERROR:", error);
 console.log("DATA:", data);

 res.json(data);

});

////////////////////////////////////////////////////
// 2️⃣ Search Card
////////////////////////////////////////////////////

app.get("/search", async (req,res)=>{

 const {q} = req.query;

 const {data,error} = await supabase
  .from("cards")
  .select(`
   card_id,
   card_name,
   card_number,
   image_url,
   sets (
     set_name
   )
  `)
  .ilike("card_name", `%${q}%`)
  .limit(20);

 res.json(data);

});

////////////////////////////////////////////////////
// 2️⃣ Search Card
////////////////////////////////////////////////////

app.get("/search", async (req,res)=>{

 const {q} = req.query;

 const {data,error} = await supabase
  .from("cards")
  .select(`
   card_id,
   card_name,
   card_number,
   image_url,
   sets (
     set_name
   )
  `)
  .ilike("card_name", `%${q}%`)
  .limit(20);

 res.json(data);

});

////////////////////////////////////////////////////
// 4️⃣ Market Price
////////////////////////////////////////////////////

app.get("/price/:card_id", async (req,res)=>{

 const {card_id} = req.params;

 const {data,error} = await supabase
  .from("card_prices")
  .select(`
   price,
   currency,
   source
  `)
  .eq("card_id",card_id);

 res.json(data);

});

////////////////////////////////////////////////////
// ADD To COLLECTION
///////////////////////////////////////////////////
app.post("/collection/add", async (req,res)=>{

 const {user_id, card_id} = req.body;

 const {data,error} = await supabase
  .from("user_collections")
  .insert([
   {
    user_id:user_id,
    card_id:card_id,
    quantity:1
   }
  ])
  .select();

 if(error){
  console.log(error);
  return res.json({error:error});
 }

 res.json(data);

});

////////////////////////////////////////////////////
// SEND OTP
///////////////////////////////////////////////////

app.post("/auth/send-otp", express.json(), async (req,res)=>{

 const {phone} = req.body;

 const otp = "1234";

 const {error} = await supabase
  .from("otp_codes")
  .insert({
   phone_number:phone,
   otp_code:otp
  });

 res.json({
  success:true,
  otp:"1234"
 });

});

////////////////////////////////////////////////////
// Verifu OTP
///////////////////////////////////////////////////
app.post("/auth/verify-otp", express.json(), async (req,res)=>{

 const {phone,otp} = req.body;

 const {data} = await supabase
  .from("users")
  .select("*")
  .eq("phone_number",phone)
  .single();

 if(!data){

  const {data:newUser} = await supabase
   .from("users")
   .insert({
    phone_number:phone
   })
   .select()
   .single();

  return res.json(newUser);

 }

 res.json(data);

});

////////////////////////////////////////////////////
// START SERVER
////////////////////////////////////////////////////

app.listen(3000,()=>{

 console.log("Card API running");

});