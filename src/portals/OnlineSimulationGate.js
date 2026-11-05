/** Keep Party physics moving through iframe focus changes without accepting stale input. */
export function shouldAdvancePortalsFrame({
  loaded=false,mode='skate',hidden=false,focused=false,connected=false,
}={}){
  return Boolean(loaded && mode==='skate' && !hidden && (focused || connected));
}
