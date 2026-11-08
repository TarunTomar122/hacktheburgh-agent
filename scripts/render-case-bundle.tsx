// Writes the Ailsa case bundle as HTML (docs/night-runs/case-bundle/bundle.html), for looking at it.
//   npx tsx scripts/render-case-bundle.tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { renderBundleHtml } from "../lib/caseBundle/render";
import { ailsaProfile } from "./caseBundleFixture";

mkdirSync("docs/night-runs/case-bundle", { recursive: true });
void renderBundleHtml(ailsaProfile(), new Date()).then((html) => {
  writeFileSync("docs/night-runs/case-bundle/bundle.html", html);
  console.log("wrote docs/night-runs/case-bundle/bundle.html");
});
