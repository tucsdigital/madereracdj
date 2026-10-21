import QRCode from "qrcode";

/** Generate a self-contained QR image so printing never depends on a third party. */
export async function createMapsQrDataUrl(mapsUrl) {
  const value = String(mapsUrl || "").trim();
  if (!value) return "";

  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
