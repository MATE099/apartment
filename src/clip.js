/** CLIP: image → vector + best room label. Uses @xenova/transformers. */
import fs from "fs";
import os from "os";
import path from "path";
import { AutoProcessor, CLIPVisionModelWithProjection, AutoTokenizer, CLIPTextModelWithProjection, RawImage } from "@xenova/transformers";

export const ROOM_LABELS = ["renovated room", "bedroom", "kitchen", "bathroom", "living room", "building view from outside", "unimproved room", "balcony", "city view from balcony", "floor plan", "yard"];

const MODEL = "Xenova/clip-vit-base-patch16";
let processor, visionModel, tokenizer, textModel, textEmbeds;

export async function loadClip() {
  if (visionModel) return;
  [processor, visionModel, tokenizer, textModel] = await Promise.all([
    AutoProcessor.from_pretrained(MODEL),
    CLIPVisionModelWithProjection.from_pretrained(MODEL),
    AutoTokenizer.from_pretrained(MODEL),
    CLIPTextModelWithProjection.from_pretrained(MODEL),
  ]);
  const { text_embeds } = await textModel(tokenizer(ROOM_LABELS, { padding: true, truncation: true }));
  textEmbeds = text_embeds;
}

async function bufferToRawImage(buf) {
  try {
    return await RawImage.fromBlob(new Blob([buf], { type: "image/jpeg" }));
  } catch {
    const tmp = path.join(os.tmpdir(), `clip-${Date.now()}.jpg`);
    fs.writeFileSync(tmp, buf);
    try {
      return await RawImage.read(tmp);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
}

function cosine(a, b) {
  let dot = 0, la = 0, lb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    la += a[i] * a[i];
    lb += b[i] * b[i];
  }
  const d = Math.sqrt(la) * Math.sqrt(lb);
  return d === 0 ? 0 : dot / d;
}

export async function embedAndClassify(imageBuffer) {
  if (!visionModel || !textEmbeds) await loadClip();
  const raw = await bufferToRawImage(imageBuffer);
  const { image_embeds } = await visionModel(await processor(raw));
  const vec = Array.from(image_embeds.data);
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  const embedding = vec.map((x) => x / norm);

  const dim = embedding.length;
  let bestLabel = ROOM_LABELS[0], bestScore = -1;
  for (let i = 0; i < ROOM_LABELS.length; i++) {
    const textVec = Array.from(textEmbeds.data.slice(i * dim, (i + 1) * dim));
    const score = cosine(embedding, textVec);
    if (score > bestScore) { bestScore = score; bestLabel = ROOM_LABELS[i]; }
  }
  return { embedding, label: bestLabel, score: bestScore };
}

export async function processPhotos(photos) {
  if (!photos.length) return [];
  await loadClip();
  return Promise.all(photos.map(async ({ url, buffer }) => {
    try {
      const r = await embedAndClassify(buffer);
      return { url, ...r };
    } catch {
      return { url, embedding: [], label: "unknown", score: 0 };
    }
  }));
}
