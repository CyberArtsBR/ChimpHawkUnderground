import { gameAssetUrl } from './AssetPaths.js';
import { SKATEBOARD_FINISHES } from '../skateboard/BoardFinishes.js';
import { PARK_DEFINITIONS } from '../park/ParkRegistry.js';

export const DEFAULT_CHARACTERS = Object.freeze([
  Object.freeze({ id:'hollow', name:'The Hollow', subtitle:'THE HOLLOW', url:gameAssetUrl('/assets/rider/thehollowf.glb'), accent:'#fff151' }),
  Object.freeze({ id:'heretic', name:'Heretic', subtitle:'THE EXECUTOR', url:gameAssetUrl('/assets/rider/The_Heretic.glb'), accent:'#f66e62' }),
  Object.freeze({ id:'adolescent', name:'Adolescent', subtitle:'THE YOUNGBLOOD', url:gameAssetUrl('/assets/rider/The_AdolescentUR.glb'), accent:'#7edcff' }),
  Object.freeze({ id:'anchor', name:'Anchor', subtitle:'THE WIZARD', url:gameAssetUrl('/assets/rider/The_Anchor.glb'), accent:'#c8f17f' }),
  Object.freeze({ id:'tuxr', name:'Tuxr', subtitle:'THE MASTERMIND', url:gameAssetUrl('/assets/rider/TuxR.glb'), accent:'#cc94ff' }),
]);
const LABELS = ['GREY', 'WHITE / BLACK', 'PURPLE', 'LIME GREEN', 'YELLOW', 'BLUE', 'ORANGE', 'RED'];
export const BOARD_CHOICES = Object.freeze(LABELS.map((label, finishIndex) =>
  Object.freeze({
    id:label.toLowerCase().replace(/[^a-z]+/g,'-'),
    label,
    finishIndex,
    gradient:SKATEBOARD_FINISHES[finishIndex].cssGradient,
  })));
export const LOCATIONS = Object.freeze(PARK_DEFINITIONS
  .filter(park => park.selectable)
  .map(({ id, name, subtitle, available, number }) => Object.freeze({ id, name, subtitle, available, number })));
