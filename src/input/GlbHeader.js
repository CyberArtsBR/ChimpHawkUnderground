/** Cheap format boundary check before handing untrusted files to GLTFLoader.
 * Deep rig/GLB parsing and resource budgets are owned by the character/QA agents.
 */
export function isValidGlbHeader(buffer, byteLength) {
  if (!(buffer instanceof ArrayBuffer) || !Number.isInteger(byteLength)) return false;
  if (buffer.byteLength < 20 || byteLength < 20 || byteLength > 35 * 1024 * 1024) return false;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  return magic === 0x46546c67 && version === 2 && declaredLength === byteLength
    && chunkType === 0x4e4f534a && jsonLength >= 2
    && jsonLength % 4 === 0 && jsonLength + 20 <= byteLength;
}
