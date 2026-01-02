import fs from "fs-extra";
import path from "path";
import { Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");
const TOKEN_URI_MAP = path.join(OUTPUT, "tokenUriMap.json");
const OUT_FILE = path.join(OUTPUT, "solanaMintOneResult.json");

const KEYPAIR_PATH = path.join(process.env.HOME, ".config/solana/id.json");

function ipfsToHttps(uri) {
  if (uri?.startsWith("ipfs://")) {
    return uri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
  }
  return uri;
}

async function main() {
  const tokenUriMap = await fs.readJson(TOKEN_URI_MAP);
  const ids = Object.keys(tokenUriMap);

  if (!ids.length) {
    console.error("tokenUriMap.json is empty.");
    process.exit(1);
  }

  // Pick the first ID (stable test)
  const id = ids[0];
  const uri = ipfsToHttps(tokenUriMap[id]);

  const secret = await fs.readJson(KEYPAIR_PATH);
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));

  console.log(`Minting ONE NFT for ID: ${id}`);
  console.log(`Metadata URI: ${uri}`);

  const { nft } = await metaplex.nfts().create({
    uri,
    name: `OnyxAI #${id}`,
    sellerFeeBasisPoints: 500, // 5%
  });

  const mint = nft.address.toBase58();

  const result = { id, uri, mint, network: "devnet" };
  await fs.writeJson(OUT_FILE, result, { spaces: 2 });

  console.log("\n✅ Minted!");
  console.log("Mint address:", mint);
  console.log("Saved:", OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
