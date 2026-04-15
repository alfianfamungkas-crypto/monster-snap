const fs = require("fs");
const https = require("https");

const url =
"https://raw.githubusercontent.com/henrygd/one-piece-tcg-data/main/cards.json";

https.get(url, res => {

  let data = "";

  res.on("data", chunk => {
    data += chunk;
  });

  res.on("end", () => {

    fs.writeFileSync(
      "onepiece_raw.json",
      data
    );

    console.log("Dataset downloaded");

  });

}).on("error", err => {
  console.log("Error:", err.message);
});