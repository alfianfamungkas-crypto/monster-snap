const vision = require("@google-cloud/vision");

const client = new vision.ImageAnnotatorClient();

async function detect(){

 const [result] = await client.textDetection("card-test.png");

 const text = result.textAnnotations[0]?.description;

 console.log(text);

}

detect();