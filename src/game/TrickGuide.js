import { FLIP_TRICKS, DOUBLE_FLIP_TRICKS, GRAB_TRICKS, DOUBLE_GRAB_TRICKS,
  GRIND_TRICKS, DOUBLE_GRIND_TRICKS, FLATLAND_TRICKS } from './TrickCatalog.js';

const DIRECTIONS = { none: 'Neutral', left: 'Left / A', right: 'Right / D', up: 'Up / W', down: 'Down / S',
  upLeft: 'Up-left / W+A', upRight: 'Up-right / W+D', downLeft: 'Down-left / S+A', downRight: 'Down-right / S+D' };

export function createTrickGuide({ button, onOpen, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'trick-guide';
  dialog.id = 'trick-guide';
  dialog.setAttribute('aria-labelledby', 'trick-guide-title');
  dialog.innerHTML = `<header><div><small>SOLAR DOCK / MOVE LIST</small><h2 id="trick-guide-title">Trick book</h2></div><button type="button" aria-label="Close trick book">Close ×</button></header>
    <p>Hold a direction with <b>WASD / left stick / D-pad</b>, then press the trick button.
    Double-tap quickly while keeping that direction. For grabs, hold the second press.</p>
    <p class="trick-guide-note">Flips: ← / Xbox X / PlayStation □ · Grabs: → / B / ○ · Grinds: ↑ / Y / △</p>`;

  const addTable = (title, note, headings, rows) => {
    const section = document.createElement('section');
    const heading = document.createElement('h3'); heading.textContent = title;
    const help = document.createElement('p'); help.textContent = note;
    const scroll = document.createElement('div'); scroll.className = 'trick-table-scroll';
    const table = document.createElement('table');
    const thead = table.createTHead(), tr = thead.insertRow();
    for (const label of headings) { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; tr.append(cell); }
    const body = table.createTBody();
    for (const row of rows) { const tr = body.insertRow(); for (const value of row) { const cell = tr.insertCell(); cell.textContent = value; } }
    scroll.append(table); section.append(heading, help, scroll); dialog.append(section);
  };
  addTable('Flips', 'Tap again before the board finishes rotating. Triple flips need a third early tap and more airtime.',
    ['Direction', 'One tap', 'Two taps', 'Three taps'],
    Object.entries(FLIP_TRICKS).filter(([dir]) => dir !== 'none').map(([dir, trick]) => {
      const double = DOUBLE_FLIP_TRICKS[trick.name];
      return [DIRECTIONS[dir], trick.name, double?.name || '—', DOUBLE_FLIP_TRICKS[double?.name]?.name || '—'];
    }));
  addTable('Grabs', 'Double-tap within 0.38 seconds and hold the second press. Release to let go of the board.',
    ['Direction', 'One press + hold', 'Two presses + hold'],
    Object.entries(GRAB_TRICKS).filter(([dir]) => dir !== 'none').map(([dir, trick]) =>
      [DIRECTIONS[dir], trick.name, DOUBLE_GRAB_TRICKS[trick.name].name]));
  addTable('Grinds', 'Double-tap within 0.38 seconds while airborne near a rail, then hold. You can also change tricks while grinding. Press left when the balance marker moves right, and right when it moves left.',
    ['Direction', 'One press + hold', 'Two presses + hold'],
    Object.entries(GRIND_TRICKS).map(([dir, trick]) => [DIRECTIONS[dir], trick.name, DOUBLE_GRIND_TRICKS[trick.name].name]));
  addTable('Manuals & flatland', 'W then S: Manual. S then W: Nose Manual. If the balance marker moves up, press S / stick down; if it moves down, press W / stick up.',
    ['Button sequence', 'Trick'], Object.entries(FLATLAND_TRICKS).map(([sequence, trick]) => [sequence.replaceAll('+', ' → '), trick.name]));
  document.body.append(dialog);
  const close = () => dialog.close();
  const open = () => { if (dialog.open) return; onOpen(); dialog.showModal(); };
  button.setAttribute('aria-controls', dialog.id);
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', open);
  dialog.querySelector('header button').addEventListener('click', close);
  dialog.addEventListener('close', onClose);
  window.addEventListener('keydown', event => {
    if (event.code !== 'KeyH' || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (dialog.open) close(); else open();
  }, true);
  return dialog;
}
