// Art direction is independent of quality: presets change sampling, not the
// identity of each location. Imported manifest defaults are overridden here.
export const MAP_LOOKS = Object.freeze({
  'skate-paradise': Object.freeze({
    exposure: 1.02, ambientSky: '#b9cbe5', ambientGround: '#62545b', ambientIntensity: .66,
    keyColor: '#ffd0a0', keyIntensity: 2.5, keyPosition: [-45, 55, -25],
    environmentIntensity: .58,
    fillColor: '#a5bce9', fillIntensity: .5, fillPosition: [155, 40, -155],
    fogColor: '#a29aaa', fogDensity: .00065,
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
    environmentIntensity: .34,
    fillColor: '#a6b8ff', fillIntensity: .68, fillPosition: [38, 24, -45],
  }),
  'grand-warehouse': Object.freeze({
    exposure: 1.02, ambientSky: '#c7d8ed', ambientGround: '#554537', ambientIntensity: .64,
    keyColor: '#ffdcad', keyIntensity: 2.75, keyPosition: [-35, 42, 16],
    environmentIntensity: .28,
    fillColor: '#b8d6ff', fillIntensity: .65, fillPosition: [38, 22, -42],
  }),
});

export function resolveMapLook(id, presentation) {
  return { ...presentation, ...MAP_LOOKS[id] };
}
