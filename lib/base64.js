export function unicodeToBase64(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  const binaryString = String.fromCodePoint(...utf8Bytes);
  return btoa(binaryString);
}

export function base64ToUnicode(base64) {
  const binaryString = atob(base64);
  const bytes = Uint8Array.from(binaryString, (char) => char.codePointAt(0));
  return new TextDecoder().decode(bytes);
}
