/* ------------------------------------------------------------------ *
 * Hand the annotated blueprint (and JSON) to the device. On a phone this
 * opens the native share sheet (Messages, contacts, Photos, WhatsApp...)
 * via the Web Share API. Elsewhere it falls back to a file download.
 * ------------------------------------------------------------------ */

import { toast } from '../util/dom.ts';

export interface ShareResult {
  shared: boolean;
  downloaded: boolean;
}

export async function shareOrDownload(
  imagePng: Blob,
  measurementsJson: Blob,
): Promise<ShareResult> {
  const imageFile = new File([imagePng], 'room-measurements.png', {
    type: 'image/png',
  });
  const jsonFile = new File([measurementsJson], 'room-measurements.json', {
    type: 'application/json',
  });

  // Prefer sharing the image (+ JSON when the platform allows multiple files).
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (nav.canShare) {
    const withBoth: ShareData = { files: [imageFile, jsonFile] };
    const imageOnly: ShareData = { files: [imageFile] };
    const data = nav.canShare(withBoth)
      ? withBoth
      : nav.canShare(imageOnly)
        ? imageOnly
        : null;
    if (data) {
      try {
        await navigator.share({
          ...data,
          title: 'Room measurements',
          text: 'Measured room sections from the walkthrough.',
        });
        return { shared: true, downloaded: false };
      } catch (err) {
        // user cancelled the sheet — not an error
        if ((err as DOMException)?.name === 'AbortError') {
          return { shared: false, downloaded: false };
        }
        // otherwise fall through to download
      }
    }
  }

  download(imageFile);
  download(jsonFile);
  toast('Saved the annotated blueprint and data to your downloads.');
  return { shared: false, downloaded: true };
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
