import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("public/wasm", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", {
  recursive: true,
});
const url =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
await mkdir("public/models", { recursive: true });
const path = "public/models/hand_landmarker.task";
let data;
try {
  data = await readFile(path);
} catch {
  const r = await fetch(url);
  if (!r.ok) throw Error(`Model download ${r.status}`);
  data = Buffer.from(await r.arrayBuffer());
  await writeFile(path, data);
}
const checksum = createHash("sha256").update(data).digest("hex");
if (
  checksum !==
  "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1"
)
  throw Error("Hand model checksum mismatch");
await writeFile(
  "public/models/manifest.json",
  JSON.stringify(
    {
      url,
      version: 1,
      sha256: checksum,
    },
    null,
    2,
  ),
);
console.log("Local model and WASM ready");
