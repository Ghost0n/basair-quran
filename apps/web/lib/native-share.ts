/**
 * The phone's own share sheet in the standalone app (@capacitor/share): its
 * web views have no usable Web Share for files (Android has none at all), and
 * a download link does nothing there. Images are written to the app's cache
 * first, then handed to the sheet. Elsewhere `null`: callers use the web path.
 */
import { APP_MODE } from "@/lib/app-mode/config";

async function plugins() {
  if (!APP_MODE) return null;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const [{ Share }, { Directory, Filesystem }] = await Promise.all([import("@capacitor/share"), import("@capacitor/filesystem")]);
  return { Share, Directory, Filesystem };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function cancelled(error: unknown): boolean {
  return /cancel/i.test(error instanceof Error ? error.message : String(error));
}

/** Share images (and an optional text / link) through the phone's sheet. */
export async function nativeShareFiles(
  files: { blob: Blob; name: string }[],
  text: string,
  url?: string | null,
): Promise<"shared" | "cancelled" | null> {
  const native = await plugins();
  if (!native) return null;
  const { Share, Directory, Filesystem } = native;
  const uris: string[] = [];
  for (const file of files) {
    const written = await Filesystem.writeFile({ path: `share/${file.name}`, data: await toBase64(file.blob), directory: Directory.Cache, recursive: true });
    uris.push(written.uri);
  }
  try {
    await Share.share({ files: uris, text, ...(url ? { url } : {}) });
    return "shared";
  } catch (error) {
    if (cancelled(error)) return "cancelled";
    throw error;
  }
}

/** Share a link through the phone's sheet. */
export async function nativeShareLink(title: string, text: string, url: string): Promise<"shared" | "cancelled" | null> {
  const native = await plugins();
  if (!native) return null;
  try {
    await native.Share.share({ title, text, url, dialogTitle: title });
    return "shared";
  } catch (error) {
    if (cancelled(error)) return "cancelled";
    throw error;
  }
}
