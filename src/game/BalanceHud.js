let hud = null;

export function ensureBalanceHud() {
  if (hud) return hud;
  const style = document.createElement('style');
  style.textContent = `
    #balance-hud{position:fixed;left:50%;bottom:10.5vh;transform:translateX(-50%);z-index:45;width:min(310px,58vw);pointer-events:none;opacity:0;transition:opacity .14s ease;filter:drop-shadow(0 5px 18px rgba(0,0,0,.45));font:700 11px/1.1 Inter,Arial,sans-serif;letter-spacing:.18em;color:#fff;text-align:center}
    #balance-hud.active{opacity:1}
    #balance-hud .balance-label{margin-bottom:7px;text-shadow:0 2px 6px #000}
    #balance-hud .balance-track{height:8px;border:1px solid rgba(255,255,255,.58);background:linear-gradient(90deg,rgba(255,90,70,.8),rgba(255,255,255,.22) 26%,rgba(255,255,255,.22) 74%,rgba(255,90,70,.8));border-radius:99px;position:relative;overflow:visible}
    #balance-hud .balance-center{position:absolute;left:50%;top:-3px;width:1px;height:12px;background:rgba(255,255,255,.62)}
    #balance-hud .balance-marker{position:absolute;left:50%;top:50%;width:13px;height:18px;border-radius:4px;background:#fff;box-shadow:0 0 12px rgba(255,255,255,.78);transform:translate(-50%,-50%);transition:left .045s linear,top .045s linear}
    #balance-hud.danger .balance-marker{box-shadow:0 0 16px rgba(255,120,75,.95)}
    #balance-hud[data-axis="vertical"]{left:calc(50% + min(23vw,180px));width:130px}
    #balance-hud[data-axis="vertical"] .balance-track{width:8px;height:120px;margin:0 auto;background:linear-gradient(0deg,rgba(255,90,70,.8),rgba(255,255,255,.22) 26%,rgba(255,255,255,.22) 74%,rgba(255,90,70,.8))}
    #balance-hud[data-axis="vertical"] .balance-center{left:-3px;top:50%;width:12px;height:1px}
    #balance-hud[data-axis="vertical"] .balance-marker{width:18px;height:13px}
  `;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'balance-hud';
  root.innerHTML = '<div class="balance-label">BALANCE</div><div class="balance-track"><i class="balance-center"></i><i class="balance-marker"></i></div>';
  document.body.appendChild(root);
  hud = {
    root,
    label: root.querySelector('.balance-label'),
    marker: root.querySelector('.balance-marker'),
    update(mode, value = 0) {
      const active = mode === 'MANUAL' || mode === 'NOSE MANUAL' || mode === 'GRIND';
      root.classList.toggle('active', active);
      if (!active) {
        root.classList.remove('danger');
        root.removeAttribute('aria-valuenow');
        return;
      }
      // A recovered/bailing physics state may briefly report NaN: never send
      // that value to CSS or leave stale danger lighting on the HUD.
      const normalized = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      this.label.textContent = mode;
      const vertical=mode!=='GRIND';
      root.dataset.axis=vertical?'vertical':'horizontal';
      this.marker.style.left=vertical?'50%':`${50 + normalized * 47}%`;
      this.marker.style.top=vertical?`${50 - normalized * 47}%`:'50%';
      root.setAttribute('aria-valuenow', String(Math.round(normalized * 100)));
      root.classList.toggle('danger', Math.abs(normalized) > 0.72);
    },
  };
  return hud;
}
