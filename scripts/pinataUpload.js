import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import fse from "fs-extra";
import path from "path";
import "dotenv/config";

const PINATA_JWT = process.env.PINATA_JWT;
if (!PINATA_JWT) {
  console.error("Missing PINATA_JWT in .env");
  process.exit(1);
}

const IMAGES_DIR = path.join(process.cwd(), "output", "images");
const DRAFTS_DIR = path.join(process.cwd(), "output", "drafts");
const OUT_DIR = path.join(process.cwd(), "output");

const IMAGE_CACHE_PATH = path.join(OUT_DIR, "imageUploadCache.json");

// maps id -> ipfs://...
let imageCache = {};

const METADATA_CACHE_PATH = path.join(OUT_DIR, "metadataUploadCache.json");

// maps id -> tokenURI
let metadataCache = {};



function idFromFilename(filename) {
  // expects "<ID>.png" or "<ID>.json"
  const base = path.basename(filename, path.extname(filename));
  // allow only digits to avoid weird matches
  return /^\d+$/.test(base) ? base : null;
}

async function pinFile(filepath, name, keyvalues = {}) {
  const data = new FormData();
  data.append("file", fs.createReadStream(filepath));
  data.append("pinataMetadata", JSON.stringify({ name, keyvalues }));

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
    maxBodyLength: Infinity,
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      ...data.getHeaders(),
    },
  });

  return res.data.IpfsHash;
}

async function pinJSON(json, name, keyvalues = {}) {
  // Pinata accepts metadata wrapper fields on JSON pin too
  const payload = {
    pinataMetadata: { name, keyvalues },
    pinataContent: json,
  };

  const res = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", payload, {
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
  });

  return res.data.IpfsHash;
}

async function main() {
  await fse.ensureDir(OUT_DIR);
  
  // Load caches (if they exist)
if (await fse.pathExists(IMAGE_CACHE_PATH)) {
  imageCache = await fse.readJson(IMAGE_CACHE_PATH);
}
if (await fse.pathExists(METADATA_CACHE_PATH)) {
  metadataCache = await fse.readJson(METADATA_CACHE_PATH);
}


  const imageFiles = (await fse.readdir(IMAGES_DIR))
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();

  if (imageFiles.length === 0) {
    console.error(`No PNG images found in ${IMAGES_DIR}`);
    process.exit(1);
  }

  const results = [];
  const tokenUriMap = {};

  for (const file of imageFiles) {
    const id = idFromFilename(file);
    if (!id) {
      console.log(`Skipping (filename not numeric ID): ${file}`);
      continue;
    }

    const imagePath = path.join(IMAGES_DIR, file);
    const draftPath = path.join(DRAFTS_DIR, `${id}.json`);

    if (!(await fse.pathExists(draftPath))) {
      console.log(`Skipping ${file} (no matching draft: ${draftPath})`);
      continue;
    }

// ✅ ONLY UPLOAD IF NOT ALREADY IN CACHE
let imageURI = imageCache[id];

if (!imageURI) {
  console.log(`\n[${id}] Uploading NEW image: ${file}`);
  const imageHash = await pinFile(imagePath, `OnyxAI-Image-${id}`, {
    project: "onyxai-nft",
    id,
    kind: "image",
  });
  imageURI = `ipfs://${imageHash}`;
  imageCache[id] = imageURI;

  // save after each new upload so reruns skip it
  await fse.writeJson(IMAGE_CACHE_PATH, imageCache, { spaces: 2 });

  console.log(`[${id}] Image URI: ${imageURI}`);
} else {
  console.log(`\n[${id}] Skipping (already uploaded): ${imageURI}`);
}


    const draft = await fse.readJson(draftPath);

    // Build final metadata
    const metadata = {
      name: `OnyxAI #${id}`, // keep your ID visible; you can change later
      description:
        "AI-generated NFT collection minted on Sepolia. Generated and uploaded via JavaScript automation.",
      image: imageURI,
      attributes: [
        ...(draft.attributes || []),
        ...(draft.prompt ? [{ trait_type: "Prompt", value: draft.prompt }] : []),
        { trait_type: "Generation ID", value: String(draft.tokenId || id) },
        { trait_type: "Network", value: "Sepolia Testnet" },
      ],
    };

// ✅ ONLY UPLOAD METADATA IF NOT ALREADY UPLOADED
let tokenURI = metadataCache[id];

if (!tokenURI) {
  console.log(`[${id}] Uploading NEW metadata JSON...`);

  const metaHash = await pinJSON(metadata, `OnyxAI-Metadata-${id}`, {
    project: "onyxai-nft",
    id,
    kind: "metadata",
  });

  tokenURI = `ipfs://${metaHash}`;
  metadataCache[id] = tokenURI;

  // persist metadata cache immediately
  await fse.writeJson(METADATA_CACHE_PATH, metadataCache, { spaces: 2 });

  console.log(`[${id}] Token URI: ${tokenURI}`);
} else {
  console.log(`[${id}] Skipping metadata upload (already uploaded): ${tokenURI}`);
}

tokenUriMap[id] = tokenURI;
results.push({ id, imageURI, tokenURI });

  }

  await fse.writeJson(path.join(OUT_DIR, "tokenUriMap.json"), tokenUriMap, { spaces: 2 });
  await fse.writeJson(path.join(OUT_DIR, "uploadResults.json"), results, { spaces: 2 });

  console.log(`\nDone.`);
  console.log(`Saved output/tokenUriMap.json (ID -> tokenURI)`);
  console.log(`Saved output/uploadResults.json (full details)`);
}

main().catch((e) => {
  const msg =
    e?.response?.data?.toString?.() ||
    e?.response?.data ||
    e.message ||
    String(e);
  console.error("\nERROR:", msg);
  process.exit(1);
});

