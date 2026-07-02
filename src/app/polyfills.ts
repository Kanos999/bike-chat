/**
 * Base64 (btoa/atob) polyfill.
 *
 * React Native's Hermes engine (RN 0.73) does not provide the WHATWG `btoa`/`atob`
 * globals. livekit-client uses `btoa` while establishing the signalling connection,
 * so without this the room connect fails with "Property 'btoa' doesn't exist" and
 * no audio ever flows. Must be imported before livekit-client is used — do it as
 * the very first import of the app entry.
 *
 * Guarded so it becomes a no-op on engines that already provide these (newer Hermes).
 */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encode(input: string): string {
  let output = '';
  let i = 0;
  while (i < input.length) {
    const c1 = input.charCodeAt(i++);
    const c2 = input.charCodeAt(i++);
    const c3 = input.charCodeAt(i++);
    if (c1 > 0xff || c2 > 0xff || c3 > 0xff) {
      throw new Error(
        "Failed to execute 'btoa': characters outside of the Latin1 range."
      );
    }
    const enc1 = c1 >> 2;
    const enc2 = ((c1 & 3) << 4) | (c2 >> 4);
    let enc3 = ((c2 & 15) << 2) | (c3 >> 6);
    let enc4 = c3 & 63;
    if (isNaN(c2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(c3)) {
      enc4 = 64;
    }
    output +=
      B64_CHARS.charAt(enc1) +
      B64_CHARS.charAt(enc2) +
      (enc3 === 64 ? '=' : B64_CHARS.charAt(enc3)) +
      (enc4 === 64 ? '=' : B64_CHARS.charAt(enc4));
  }
  return output;
}

function decode(input: string): string {
  const str = input.replace(/[^A-Za-z0-9+/=]/g, '');
  let output = '';
  let i = 0;
  while (i < str.length) {
    const enc1 = B64_CHARS.indexOf(str.charAt(i++));
    const enc2 = B64_CHARS.indexOf(str.charAt(i++));
    const enc3 = B64_CHARS.indexOf(str.charAt(i++));
    const enc4 = B64_CHARS.indexOf(str.charAt(i++));
    const c1 = (enc1 << 2) | (enc2 >> 4);
    const c2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const c3 = ((enc3 & 3) << 6) | enc4;
    output += String.fromCharCode(c1);
    if (enc3 !== 64) output += String.fromCharCode(c2);
    if (enc4 !== 64) output += String.fromCharCode(c3);
  }
  return output;
}

const g = global as unknown as {
  btoa?: (input: string) => string;
  atob?: (input: string) => string;
};

if (typeof g.btoa !== 'function') {
  g.btoa = encode;
}
if (typeof g.atob !== 'function') {
  g.atob = decode;
}
