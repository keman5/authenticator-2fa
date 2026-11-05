import QRCode from "qrcode";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasm from "zxing-wasm/reader/zxing_reader.wasm?url";
import { InputError } from "./records";
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasm : prefix + path,
  },
});
export async function qrImage(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 288,
    margin: 3,
    errorCorrectionLevel: "M",
  });
}
export async function scanImage(blob: Blob): Promise<string[]> {
  if (blob.size > 16_000_000) throw new InputError("invalid");
  const image = await createImageBitmap(blob);
  try {
    if (image.width * image.height > 16_000_000)
      throw new InputError("invalid");
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(image.width, image.height)
        : Object.assign(document.createElement("canvas"), {
            width: image.width,
            height: image.height,
          });
    const ctx = canvas.getContext("2d") as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new InputError("unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.drawImage(image, 0, 0);
    const found = await readBarcodes(
      ctx.getImageData(0, 0, image.width, image.height),
      { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 20 },
    );
    const values = found.map((item) => item.text).filter(Boolean);
    if (!values.length) throw new InputError("invalid");
    return values;
  } finally {
    image.close();
  }
}
