"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormMessage, SubmitButton } from "@/components/forms";
import { TextArea, TextInput, buttonClass } from "@/components/ui";
import { CropEditor, FocalPointPicker } from "@/components/admin/media/CropEditor";
import { Uploader } from "@/components/admin/media/Uploader";
import type { CropFractions } from "@/components/admin/media/types";
import { initialActionState, type ActionState } from "@/lib/forms";
import { saveAssetCropAction, updateAssetDetailsAction } from "../actions";

type AssetProps = {
  id: string;
  name: string;
  altText: string;
  description: string;
  source: string;
  license: string;
  attribution: string;
  crop: CropFractions | null;
  focal: { x: number; y: number };
  originalSrc: string;
};

export function AssetDetailsForm({ asset }: { asset: AssetProps }) {
  const [state, action] = useActionState(updateAssetDetailsAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={asset.id} />
      <TextInput label="Name" name="name" required defaultValue={asset.name} />
      <TextInput
        label="Alt text"
        name="altText"
        defaultValue={asset.altText}
        maxLength={300}
        hint="Describe what the photo shows for people using screen readers, for example: An older man video calling his family on a tablet at a kitchen table. Do not start with 'Image of'."
      />
      <TextArea label="Description (internal)" name="description" rows={3} defaultValue={asset.description} />
      <div className="grid gap-x-4 md:grid-cols-2">
        <TextInput label="Source" name="source" defaultValue={asset.source} hint="For example: Owner photo, or the stock site." />
        <TextInput label="License" name="license" defaultValue={asset.license} hint="Record the license so it can be checked later." />
      </div>
      <TextInput label="Attribution (if required by the license)" name="attribution" defaultValue={asset.attribution} />
      <SubmitButton>Save details</SubmitButton>
    </form>
  );
}

export function AssetCropForm({ asset }: { asset: AssetProps }) {
  const router = useRouter();
  const [crop, setCrop] = useState<CropFractions | null>(asset.crop);
  const [focal, setFocal] = useState(asset.focal);
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      {result && <FormMessage state={result} />}
      <p className="mb-3">This crop is the default wherever the image is used in Tech Tips. Page image slots have their own crop settings.</p>
      <CropEditor src={asset.originalSrc} initial={asset.crop} onChange={setCrop} allowPresets />
      <div className="mt-6">
        <FocalPointPicker src={asset.originalSrc} value={focal} onChange={setFocal} label="Focal point" />
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveAssetCropAction(asset.id, crop, focal);
            setResult(r);
            router.refresh();
          })
        }
        className={buttonClass("primary", "md", "mt-5")}
      >
        {pending ? "Saving..." : "Save crop and focal point"}
      </button>
    </div>
  );
}

export function ReplaceImage({ assetId }: { assetId: string }) {
  const router = useRouter();
  return <Uploader replaceAssetId={assetId} multiple={false} label="Choose replacement photo" compact onUploaded={() => router.refresh()} />;
}
