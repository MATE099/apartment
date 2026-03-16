/** Test CLIP. Run: node src/test-clip.js (first run downloads ~300MB) */
import { embedAndClassify, loadClip } from "./clip.js";

try {
  await loadClip();
  const res = await fetch("https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/tiger.jpg");
  const buffer = Buffer.from(await res.arrayBuffer());
  const { label, score } = await embedAndClassify(buffer);
  console.log("Label:", label, "Score:", score.toFixed(4));
} catch (err) {
  console.error(err);
  process.exit(1);
}
