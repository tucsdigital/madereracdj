import QRCode from "qrcode";

/** Generate a self-contained QR image so printing never depends on a third party. */
async function createQrDataUrl(value) {
  const qrValue = String(value || "").trim();
  if (!qrValue) return "";

  return QRCode.toDataURL(qrValue, {
    errorCorrectionLevel: "H",
    // The print template adds an identical 16px quiet zone around both QR images.
    margin: 0,
    width: 240,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export async function createMapsQrDataUrl(mapsUrl) {
  return createQrDataUrl(mapsUrl);
}

export function buildPhoneTelUri(phoneNumber) {
  const rawPhone = String(phoneNumber || "").trim();
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";

  const internationalPrefix = rawPhone.startsWith("+") ? "+" : "";
  return `tel:${internationalPrefix}${digits}`;
}

export async function createPhoneQrDataUrl(phoneNumber) {
  return createQrDataUrl(buildPhoneTelUri(phoneNumber));
}
