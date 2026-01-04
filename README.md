# onyxai-nft
### What this project does
Step 1 — Generate AI art (Stability AI)

Builds a random prompt (subject + style + mood + palette)

Calls Stability SD3

Saves a PNG image and a matching JSON “draft” file locally

Step 2 — Upload to IPFS (Pinata)

Uploads the PNG to IPFS using Pinata

Builds final NFT metadata JSON (name, description, image link, attributes)

Uploads the metadata JSON to IPFS

Saves a tokenUriMap.json file mapping IDs → tokenURI

Step 3 — Mint on Solana (Devnet)

Reads one tokenURI from tokenUriMap.json

Mints an NFT on Solana devnet using Metaplex
