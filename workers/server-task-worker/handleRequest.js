import { bytesToBase64, base64ToBytes} from '../../lib/base64'

export async function handleRequest(requestData) {
  const body = requestData.base64 ? 
    base64ToBytes(requestData.base64) : requestData.body

  const res = await fetch(requestData.url, {
    method: requestData.method || "GET",
    headers: requestData.headers || {},
    body: body,
  });

  const headers = [];
  for (const [key, value] of res.headers.entries()) {
    headers.push({ [key]: value });
  }

  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const base64 = bytesToBase64(bytes)

  return {
    status: res.status,
    headers,
    body_base64: base64,
  };
}
