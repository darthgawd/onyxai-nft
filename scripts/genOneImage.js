import axios from "axios";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import FormData from "form-data";
import "dotenv/config";

const API_KEY = process.env.STABILITY_API_KEY;
if (!API_KEY) {
  console.error("Missing STABILITY_API_KEY in .env");
  process.exit(1);
}

const API_URL = "https://api.stability.ai/v2beta/stable-image/generate/sd3";

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSeed() {
  return parseInt(crypto.randomBytes(4).toString("hex"), 16);
}

function buildPrompt() {
  const subjects = [
    "afrofuturist astronaut",
    "cybernetic lion spirit",
    "ancient masked oracle",
    "neon desert monument",
    "floating crystal entity",
  ];
  const styles = [
    "clean vector illustration",
    "high contrast poster art",
    "minimalist graphic style",
    "sci-fi concept art",
  ];
  const moods = ["mysterious", "uplifting", "intense", "calm"];
  const palette = ["purple and electric blue", "teal and gold", "sunset orange and violet", "black and white with one red accent"];

  const subject = pick(subjects);
  const style = pick(styles);
  const mood = pick(moods);
  const pal = pick(palette);

  return {
    prompt: `${subject}, ${style}, ${mood}, ${pal}, centered composition, no text, no watermark`,
    attributes: [
      { trait_type: "Subject", value: subject },
      { trait_type: "Style", value: style },
      { trait_type: "Mood", value: mood },
      { trait_type: "Palette", value: pal },
    ],
  };
}

async function generateImage(prompt, seedValue) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("seed", String(seedValue));
  form.append("output_format", "png");
  form.append("width", "1024");
  form.append("height", "1024");

  const res = await axios.post(API_URL, form, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...form.getHeaders(),
      Accept: "image/*",
    },
    responseType: "arraybuffer",
    validateStatus: () => true,
  });

  const contentType = (res.headers["content-type"] || "").toLowerCase();

  if (res.status === 402) {
    const text = Buffer.from(res.data).toString("utf8");
    throw new Error(`402 Payment Required. ${text}`);
  }

  if (contentType.includes("application/json")) {
    const text = Buffer.from(res.data).toString("utf8");
    throw new Error(`API returned JSON (${res.status}): ${text}`);
  }

  if (!contentType.startsWith("image/")) {
    const text = Buffer.from(res.data).toString("utf8");
    throw new Error(`Unexpected content-type ${contentType} (${res.status}): ${text}`);
  }

  return Buffer.from(res.data);
}

async function main() {
  const tokenId = Date.now(); // unique id
  const { prompt, attributes } = buildPrompt();

  await fs.ensureDir("output/images");
  await fs.ensureDir("output/drafts");

  console.log("Prompt:", prompt);

  const img = await generateImage(prompt, randomSeed());
  const imagePath = path.join("output/images", `${tokenId}.png`);
  const draftPath = path.join("output/drafts", `${tokenId}.json`);

  await fs.writeFile(imagePath, img);
  await fs.writeJson(draftPath, { tokenId, prompt, attributes }, { spaces: 2 });

  console.log("Image saved:", imagePath);
  console.log("Draft saved:", draftPath);
  console.log("TOKEN_ID:", tokenId);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

