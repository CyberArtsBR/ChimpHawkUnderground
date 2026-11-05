/** A running older build may reference chunks replaced by a deployment/rebuild.
 * Offer explicit recovery; never reload an active run automatically. */
export function installModuleLoadRecovery(target = window, doc = document) {
  const show = () => {
    if(doc.getElementById('game-update-notice'))return;
    const notice=doc.createElement('aside');
    notice.id='game-update-notice';notice.setAttribute('role','alert');
    const message=doc.createElement('p');
    message.textContent='The game was updated or a park could not download. Refresh to try again.';
    const button=doc.createElement('button');button.type='button';button.textContent='REFRESH GAME';
    button.addEventListener('click',()=>target.location.reload());
    notice.append(message,button);doc.body.append(notice);
    target.setTimeout(()=>button.focus({preventScroll:true}),0);
  };
  target.addEventListener('vite:preloadError',show);
  return ()=>target.removeEventListener('vite:preloadError',show);
}
