/** CLIP: image → vector + best room label. Uses @xenova/transformers. */
import { AutoProcessor, CLIPVisionModelWithProjection, AutoTokenizer, CLIPTextModelWithProjection, RawImage } from "@xenova/transformers";

export const ROOM_LABELS = ["renovated room", "bedroom", "kitchen", "bathroom", "living room", "building view from outside", "unimproved room", "balcony", "city view from balcony", "floor plan", "yard"];

const MODEL = "Xenova/clip-vit-base-patch16";
// CLIP was trained on captions, so "a photo of a kitchen" classifies better than just "kitchen".
const PROMPTS = ROOM_LABELS.map((label) => `a photo of a ${label}`);
// CLIP's learned temperature; turns cosine similarities into softmax probabilities.
const LOGIT_SCALE = 100;

let processor, visionModel, labelVectors;

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export async function loadClip() {
  if (visionModel) return;
  const [proc, vision, tokenizer, textModel] = await Promise.all([
    AutoProcessor.from_pretrained(MODEL),
    CLIPVisionModelWithProjection.from_pretrained(MODEL),
    AutoTokenizer.from_pretrained(MODEL),
    CLIPTextModelWithProjection.from_pretrained(MODEL),
  ]);
  const { text_embeds } = await textModel(tokenizer(PROMPTS, { padding: true, truncation: true }));
  const dim = text_embeds.dims[1];
  labelVectors = ROOM_LABELS.map((_, i) => normalize(Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim))));
  processor = proc;
  visionModel = vision;
}

/** Returns { embedding (unit length, 512 numbers), label, score (0..1 probability) }. */
export async function embedAndClassify(imageBuffer) {
  await loadClip();
  // fromBlob uses sharp in Node, which handles the .webp photos myhome.ge serves.
  const image = await RawImage.fromBlob(new Blob([imageBuffer]));
  const { image_embeds } = await visionModel(await processor(image));
  const embedding = normalize(Array.from(image_embeds.data));

  const logits = labelVectors.map((vec) => LOGIT_SCALE * dot(embedding, vec));
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((s, x) => s + x, 0);
  const best = logits.indexOf(max);
  return { embedding, label: ROOM_LABELS[best], score: exps[best] / total };
}

/** Runs CLIP on each photo one by one (the model already uses all CPU cores per image). */
export async function processPhotos(photos) {
  await loadClip();
  const results = [];
  for (const { url, buffer } of photos) {
    try {
      results.push({ url, ...(await embedAndClassify(buffer)) });
    } catch {
      results.push({ url, embedding: [], label: "unknown", score: 0 });
    }
  }
  return results;
}
