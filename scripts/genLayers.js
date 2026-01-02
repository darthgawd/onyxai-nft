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

const ROOT = process.cwd();
const LAYERS = path.join(ROOT, "layers");

const COUNTS = {
  background: 1,
  body: 1,
  eyes: 1,
  headwear: 1,
  accessory: 1,
};

const PROMPTS = {
  background:
    "minimal abstract gradient background, clean vector style, no text, centered",
  body:
    "stylized character torso silhouette, afro-futurism, vector illustration, centered, plain background",
  eyes:
    "pair of glowing stylized eyes, symmetrical, vector illustration, centered, plain background",
  headwear:
    "futuristic headwear, vector illustration, centered, plain background",
  accessory:
    "single accessory overlay, vector illustration, centered, plain background",
};

function seed(input) {
  return parseInt(
    crypto.createHash("sha1").update(input).digest("hex").slice(0, 8),
    16
  );
}

async function generateImage(prompt, seedValue) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("seed", String(seedValue));
  form.append("output_format", "png");
  form.append("width", "512");
  form.append("height", "512");

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

  // handle 402 / credits cleanly
  if (res.status === 402) {
    const text = Buffer.from(res.data).toString("utf8");
    throw new Error(`402 Payment Required (out of credits / billing). ${text}`);
  }

  // If API returns JSON, decode and throw a readable error
  if (contentType.includes("application/json")) {
    const text = Buffer.from(res.data).toString("utf8");
    throw new Error(`API returned JSON (${res.status}): ${text}`);
  }

  // If it isn't an image, throw
  if (!contentType.startsWith("image/")) {
    const text = Buffer.from(res.data).toString("utf8");
    throw new Error(
      `Unexpected content-type ${contentType} (${res.status}): ${text}`
    );
  }

  // PNG signature check
  const buf = Buffer.from(res.data);
  const isPng =
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47;

  if (!isPng) {
    throw new Error(
      `Response was ${contentType} but not a valid PNG signature (status ${res.status}).`
    );
  }

  return buf;
}

async function main() {
  for (const [category, count] of Object.entries(COUNTS)) {
    const dir = path.join(LAYERS, category);
    fs.ensureDirSync(dir);

    console.log(`Generating ${category} layers...`);

    for (let i = 1; i <= count; i++) {
      const out = path.join(dir, `${category}_${i}.png`);

      // ✅ skip-existing belongs HERE
      if (await fs.pathExists(out)) {
        console.log(`Skipping existing ${out}`);
        continue;
      }

      const img = await generateImage(PROMPTS[category], seed(`${category}-${i}`));
      await fs.writeFile(out, img);
      console.log(`Saved ${out}`);
    }
  }

  console.log("AI layer generation complete.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

