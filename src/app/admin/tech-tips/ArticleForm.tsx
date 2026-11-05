"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Checkbox, Select, TextArea, TextInput, buttonClass } from "@/components/ui";
import { RichTextEditor } from "@/components/admin/editor/RichTextEditor";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import type { PickerAsset } from "@/components/admin/media/types";
import { initialActionState } from "@/lib/forms";
import { saveArticleAction } from "./actions";

export type ArticleFormValues = {
  id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  editorHtml: string;
  categoryId: string;
  featuredImage: PickerAsset | null;
  featuredImageAlt: string;
  seoTitle: string;
  metaDescription: string;
  featured: boolean;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  scheduleAtLocal: string;
};

function Counter({ value, max, ideal }: { value: string; max: number; ideal: string }) {
  return (
    <p className={`mt-[-0.75rem] mb-4 text-sm ${value.length > max ? "font-semibold text-danger" : ""}`}>
      {value.length} characters. {ideal}
    </p>
  );
}

export function ArticleForm({ values, categories }: { values: ArticleFormValues; categories: { id: string; name: string }[] }) {
  const [state, action] = useActionState(saveArticleAction, initialActionState);
  const [content, setContent] = useState(values.editorHtml);
  const [image, setImage] = useState<PickerAsset | null>(values.featuredImage);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seoTitle, setSeoTitle] = useState(values.seoTitle);
  const [meta, setMeta] = useState(values.metaDescription);
  const [excerpt, setExcerpt] = useState(values.excerpt);
  const e = state.fieldErrors ?? {};
  const status = (state.data?.status as ArticleFormValues["status"] | undefined) ?? values.status;

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <FormMessage state={state} />
        <input type="hidden" name="id" value={values.id ?? ""} />
        <input type="hidden" name="content" value={content} />
        <TextInput label="Title" name="title" required defaultValue={values.title} error={e.title} maxLength={160} />
        <TextInput label="URL slug" name="slug" defaultValue={values.slug} error={e.slug} hint="The end of the web address, for example how-to-spot-a-fake-email. Leave blank to create it from the title." />
        <div>
          <TextArea label="Summary" name="excerpt" rows={3} defaultValue={values.excerpt} error={e.excerpt} hint="One or two sentences shown on article cards." onChange={(ev) => setExcerpt(ev.target.value)} />
          <Counter value={excerpt} max={300} ideal="Aim for 120 to 200." />
        </div>
        <div>
          <p id="content-label" className="mb-1 font-semibold text-navy">
            Article content
          </p>
          {e.content && <p className="mb-1 font-semibold text-danger">{e.content}</p>}
          <RichTextEditor initialHtml={values.editorHtml} onChange={setContent} labelId="content-label" />
        </div>
      </div>

      <div className="space-y-5">
        <section className="rounded-lg border border-line bg-white p-4" aria-labelledby="publish-title">
          <h2 id="publish-title" className="text-lg">
            Publishing
          </h2>
          <p className="mt-1">
            Status: <span className="font-semibold">{status === "PUBLISHED" ? "Published" : status === "SCHEDULED" ? "Scheduled" : "Draft"}</span>
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {status === "PUBLISHED" ? (
              <>
                <SubmitButton name="intent" value="keep">
                  Save changes
                </SubmitButton>
                <SubmitButton name="intent" value="unpublish" variant="outline" confirm="Unpublish this article? It will be hidden from the website.">
                  Unpublish
                </SubmitButton>
              </>
            ) : (
              <>
                <SubmitButton name="intent" value="draft" variant="outline">
                  Save draft
                </SubmitButton>
                <SubmitButton name="intent" value="publish" confirm="Publish this article now?">
                  Publish now
                </SubmitButton>
                {status === "SCHEDULED" && (
                  <SubmitButton name="intent" value="unpublish" variant="ghost">
                    Cancel schedule (back to draft)
                  </SubmitButton>
                )}
              </>
            )}
          </div>
          {status !== "PUBLISHED" && (
            <div className="mt-4 border-t border-line pt-4">
              <TextInput label="Publish later (Eastern Time)" name="scheduleAt" type="datetime-local" defaultValue={values.scheduleAtLocal} error={e.scheduleAt} />
              <SubmitButton name="intent" value="schedule" variant="secondary" className="w-full">
                {status === "SCHEDULED" ? "Update schedule" : "Schedule"}
              </SubmitButton>
            </div>
          )}
          {values.id && (
            <p className="mt-4">
              <Link href={`/tech-tips/preview/${values.id}`} target="_blank" className="font-semibold">
                Preview saved version<span className="sr-only"> (opens in a new tab)</span>
              </Link>
            </p>
          )}
          <p className="mt-2 text-sm">Preview shows the last saved version. Save your draft first to preview recent changes.</p>
        </section>

        <section className="rounded-lg border border-line bg-white p-4" aria-labelledby="org-title">
          <h2 id="org-title" className="mb-3 text-lg">
            Organize
          </h2>
          <Select label="Category" name="categoryId" defaultValue={values.categoryId} placeholder="No category" options={categories.map((c) => ({ value: c.id, label: c.name }))} error={e.categoryId} />
          <Checkbox name="featured" label="Feature this article" hint="Featured articles appear at the top of Tech Tips." defaultChecked={values.featured} />
        </section>

        <section className="rounded-lg border border-line bg-white p-4" aria-labelledby="fi-title">
          <h2 id="fi-title" className="mb-3 text-lg">
            Featured image
          </h2>
          <input type="hidden" name="featuredImageId" value={image?.id ?? ""} />
          {image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.thumb} alt="" className="mb-3 w-full rounded-md border border-line" />
              <p className="mb-2 font-semibold">{image.name}</p>
            </>
          ) : (
            <p className="mb-3">No image. A branded placeholder is shown instead.</p>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass("outline", "sm")} onClick={() => setPickerOpen(true)}>
              {image ? "Change image" : "Choose image"}
            </button>
            {image && (
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setImage(null)}>
                Remove image
              </button>
            )}
          </div>
          {e.featuredImageId && <p className="mb-2 font-semibold text-danger">{e.featuredImageId}</p>}
          <TextInput label="Alt text for this article" name="featuredImageAlt" defaultValue={values.featuredImageAlt} hint={image?.altText ? `Leave blank to use: "${image.altText}"` : "Describe what the image shows."} maxLength={300} />
          <MediaPicker
            open={pickerOpen}
            title="Choose a featured image"
            onClose={() => setPickerOpen(false)}
            onSelect={(a) => {
              setImage(a);
              setPickerOpen(false);
            }}
          />
        </section>

        <section className="rounded-lg border border-line bg-white p-4" aria-labelledby="seo-title-h">
          <h2 id="seo-title-h" className="mb-3 text-lg">
            Search engines
          </h2>
          <TextInput label="SEO title" name="seoTitle" defaultValue={values.seoTitle} error={e.seoTitle} hint="Leave blank to use the article title." onChange={(ev) => setSeoTitle(ev.target.value)} />
          <Counter value={seoTitle} max={70} ideal="Up to about 60 shows fully in search results." />
          <TextArea label="Meta description" name="metaDescription" rows={3} defaultValue={values.metaDescription} error={e.metaDescription} hint="Leave blank to use the summary." onChange={(ev) => setMeta(ev.target.value)} />
          <Counter value={meta} max={170} ideal="Aim for 120 to 155." />
        </section>
      </div>
    </form>
  );
}
