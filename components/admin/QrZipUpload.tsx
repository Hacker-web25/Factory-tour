/**
 * Upload the zip the QR tool produced and get a finished campaign.
 *
 * The browser unzips it, reads the code out of every QR image, shows what it
 * found, and only then creates the campaign with all its people in one step.
 * Nothing is uploaded until the owner presses the button, and the images
 * themselves never leave the browser: only the codes and names do.
 */

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { FOLDER_CHANNELS } from "@/lib/campaignFolders";
import {
  MAX_ZIP_PEOPLE,
  campaignNameFromZip,
  codeFromQrText,
  planFromDecoded,
  zipEntries,
  type DecodedLetter,
  type ZipPlan,
} from "@/lib/qrZip";

const MAX_ZIP_BYTES = 150 * 1024 * 1024;

type Read = { fileName: string; plan: ZipPlan; images: number };

async function decodeImage(bytes: Uint8Array, decode: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) {
  const blob = new Blob([bytes as BlobPart]);
  const bmp = await createImageBitmap(blob);
  try {
    // A QR needs a quiet margin; the image may be cropped tight, so decode on a
    // padded white canvas as well when the plain attempt finds nothing.
    for (const pad of [0, Math.round(Math.max(bmp.width, bmp.height) * 0.12)]) {
      const w = bmp.width + pad * 2;
      const h = bmp.height + pad * 2;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, pad, pad);
      const img = ctx.getImageData(0, 0, w, h);
      const hit = decode(img.data, w, h);
      if (hit?.data) return hit.data;
    }
    return null;
  } finally {
    bmp.close();
  }
}

export function QrZipUpload({ defaultChannel = "pamphlet" }: { defaultChannel?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [channel, setChannel] = useState(defaultChannel);
  const [destination, setDestination] = useState("/");
  const [distributedAt, setDistributedAt] = useState("");
  const [printedCount, setPrintedCount] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setRead(null);
    if (!/\.zip$/i.test(file.name)) {
      setError("Choose the .zip file the QR tool gave you.");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setError("That zip is larger than 150 MB. Split it and upload the parts one at a time.");
      return;
    }
    try {
      const [{ unzipSync }, jsQRmod] = await Promise.all([import("fflate"), import("jsqr")]);
      const jsQR = jsQRmod.default;
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        // Only the images are worth inflating; the letters PDF can be large.
        filter: (f) => /\.(png|jpe?g|webp)$/i.test(f.name) && !f.name.includes("__MACOSX"),
      });
      const entries = zipEntries(Object.keys(files));
      if (!entries.length) {
        setError("No QR images found in that zip. It should hold one folder per person with L_1.png inside.");
        return;
      }

      const decoded: DecodedLetter[] = [];
      setReading({ done: 0, total: entries.length });
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        let code: string | null = null;
        let problem: string | undefined;
        try {
          const text = await decodeImage(files[e.path]!, (d, w, h) => jsQR(d, w, h, { inversionAttempts: "attemptBoth" }));
          if (!text) problem = "No QR code found in this image.";
          else {
            code = codeFromQrText(text);
            if (!code) problem = `The QR does not hold a VPV code (it says “${text.slice(0, 60)}”).`;
          }
        } catch {
          problem = "This image could not be opened.";
        }
        decoded.push({ ...e, code, problem });
        if (i % 8 === 7) {
          setReading({ done: i + 1, total: entries.length });
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const plan = planFromDecoded(decoded);
      setRead({ fileName: file.name, plan, images: entries.length });
      setName(campaignNameFromZip(file.name));
      setPrintedCount(String(plan.people.length));
    } catch {
      setError("Could not open that zip. Check it is the file the QR tool produced.");
    } finally {
      setReading(null);
    }
  }

  async function create() {
    if (!read) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/marketing/folders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({
          name,
          city,
          channel,
          destination,
          distributedAt,
          printedCount,
          people: read.plan.people.map((p) => ({ code: p.code, name: p.name })),
        }),
      });
      const d = (await res.json()) as { ok?: boolean; message?: string; folder?: { slug: string } };
      if (!res.ok || !d.ok || !d.folder) {
        setError(d.message ?? "Could not create the campaign.");
        return;
      }
      router.push(`/admin/marketing/folders/${d.folder.slug}`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const p = read?.plan;

  return (
    <section className="mt-6 rounded-2xl border border-vpv-line bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-[16px] font-semibold">Upload a QR zip</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-vpv-muted">
        Drop in the zip from the QR tool (a folder per person, with their QR image inside). We read the
        code out of every QR, show you what we found, and create the campaign with everyone in it. Up to{" "}
        {MAX_ZIP_PEOPLE.toLocaleString("en-IN")} people at a time.
      </p>

      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => void pick(e.target.files?.[0])}
        className="mt-4 block w-full text-[13.5px] file:mr-3 file:rounded-full file:border-0 file:bg-vpv-blue file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-white"
      />

      {reading && (
        <p className="mt-4 text-[13.5px] text-vpv-muted">
          Reading QR codes… {reading.done} of {reading.total}
        </p>
      )}
      {error && <p className="mt-4 text-[13px] text-red-700">{error}</p>}

      {p && read && (
        <div className="mt-5">
          <p className="text-[14px] font-medium text-vpv-ink">
            Found {p.people.length} code{p.people.length === 1 ? "" : "s"} in {read.images} image
            {read.images === 1 ? "" : "s"}.
          </p>
          {p.unreadable.length > 0 && (
            <p className="mt-1 text-[13px] text-amber-800">
              {p.unreadable.length} image{p.unreadable.length === 1 ? "" : "s"} could not be read:{" "}
              {p.unreadable.slice(0, 3).map((u) => u.path).join(", ")}
              {p.unreadable.length > 3 ? "…" : ""}. They are left out.
            </p>
          )}
          {p.duplicates.length > 0 && (
            <p className="mt-1 text-[13px] text-amber-800">
              {p.duplicates.length} image{p.duplicates.length === 1 ? "" : "s"} repeat a code already seen and
              are left out.
            </p>
          )}
          {p.overflow > 0 && (
            <p className="mt-1 text-[13px] text-amber-800">
              {p.overflow} more people are past the {MAX_ZIP_PEOPLE.toLocaleString("en-IN")} limit. Upload them as a
              second zip.
            </p>
          )}

          <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-vpv-line">
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-vpv-canvas text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                </tr>
              </thead>
              <tbody>
                {p.people.slice(0, 200).map((x) => (
                  <tr key={x.code} className="border-t border-vpv-line">
                    <td className="px-3 py-1.5 tabular-nums text-slate-500">{x.seq}</td>
                    <td className="px-3 py-1.5">{x.name}</td>
                    <td className="px-3 py-1.5 font-mono">{x.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.people.length > 200 && (
            <p className="mt-1 text-[12px] text-vpv-muted">Showing the first 200 of {p.people.length}.</p>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Campaign name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">City</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">How it reaches them</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
              >
                {FOLDER_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">How many printed</span>
              <input
                value={printedCount}
                onChange={(e) => setPrintedCount(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px] tabular-nums"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Handed out on</span>
              <input
                type="date"
                value={distributedAt}
                onChange={(e) => setDistributedAt(e.target.value)}
                className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">Where the codes land</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-lg border border-vpv-line px-3 py-2 text-[14px]"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !name.trim() || p.people.length === 0}
            className="mt-5 rounded-full bg-vpv-blue px-6 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Creating…" : `Create campaign with ${p.people.length} people`}
          </button>
        </div>
      )}
    </section>
  );
}
