import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { errorText, useApi } from "@/lib/api";
import { getCompanyLogo, saveCompanyLogo } from "@/server/functions/admin";

/** Scales an image file to at most 600 px wide and returns a compact data URL. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file is not an image."));
      i.src = url;
    });
    const scale = Math.min(1, 600 / img.width, 300 / img.height);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Settings → Company: the logo printed on invoices, vouchers and reports. */
export function LogoUpload() {
  const qc = useQueryClient();
  const q = useApi(["company-logo"], () => getCompanyLogo());
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const logo = q.data?.logo ?? null;

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await saveCompanyLogo({ data: { logo: value } });
      await qc.invalidateQueries({ queryKey: ["company-logo"] });
      toast.success(value ? "Logo uploaded" : "Logo removed");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="font-semibold text-navy">Logo on printed documents</h2>
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex h-28 w-56 items-center justify-center rounded-lg border bg-white p-2">
          <img
            src={logo ?? "/turnkey-logo.png"}
            alt="Company logo"
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            {logo
              ? "Your uploaded logo is printed on invoices, vouchers and reports."
              : "Using the built-in Turnkey Publishers logo. Upload your own PNG or JPG to replace it."}
          </p>
          <div className="flex gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Logo file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  await save(await shrink(f));
                } catch (err) {
                  toast.error(errorText(err));
                }
              }}
            />
            <Button disabled={busy} onClick={() => input.current?.click()}>
              <ImageUp />
              Upload logo
            </Button>
            {logo && (
              <Button variant="outline" disabled={busy} onClick={() => void save(null)}>
                <Trash2 />
                Use default
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
