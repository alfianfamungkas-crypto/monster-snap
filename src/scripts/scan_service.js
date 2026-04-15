const express = require("express");
const multer = require("multer");
const vision = require("@google-cloud/vision");
const fetch = require("node-fetch");

const app = express();
const upload = multer({ dest: "uploads/" });

const client = new vision.ImageAnnotatorClient();

app.post("/scan", upload.single("image"), async (req,res)=>{

 const [result] = await client.textDetection(req.file.path);

 const text = result.textAnnotations[0]?.description || "";

 const match = text.match(/([a-z]{2,4})\s?(\d{1,3})/i);

 if(!match){
  return res.json({error:"card not detected"});
 }

 const set = match[1].toLowerCase();
 const number = match[2];

const response = await axios.get(
 `http://localhost:3000/card/pokemon/${set}/${number}`
);

const card = response.data[0];

res.json({
 card:{
  id:card.card_id,
  name:card.card_name,
  number:card.card_number,
  rarity:card.rarity,
  image:card.image_url,
  set:card.sets?.set_name
 },
 prices:card.card_prices
});

});

app.listen(4000,()=>{
 console.log("Scanner service running");
});