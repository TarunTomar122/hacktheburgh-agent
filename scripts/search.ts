import { searchDirectory } from "../lib/directory";

async function main() {
  const result = await searchDirectory({ location: "Edinburgh", areaOfLaw: "Accident and injury", limit: 10 });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
