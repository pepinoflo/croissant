// Screen sizes (portrait, in CSS points) that get a launch image. iOS only
// shows a launch image whose media query matches the device exactly.
export const SPLASH_DEVICES = [
  // iPads
  { w: 744, h: 1133, dpr: 2 }, // mini (6th gen and later)
  { w: 768, h: 1024, dpr: 2 }, // 9.7", mini 5
  { w: 810, h: 1080, dpr: 2 }, // 10.2"
  { w: 820, h: 1180, dpr: 2 }, // 10.9" iPad and Air, Air 11"
  { w: 834, h: 1112, dpr: 2 }, // 10.5"
  { w: 834, h: 1194, dpr: 2 }, // Pro 11"
  { w: 834, h: 1210, dpr: 2 }, // Pro 11" (M4)
  { w: 1024, h: 1366, dpr: 2 }, // Pro 12.9", Air 13"
  { w: 1032, h: 1376, dpr: 2 }, // Pro 13" (M4)
  // iPhones
  { w: 375, h: 667, dpr: 2 },
  { w: 390, h: 844, dpr: 3 },
  { w: 393, h: 852, dpr: 3 },
  { w: 402, h: 874, dpr: 3 },
  { w: 430, h: 932, dpr: 3 },
  { w: 440, h: 956, dpr: 3 },
];

export function splashEntries() {
  return SPLASH_DEVICES.flatMap(({ w, h, dpr }) => [
    { file: `splash/${w * dpr}x${h * dpr}.png`, width: w * dpr, height: h * dpr, media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)` },
    { file: `splash/${h * dpr}x${w * dpr}.png`, width: h * dpr, height: w * dpr, media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: landscape)` },
  ]);
}
