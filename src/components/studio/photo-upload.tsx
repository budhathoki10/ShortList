"use client";

import { ActionToast } from "@/components/toast";
import { useActionState, useEffect, useRef, useState } from "react";
import { removePhotoAction, uploadPhotoAction } from "@/app/actions/templates";
import { StudioIcon as Icon } from "@/components/icons";

/** Upload, replace or remove the profile photo. It's re-encoded on the server and stays private. */
export function PhotoUpload({ photoUrl }: { photoUrl: string | null }) {
  const [state, upload, uploading] = useActionState(uploadPhotoAction, undefined);
  const [removed, remove, removing] = useActionState(removePhotoAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // A photo picked while the page was still loading has no change handler yet: send it once the page is ready.
  useEffect(() => {
    if (input.current?.files?.length) form.current?.requestSubmit();
  }, []);
  // Whichever happened last is the one to confirm, so removing a photo never keeps saying "Photo saved".
  const [last, setLast] = useState<"upload" | "remove">("upload");
  const message = last === "remove" ? removed : state;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-sunken ring-1 ring-border">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, per-user image
          <img src={photoUrl} alt="Your photo" className="size-full object-cover" />
        ) : (
          <Icon name="photo" size={26} className="text-faint" />
        )}
      </div>
      <div className="space-y-2">
        <form
          ref={form}
          action={(data) => {
            setLast("upload");
            upload(data);
          }}
        >
          <label className="inline-flex h-9 cursor-pointer items-center max-sm:h-11 gap-1.5 rounded-lg border border-strong-border bg-surface px-3 text-[13px] font-medium hover:border-strong-border has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent">
            <Icon name="photo" size={15} />
            {uploading ? "Uploading…" : photoUrl ? "Replace photo" : "Add a photo"}
            <input
              ref={input}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={() => form.current?.requestSubmit()}
              disabled={uploading}
            />
          </label>
        </form>
        {photoUrl && (
          <form
            action={() => {
              setLast("remove");
              remove();
            }}
          >
            <button type="submit" disabled={removing} className="text-[13px] text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50 max-sm:min-h-11">
              Remove photo
            </button>
          </form>
        )}
        <p className="text-[12px] text-muted">JPEG, PNG or WebP, up to 3 MB. We crop it square and remove location data.</p>
      </div>
      <div className="w-full">
        <ActionToast state={message} />
      </div>
    </div>
  );
}
