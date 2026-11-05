// Material tags are authored on collision contacts/rails. Never infer sound from
// a mesh's arbitrary name: imported names are not a reliable material contract.
const profile = values => Object.freeze(values);
export const SURFACE_AUDIO = Object.freeze({
  neutral: profile({ roll: 1, texture: 1, rollPitch: 1, scrapePitch: 1, resonance: 1.65 }),
  concrete: profile({ roll: 1, texture: 1.12, rollPitch: 1, scrapePitch: .78, resonance: .8 }),
  wood: profile({ roll: .9, texture: .6, rollPitch: .72, scrapePitch: .62, resonance: .65 }),
  metal: profile({ roll: .72, texture: .75, rollPitch: 1.32, scrapePitch: 1.16, resonance: 2.1 }),
  rubber: profile({ roll: .62, texture: .32, rollPitch: .55, scrapePitch: .48, resonance: .5 }),
});

export function validatedSurfaceTag(value) {
  return typeof value === 'string' && Object.hasOwn(SURFACE_AUDIO, value) ? value : 'neutral';
}

// Explicit author metadata is inherited through imported scene groups. A
// malformed override becomes neutral instead of silently guessing a material.
export function authoredSurfaceTag(object) {
  for (let node=object;node;node=node.parent) {
    const value=node.userData?.audioSurfaceTag ?? node.userData?.surfaceType;
    if (value!==undefined) return validatedSurfaceTag(value);
  }
  return null;
}

// Shipping material identities inspected in the supplied GLBs. This registry
// is deliberately exact: object names and arbitrary substring guesses never
// determine sound. Blender numeric material instances share the same finish.
const SHIPPING_MATERIAL_AUDIO = Object.freeze({
  Foundry_Plywood:'wood',Foundry_Plywood_Edges:'wood',Foundry_Dark_Timber:'wood',
  Foundry_Concrete:'concrete',Foundry_Premium_White_Calacatta_Marble:'concrete',
  Foundry_Stainless_Coping:'metal',Foundry_Grind_Rail:'metal',Foundry_Steel:'metal',
  'Ceramic / pearl transition':'concrete','Ceramic / silver riding concrete':'concrete',
  'Seam / charcoal rubber':'rubber','Grind / luminous cyan alloy':'metal',
  'Grind / luminous violet alloy':'metal','Titanium / brushed structural alloy':'metal',
});

export function shippingSurfaceTag(object) {
  const explicit=authoredSurfaceTag(object);if(explicit!==null)return explicit;
  const materials=Array.isArray(object?.material)?object.material:[object?.material];
  let result=null;
  for(const material of materials){
    const name=String(material?.name||'').replace(/\.\d+$/,'');
    const tag=Object.hasOwn(SHIPPING_MATERIAL_AUDIO,name)?SHIPPING_MATERIAL_AUDIO[name]:'neutral';
    if(result!==null&&tag!==result)return 'neutral';result=tag;
  }
  return result||'neutral';
}

export function wheelSurfaceTag(wheels = []) {
  let selected='neutral',best=0;
  for (const wheel of wheels) {
    if(!wheel.valid)continue;
    const tag=validatedSurfaceTag(wheel.audioSurfaceTag);
    let count=0;
    for(const contact of wheels)if(contact.valid&&validatedSurfaceTag(contact.audioSurfaceTag)===tag)count++;
    if(count>best){best=count;selected=tag;}
  }
  return selected;
}

export function surfaceTagFor(player) {
  const rail = player?.grind?.rail;
  const tag = rail ? rail.audioSurfaceTag ?? rail.surfaceType ?? rail.userData?.audioSurfaceTag
    : player?.audioSurfaceTag ?? player?.contact?.audioSurfaceTag ?? wheelSurfaceTag(player?.boardContact?.wheels);
  return validatedSurfaceTag(tag);
}

export function surfaceAudioFor(player) { return SURFACE_AUDIO[surfaceTagFor(player)]; }
