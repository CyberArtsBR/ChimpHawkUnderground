let hud = null;

export function ensureBalanceHud() {
  if (hud) return hud;
  const style = document.createElement('style');
  // 2026-11: bigger, zoned and in the game's lettering so it reads mid-combo.
  style.textContent = `
    #balance-hud{position:fixed;left:50%;bottom:11vh;transform:translateX(-50%);z-index:45;width:min(380px,62vw);pointer-events:none;opacity:0;transition:opacity .14s ease;filter:drop-shadow(0 6px 0 rgba(10,6,20,.55)) drop-shadow(0 0 14px rgba(0,0,0,.4));font:400 20px/1 Bangers,Impact,sans-serif;letter-spacing:.12em;color:#fff6d8;text-align:center}
    #balance-hud.active{opacity:1}
    #balance-hud .balance-label{display:inline-block;margin-bottom:8px;padding:4px 14px;border-radius:999px;background:#120c1ccc;border:2px solid #ffd23f;transform:rotate(-2deg)}
    #balance-hud .balance-track{height:16px;border:3px solid #120c1c;background:linear-gradient(90deg,#ff3d5a 0%,#ffb21f 18%,#8dff4f 36%,#8dff4f 64%,#ffb21f 82%,#ff3d5a 100%);border-radius:99px;position:relative;overflow:visible;box-shadow:inset 0 3px 0 rgba(255,255,255,.35)}
    #balance-hud .balance-center{position:absolute;left:50%;top:-6px;width:3px;height:22px;margin-left:-1.5px;border-radius:2px;background:#120c1c}
    #balance-hud .balance-marker{position:absolute;left:50%;top:50%;width:18px;height:30px;border-radius:7px;background:#fff6d8;border:3px solid #120c1c;box-shadow:0 0 12px rgba(255,255,255,.7);transform:translate(-50%,-50%);transition:left .045s linear,top .045s linear}
    #balance-hud.danger .balance-marker{background:#ff3d5a;box-shadow:0 0 18px rgba(255,61,90,.95)}
    #balance-hud.danger .balance-label{border-color:#ff3d5a;color:#ffd0d6;animation:balance-pulse .35s ease-in-out infinite alternate}
    #balance-hud[data-axis="vertical"]{left:calc(50% + min(24vw,200px));width:150px}
    #balance-hud[data-axis="vertical"] .balance-track{width:16px;height:150px;margin:0 auto;background:linear-gradient(0deg,#ff3d5a 0%,#ffb21f 18%,#8dff4f 36%,#8dff4f 64%,#ffb21f 82%,#ff3d5a 100%)}
    #balance-hud[data-axis="vertical"] .balance-center{left:-6px;top:50%;width:22px;height:3px;margin:-1.5px 0 0}
    #balance-hud[data-axis="vertical"] .balance-marker{width:30px;height:18px}
    @keyframes balance-pulse{from{transform:rotate(-2deg) scale(1)}to{transform:rotate(-2deg) scale(1.1)}}
    @media (prefers-reduced-motion:reduce){#balance-hud.danger .balance-label{animation:none}}
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
      const active = mode === 'MANUAL' || mode === 'NOSE MANUAL' || mode === 'GRIND' || mode === 'HANDPLANT';
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
