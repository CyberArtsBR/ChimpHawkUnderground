// Art direction is independent of quality: presets change sampling, not the
// identity of each location. Imported manifest defaults are overridden here.
export const MAP_LOOKS = Object.freeze({
  // Enhancement pass (2026-11): lower, warmer sunset key (~18 degrees up), warm
  // haze and stronger reflections of the photographic sky.
  'skate-paradise': Object.freeze({
    exposure: 1.03, ambientSky: '#b9c4e5', ambientGround: '#6a5458', ambientIntensity: .62,
    keyColor: '#ffbc85', keyIntensity: 2.85, keyPosition: [-60, 45, -20],
    environmentIntensity: .8,
    fillColor: '#a5b4e9', fillIntensity: .5, fillPosition: [155, 40, -155],
    fogColor: '#9c8399', fogDensity: .0016,
  }),
  rooftop: Object.freeze({
    exposure: 1.02, ambientSky: '#b9d7ef', ambientGround: '#665044', ambientIntensity: .56,
    keyColor: '#ffdbb1', keyIntensity: 2.35, keyPosition: [-55, 70, 35],
    environmentIntensity: .52, backgroundIntensity: .82,
    fillColor: '#c4dfff', fillIntensity: .38, fillPosition: [45, 26, -60],
  }),
  orbit: Object.freeze({
    exposure: 1.02, ambientSky: '#bed7ee', ambientGround: '#29243d', ambientIntensity: .65,
    keyColor: '#d8e8ff', keyIntensity: 2.65, keyPosition: [-32, 52, 26],
    environmentIntensity: .5,
    fillColor: '#a6b8ff', fillIntensity: .68, fillPosition: [38, 24, -45],
    fogColor: '#141a33', fogDensity: .0011,
  }),
  'grand-warehouse': Object.freeze({
    exposure: 1.02, ambientSky: '#c7d8ed', ambientGround: '#554537', ambientIntensity: .64,
    keyColor: '#ffdcad', keyIntensity: 2.75, keyPosition: [-35, 42, 16],
    environmentIntensity: .28,
    fillColor: '#b8d6ff', fillIntensity: .65, fillPosition: [38, 22, -42],
    // Gentle warm interior haze (was 100 to 225 m).
    fogColor: '#3c3740', fogNear: 45, fogFar: 190,
  }),
});

export function resolveMapLook(id, presentation) {
  return { ...presentation, ...MAP_LOOKS[id] };
}
