/**
 * Insert sample listings (MyHome.ge-style: floor, district, dates).
 * Run: node scripts/seed-sample-listings.js
 */
import { connect, getListingsCollection, close } from "../db/index.js";

const base = new Date();
const day = (d) => new Date(base.getTime() - d * 24 * 60 * 60 * 1000);

const samples = [
  {
    externalId: "sample-1",
    title: "Renovated 2-bedroom, Saburtalo",
    price: 125000,
    area_sqm: 72,
    rooms: 2,
    floor: 5,
    total_floors: 9,
    address: "Vazha-Pshavela Ave 12, Saburtalo",
    district: "Saburtalo",
    description: "Spacious renovated apartment with modern finishes. Quiet building, natural light. Balcony with city view.",
    photos: [
      { url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600&h=400&fit=crop", label: "living room" },
      { url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=600&h=400&fit=crop", label: "bedroom" },
      { url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop", label: "kitchen" },
      { url: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=600&h=400&fit=crop", label: "bathroom" },
      { url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=400&fit=crop", label: "building view from outside" },
    ],
    createdAt: day(14),
    updatedAt: day(1),
  },
  {
    externalId: "sample-2",
    title: "Bright apartment near Vake",
    price: 98000,
    area_sqm: 55,
    rooms: 1,
    floor: 2,
    total_floors: 5,
    address: "Chavchavadze Ave 62, Vake",
    district: "Vake",
    description: "Cozy one-room apartment, recently renovated. Walking distance to cafes and metro.",
    photos: [
      { url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&h=400&fit=crop", label: "renovated room" },
      { url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&h=400&fit=crop", label: "bathroom" },
      { url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=600&h=400&fit=crop", label: "kitchen" },
    ],
    createdAt: day(7),
    updatedAt: day(3),
  },
  {
    externalId: "sample-3",
    title: "Modern 3-room flat, Saburtalo center",
    price: 185000,
    area_sqm: 95,
    rooms: 3,
    floor: 7,
    total_floors: 12,
    address: "Saburtalo Ave 45, Tbilisi",
    district: "Saburtalo",
    description: "Fully renovated 3-room apartment with balcony. Open floor plan, new appliances. Parking included.",
    photos: [
      { url: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&h=400&fit=crop", label: "living room" },
      { url: "https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?w=600&h=400&fit=crop", label: "bedroom" },
      { url: "https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=600&h=400&fit=crop", label: "kitchen" },
      { url: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=600&h=400&fit=crop", label: "balcony" },
    ],
    createdAt: day(2),
    updatedAt: day(0),
  },
  {
    externalId: "sample-4",
    title: "Cozy 1-room in Saburtalo, near metro",
    price: 75000,
    area_sqm: 42,
    rooms: 1,
    floor: 3,
    total_floors: 6,
    address: "Nutsubidze Plateau, Saburtalo",
    district: "Saburtalo",
    description: "Small but fully renovated one-room. Ideal for one person or couple. Metro 5 min walk.",
    photos: [
      { url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&h=400&fit=crop", label: "living room" },
      { url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&h=400&fit=crop", label: "bathroom" },
    ],
    createdAt: day(5),
    updatedAt: day(5),
  },
];

async function main() {
  await connect();
  const coll = getListingsCollection();
  for (const doc of samples) {
    const { createdAt, ...rest } = doc;
    await coll.updateOne(
      { externalId: doc.externalId },
      { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { createdAt } },
      { upsert: true }
    );
  }
  console.log("Seeded", samples.length, "sample listings.");
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
