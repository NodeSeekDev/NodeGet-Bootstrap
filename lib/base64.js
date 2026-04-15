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

export function bytesToBase64(bytes) {
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

export function base64ToBytes(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}