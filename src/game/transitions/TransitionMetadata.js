import * as THREE from 'three';

export const TRANSITION_TYPE = Object.freeze({
  BOWL: 'BOWL',
  VERT: 'VERT',
  MINI: 'MINI',
  QUARTER: 'QUARTER',
  BANK: 'BANK',
  KICKER: 'KICKER',
  HIP: 'HIP',
  SPINE: 'SPINE',
});

/**
 * Explicit production transition authoring. These names come from the current
 * original Insanity-inspired park manifest. Non-transition grind rails are not
 * included, so gameplay meaning no longer depends on a generic /coping/i regex.
 *
 * Phase 1 keeps geometry sourced from the existing rail paths while the metadata
 * becomes the authoritative semantic description. Bounds/axes are compiled from
 * those paths deterministically below.
 */
export const PRODUCTION_TRANSITION_AUTHORING = Object.freeze({
  ...Object.fromEntries([1, 2].flatMap(area => ['west', 'east'].map(side => [
    `Extension halfpipe ${area} ${side} coping`, Object.freeze({
      id: `extension-halfpipe-${area}-${side}`, type: TRANSITION_TYPE.VERT,
      axisMode: 'LINEAR', supportsVert: true, supportsTransfer: true,
      supportsPump: true, supportsLipTricks: true, cameraHint: 'VERT',
    }),
  ]))),
  'Bowl coping loop': Object.freeze({
    id: 'bowl-main',
    type: TRANSITION_TYPE.BOWL,
    axisMode: 'RADIAL',
    supportsVert: true,
    supportsTransfer: true,
    supportsPump: true,
    supportsLipTricks: true,
    cameraHint: 'BOWL',
  }),
  '02 / western vert wall coping': Object.freeze({
    id: 'western-vert',
    type: TRANSITION_TYPE.VERT,
    axisMode: 'LINEAR',
    supportsVert: true,
    supportsTransfer: true,
    supportsPump: true,
    supportsLipTricks: true,
    cameraHint: 'VERT',
  }),
  '03 / rear mini north coping': Object.freeze({
    id: 'rear-mini-north',
    type: TRANSITION_TYPE.MINI,
    axisMode: 'LINEAR',
    supportsVert: true,
    supportsTransfer: true,
    supportsPump: true,
    supportsLipTricks: true,
    cameraHint: 'MINI',
  }),
  '03 / rear mini south coping': Object.freeze({
    id: 'rear-mini-south',
    type: TRANSITION_TYPE.MINI,
    axisMode: 'LINEAR',
    supportsVert: true,
    supportsTransfer: true,
    supportsPump: true,
    supportsLipTricks: true,
    cameraHint: 'MINI',
  }),
  '04 / eastern quarter coping': Object.freeze({
    id: 'eastern-quarter',
    type: TRANSITION_TYPE.QUARTER,
    axisMode: 'LINEAR',
    supportsVert: true,
    supportsTransfer: true,
    supportsPump: true,
    supportsLipTricks: true,
    cameraHint: 'QUARTER',
  }),
  '05 / hip rail': Object.freeze({
    id: 'central-hip',
    type: TRANSITION_TYPE.HIP,
    axisMode: 'LINEAR',
    geometryRole: 'AREA_ANCHOR',
    supportsVert: false,
    supportsTransfer: false,
    supportsPump: true,
    supportsLipTricks: false,
    cameraHint: 'HIP',
  }),
  '10 / spine handrail': Object.freeze({
    id: 'south-spine',
    type: TRANSITION_TYPE.SPINE,
    axisMode: 'LINEAR',
    geometryRole: 'AREA_ANCHOR',
    supportsVert: false,
    supportsTransfer: false,
    supportsPump: true,
    supportsLipTricks: false,
    cameraHint: 'SPINE',
  }),
  '11 / bank handrail': Object.freeze({
    id: 'east-bank',
    type: TRANSITION_TYPE.BANK,
    axisMode: 'LINEAR',
    geometryRole: 'AREA_ANCHOR',
    supportsVert: false,
    supportsTransfer: false,
    supportsPump: true,
    supportsLipTricks: false,
    cameraHint: 'BANK',
  }),
});

const EPSILON = 1e-8;

function asPoint(value) {
  return new THREE.Vector3(
    Number(value?.[0]) || 0,
    Number(value?.[1]) || 0,
    Number(value?.[2]) || 0,
  );
}

function pathBounds(points) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const point of points) {
    min.min(point);
    max.max(point);
  }
  return { min, max };
}

function pathCenter(points) {
  const center = new THREE.Vector3();
  const count = points.length > 2 && points[0].distanceToSquared(points.at(-1)) < EPSILON
    ? points.length - 1 : points.length;
  for (let i = 0; i < count; i++) center.add(points[i]);
  if (count) center.multiplyScalar(1 / count);
  return center;
}

function linearAxis(points) {
  if (points.length < 2) return null;
  const axis = points.at(-1).clone().sub(points[0]).setY(0);
  return axis.lengthSq() > EPSILON ? axis.normalize() : null;
}

export function compileTransitionMetadata(
  rails = [],
  authoring = PRODUCTION_TRANSITION_AUTHORING,
) {
  const transitions = [];
  for (const rail of rails) {
    const authored = rail?.transition || authoring[rail?.name];
    if (!authored) continue;
    const lipPath = (rail.points || []).map(asPoint);
    if (lipPath.length < 2) continue;
    const bounds = pathBounds(lipPath);
    const center = pathCenter(lipPath);
    transitions.push({
      ...authored,
      geometryRole: authored.geometryRole || (authored.supportsVert ? 'LIP' : 'AREA_ANCHOR'),
      sourceRail: rail.name,
      copingRadius: Number(rail.radius) || 0,
      lipPath,
      lipStart: lipPath[0].clone(),
      lipEnd: lipPath.at(-1).clone(),
      bounds,
      center,
      lipHeight: center.y,
      transitionAxis: authored.axisMode === 'LINEAR' ? linearAxis(lipPath) : null,
    });
  }
  return transitions;
}

export function transitionMetadataCoverage(
  rails = [],
  authoring = PRODUCTION_TRANSITION_AUTHORING,
) {
  const inlineNames = rails.filter(rail => rail.transition).map(rail => rail.name);
  const authoredNames = new Set(inlineNames.length ? inlineNames : Object.keys(authoring));
  const presentNames = new Set(rails.map(rail => rail?.name).filter(Boolean));
  const expectedPresent = [...authoredNames].filter(name => presentNames.has(name));
  const missingAuthoredRails = [...authoredNames].filter(name => !presentNames.has(name));
  const unclassifiedCopingRails = rails
    .filter(rail => /coping/i.test(String(rail?.name || '')) && !authoredNames.has(rail.name))
    .map(rail => rail.name);
  return {
    authoredCount: authoredNames.size,
    presentAuthoredCount: expectedPresent.length,
    missingAuthoredRails,
    unclassifiedCopingRails,
    complete: missingAuthoredRails.length === 0 && unclassifiedCopingRails.length === 0,
  };
}
