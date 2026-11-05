import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MemoryStore, setTestStorage } from "@/lib/storage";
import { assignSlot, clearSlot, createAssetFromUpload, deleteAsset, getAssetUsage, getPageImages, getVariant, MediaValidationError, replaceAssetFile, setAssetCrop } from "@/lib/media/service";
import { ingestImage } from "@/lib/media/process";
import { duplicateArticle, getPublicArticle, listPublicArticles, publishDueScheduled, renderArticleHtml, saveArticle, setArticlesStatus, type ArticleInput } from "@/lib/articles/service";
import { resetDb } from "../helpers/db";

let store: MemoryStore;
beforeEach(async () => {
  await resetDb();
  store = new MemoryStore();
  setTestStorage(store);
});
afterAll(() => setTestStorage(null));

async function photo(width = 1600, height = 1200, withGps = false) {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 71, g: 124, b: 50 } } }).jpeg();
  return withGps
    ? img.withExif({ IFD0: { Make: "TestCam", Model: "X1" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 21/1 30/1", GPSLongitudeRef: "W", GPSLongitude: "81/1 26/1 0/1" } }).toBuffer()
    : img.toBuffer();
}

const baseInput = (over: Partial<ArticleInput> = {}): ArticleInput => ({
  title: "How to Test Things",
  slug: "",
  excerpt: "A short summary.",
  content: "<p>" + "Helpful words. ".repeat(20) + "</p>",
  categoryId: "",
  featuredImageId: "",
  featuredImageAlt: "",
  seoTitle: "",
  metaDescription: "",
  featured: false,
  ...over,
});

describe("image processing", () => {
  it("removes EXIF and GPS metadata on upload", async () => {
    const input = await photo(1600, 1200, true);
    expect((await sharp(input).metadata()).exif).toBeTruthy();
    const out = await ingestImage(input);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.buffer.includes(Buffer.from("TestCam"))).toBe(false);
  });
  it("rejects non-images, GIFs, tiny images and oversized files", async () => {
    await expect(ingestImage(Buffer.from("not an image"))).rejects.toThrow(MediaValidationError);
    const gif = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fff" } }).gif().toBuffer();
    await expect(ingestImage(gif)).rejects.toThrow(/JPG, PNG, and WebP/);
    await expect(ingestImage(await photo(100, 100))).rejects.toThrow(/at least 200/);
    await expect(ingestImage(Buffer.alloc(16 * 1024 * 1024))).rejects.toThrow(/15 MB/);
  });
  it("downsizes very large photos for the master copy", async () => {
    const out = await ingestImage(await photo(4800, 3200));
    expect(Math.max(out.width, out.height)).toBe(3200);
  });
});

describe("media library", () => {
  it("stores uploads in object storage and serves cached responsive variants", async () => {
    const asset = await createAssetFromUpload({ buffer: await photo(), filename: "kitchen_table-help.jpg" });
    expect(asset.name).toBe("kitchen table help");
    expect(store.objects.has(asset.masterKey)).toBe(true);
    const v = await getVariant(asset.id, `a${asset.version}`, 640, "webp");
    expect(v?.immutable).toBe(true);
    expect((await sharp(v!.body).metadata()).width).toBe(640);
    expect(store.objects.has(`variants/${asset.id}/a1/640.webp`)).toBe(true);
    expect(await getVariant(asset.id, "a1", 777, "webp")).toBeNull(); // only fixed widths
    expect(await getVariant(asset.id, "bogus", 640, "webp")).toBeNull();
  });

  it("never uses the temporary filesystem in production, and uses S3 when configured", async () => {
    const { resolveStorage } = await import("@/lib/storage");
    expect(resolveStorage({ s3: undefined, isProduction: true })).toBeNull();
    expect(resolveStorage({ s3: undefined, isProduction: false })?.name).toBe("local");
    expect(resolveStorage({ s3: { bucket: "b", region: "auto", endpoint: "https://s3.example.com", accessKeyId: "k", secretAccessKey: "s" }, isProduction: true })?.name).toBe("s3");
  });

  it("applies slot crops, tracks usage, blocks deleting used images, and updates on replace", async () => {
    const asset = await createAssetFromUpload({ buffer: await photo(2000, 1000), filename: "hero.jpg", altText: "Helping with a tablet" });
    await assignSlot({ slotKey: "home-hero", assetId: asset.id, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, focal: { x: 0.3, y: 0.4 }, mobileFocal: { x: 0.6, y: 0.5 } });
    const imgs = await getPageImages(["home-hero", "about-owner"]);
    expect(Object.keys(imgs)).toEqual(["home-hero"]);
    expect(imgs["home-hero"]).toMatchObject({ width: 1000, height: 1000, alt: "Helping with a tablet", focal: { x: 0.3, y: 0.4 }, mobileFocal: { x: 0.6, y: 0.5 } });
    const v = await getVariant(asset.id, imgs["home-hero"].tag, 480, "jpg");
    const meta = await sharp(v!.body).metadata();
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(480); // square crop applied

    expect((await getAssetUsage(asset.id)).map((u) => u.kind)).toEqual(["slot"]);
    await expect(deleteAsset(asset.id)).rejects.toThrow(/still used/);

    const replaced = await replaceAssetFile({ assetId: asset.id, buffer: await photo(1200, 1200), filename: "new.jpg" });
    expect(replaced.version).toBe(2);
    const after = await getPageImages(["home-hero"]);
    expect(after["home-hero"].tag).not.toBe(imgs["home-hero"].tag); // new URL, so caches never show the old photo
    expect(after["home-hero"].width).toBe(1200); // crop reset for the new photo

    await clearSlot("home-hero");
    await deleteAsset(asset.id);
    expect(await prisma.mediaAsset.count()).toBe(0);
    expect([...store.objects.keys()].filter((k) => k.includes(asset.id))).toEqual([]);
  });

  it("asset crop changes produce a new version and URL", async () => {
    const asset = await createAssetFromUpload({ buffer: await photo(), filename: "a.jpg" });
    const updated = await setAssetCrop({ assetId: asset.id, crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, focalX: 0.2, focalY: 0.8 });
    expect(updated.version).toBe(asset.version + 1);
    const stale = await getVariant(asset.id, `a${asset.version}`, 320, "webp");
    expect(stale?.immutable).toBe(false); // stale URLs are served briefly but never cached long-term
  });
});

describe("Tech Tips publishing", () => {
  it("keeps drafts and future scheduled articles private, and publishes on time", async () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const draft = await saveArticle({ input: baseInput({ title: "Draft Tip" }), intent: "draft", now });
    const live = await saveArticle({ input: baseInput({ title: "Live Tip" }), intent: "publish", now });
    const later = await saveArticle({ input: baseInput({ title: "Later Tip" }), intent: "schedule", scheduleAt: new Date("2026-11-12T15:00:00Z"), now });
    expect(await getPublicArticle(draft.slug, now)).toBeNull();
    expect(await getPublicArticle(later.slug, now)).toBeNull();
    expect(await getPublicArticle(live.slug, now)).not.toBeNull();
    expect((await listPublicArticles({ now })).items.map((a) => a.title)).toEqual(["Live Tip"]);

    // After the scheduled time it is visible even before the worker runs...
    const after = new Date("2026-11-12T15:01:00Z");
    expect(await getPublicArticle(later.slug, after)).not.toBeNull();
    // ...and the worker marks it PUBLISHED.
    expect(await publishDueScheduled(after)).toEqual({ published: 1 });
    expect((await prisma.article.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("PUBLISHED");
  });

  it("rejects scheduling in the past and publishing empty articles", async () => {
    const now = new Date("2026-11-10T12:00:00Z");
    await expect(saveArticle({ input: baseInput(), intent: "schedule", scheduleAt: new Date("2026-11-01T00:00:00Z"), now })).rejects.toThrow(/future/);
    await expect(saveArticle({ input: baseInput({ content: "<p>Hi</p>" }), intent: "publish", now })).rejects.toThrow(/content/);
  });

  it("sanitizes content, creates unique slugs, and avoids reserved slugs", async () => {
    const a = await saveArticle({ input: baseInput({ title: "Same Title", content: '<p onclick="x">' + "Text ".repeat(30) + '<script>bad()</script></p>' }), intent: "draft" });
    expect(a.content).not.toMatch(/script|onclick/);
    const b = await saveArticle({ input: baseInput({ title: "Same Title" }), intent: "draft" });
    expect(b.slug).toBe("same-title-2");
    await expect(saveArticle({ id: b.id, input: baseInput({ title: "Same Title", slug: "same-title" }), intent: "draft" })).rejects.toThrow(/already used/);
    const r = await saveArticle({ input: baseInput({ title: "Preview" }), intent: "draft" });
    expect(r.slug).not.toBe("preview");
  });

  it("bulk publishes and unpublishes, and duplicates as a draft", async () => {
    const a = await saveArticle({ input: baseInput({ title: "One" }), intent: "draft" });
    const b = await saveArticle({ input: baseInput({ title: "Two" }), intent: "draft" });
    expect((await setArticlesStatus([a.id, b.id], "publish")).changed).toBe(2);
    expect((await listPublicArticles({})).total).toBe(2);
    expect((await setArticlesStatus([a.id], "unpublish")).changed).toBe(1);
    expect((await listPublicArticles({})).total).toBe(1);
    const copy = await duplicateArticle(b.id);
    expect(copy.status).toBe("DRAFT");
    expect(copy.slug).toBe("two-copy");
  });

  it("renders inline images responsively and removes missing ones", async () => {
    const asset = await createAssetFromUpload({ buffer: await photo(), filename: "router.jpg", altText: "A home Wi-Fi router" });
    const html = await renderArticleHtml(`<p>x</p><img data-media-id="${asset.id}" alt=""><img data-media-id="cmmissing0000000000">`);
    expect(html).toContain("<picture>");
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('alt="A home Wi-Fi router"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("cmmissing");
    const art = await saveArticle({ input: baseInput({ content: `<p>${"Words ".repeat(20)}</p><img data-media-id="${asset.id}" alt="x">` }), intent: "draft" });
    expect((await getAssetUsage(asset.id)).map((u) => u.kind)).toEqual(["inline"]);
    expect(art.content).toContain(`data-media-id="${asset.id}"`);
  });
});

describe("seed", () => {
  it("adds 20 draft articles once and never overwrites edits", () => {
    const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL!, SEED_SAMPLE_DATA: "false", NODE_ENV: "development" } as NodeJS.ProcessEnv;
    execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "pipe" });
    return (async () => {
      expect(await prisma.article.count({ where: { status: "DRAFT", seedKey: { not: null } } })).toBe(20);
      expect(await prisma.articleCategory.count()).toBe(9);
      const one = await prisma.article.findFirstOrThrow({ where: { seedKey: "fake-email" } });
      await prisma.article.update({ where: { id: one.id }, data: { title: "My edited title" } });
      execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "pipe" });
      expect(await prisma.article.count()).toBe(20);
      expect((await prisma.article.findUniqueOrThrow({ where: { id: one.id } })).title).toBe("My edited title");
    })();
  }, 120_000);
});
