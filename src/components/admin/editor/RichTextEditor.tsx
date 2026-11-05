"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { assetTag, variantUrl } from "@/lib/media/urls";

/** Image node that keeps a reference to the Media Library asset (data-media-id). */
const MediaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-media-id": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-media-id"),
        renderHTML: (attrs) => (attrs["data-media-id"] ? { "data-media-id": attrs["data-media-id"] } : {}),
      },
    };
  },
});

function ToolButton({ label, active, onClick, disabled, children }: { label: string; active?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-h-[40px] min-w-[40px] rounded-md px-2.5 font-semibold disabled:opacity-40 ${active ? "bg-navy text-white" : "bg-white text-navy hover:bg-navy-50"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onInsertImage }: { editor: Editor; onInsertImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      p: e.isActive("paragraph"),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      ul: e.isActive("bulletList"),
      ol: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const c = () => editor.chain().focus();
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-soft p-2">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1">
        <ToolButton label="Paragraph" active={s.p} onClick={() => c().setParagraph().run()}>
          Text
        </ToolButton>
        <ToolButton label="Heading" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolButton>
        <ToolButton label="Subheading" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
          H3
        </ToolButton>
        <span className="mx-1 w-px bg-line" aria-hidden="true" />
        <ToolButton label="Bold" active={s.bold} onClick={() => c().toggleBold().run()}>
          <strong>B</strong>
        </ToolButton>
        <ToolButton label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()}>
          <em>I</em>
        </ToolButton>
        <span className="mx-1 w-px bg-line" aria-hidden="true" />
        <ToolButton label="Bulleted list" active={s.ul} onClick={() => c().toggleBulletList().run()}>
          • List
        </ToolButton>
        <ToolButton label="Numbered list" active={s.ol} onClick={() => c().toggleOrderedList().run()}>
          1. List
        </ToolButton>
        <ToolButton label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()}>
          Quote
        </ToolButton>
        <ToolButton
          label="Link"
          active={s.link}
          onClick={() => {
            setUrl(s.href);
            setLinkOpen((o) => !o);
          }}
        >
          Link
        </ToolButton>
        <ToolButton label="Insert image" onClick={onInsertImage}>
          Image
        </ToolButton>
        <span className="mx-1 w-px bg-line" aria-hidden="true" />
        <ToolButton label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()}>
          Undo
        </ToolButton>
        <ToolButton label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()}>
          Redo
        </ToolButton>
      </div>
      {linkOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="link-url" className="font-semibold text-navy">
            Link address
          </label>
          <input
            id="link-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/tech-tips/another-article or https://..."
            className="min-h-[40px] min-w-64 flex-1 rounded-md border-2 border-line px-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <button
            type="button"
            className="min-h-[40px] rounded-md bg-navy px-3 font-semibold text-white"
            onClick={() => {
              const href = url.trim();
              if (!href) c().extendMarkRange("link").unsetLink().run();
              else if (/^(https?:\/\/|\/|mailto:|tel:)/i.test(href)) c().extendMarkRange("link").setLink({ href }).run();
              setLinkOpen(false);
            }}
          >
            Apply link
          </button>
          {s.link && (
            <button type="button" className="min-h-[40px] rounded-md px-3 font-semibold text-navy underline" onClick={() => (c().extendMarkRange("link").unsetLink().run(), setLinkOpen(false))}>
              Remove link
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({ initialHtml, onChange, labelId }: { initialHtml: string; onChange: (html: string) => void; labelId: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, horizontalRule: false, link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"] } }),
      MediaImage.configure({ inline: false, allowBase64: false }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: "prose-kindred article-body min-h-[420px] max-w-none px-5 py-4 text-[1.05rem] leading-[1.75] focus:outline-none",
        "aria-labelledby": labelId,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  if (!editor) return <div className="min-h-[480px] rounded-md border-2 border-line bg-white p-4">Loading editor...</div>;
  return (
    <div className="overflow-hidden rounded-md border-2 border-line bg-white focus-within:border-navy">
      <Toolbar editor={editor} onInsertImage={() => setPickerOpen(true)} />
      <EditorContent editor={editor} />
      <MediaPicker
        open={pickerOpen}
        title="Insert an image"
        onClose={() => setPickerOpen(false)}
        onSelect={(a) => {
          const alt = a.altText || window.prompt("Describe this image for screen reader users (alt text):", "") || "";
          editor.chain().focus().setImage({ src: variantUrl(a.id, assetTag(a.version), 960, "webp"), alt }).updateAttributes("image", { "data-media-id": a.id }).run();
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
