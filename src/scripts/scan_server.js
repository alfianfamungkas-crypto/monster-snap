const express = require("express");
const multer = require("multer");
const vision = require("@google-cloud/vision");
const axios = require("axios");
const fs = require("fs");

const app = express();

const upload = multer({ dest: "uploads/" });

const client = new vision.ImageAnnotatorClient({
 keyFilename: "./vision-key.json"
});

/*
 POST /scan
*/
app.post("/scan", upload.single("image"), async (req, res) => {

 try {

  const [result] = await client.textDetection(req.file.path);

  const text = result.textAnnotations[0]?.description || "";

  console.log("OCR TEXT:");
  console.log(text);

  const numberMatch = text.match(/(\d{1,3})\/\d{2,3}/);

  if (!numberMatch) {
   return res.json({
    error: "Card number not detected"
   });
  }

  const number = parseInt(numberMatch[1], 10);

  const set = "sv3";

  const response = await axios.get(
   `http://localhost:3000/card/pokemon/${set}/${number}`
  );

  const card = response.data[0];

  fs.unlinkSync(req.file.path);

  res.json({

    success:true,

    card:{
        id:card.card_id,
        name:card.card_name,
        number:card.card_number,
        rarity:card.rarity,
        set:card.sets?.set_name,
        image:card.image_url
    },

    market_price:{
        currency:"USD",
        price: card.card_prices?.[0]?.price || null,
        source: card.card_prices?.[0]?.source || null
    },

    actions:{
        add_to_collection:true
    }

  });

  app.post("/collection/add", express.json(), async (req,res)=>{

    const {user_id, card_id} = req.body;

    const {data,error} = await axios.post(
    "http://localhost:3000/collection/add",
    {
        user_id:user_id,
        card_id:card_id
    }
   );

 if(error){
  return res.json({error:error});
 }

 res.json({
  success:true,
  message:"Card added to collection"
 });

});

 } catch (err) {

  console.log(err);

  res.json({
   error: "Scan failed"
  });

 }

});

app.listen(4000, () => {
 console.log("Scanner API running on port 4000");
});