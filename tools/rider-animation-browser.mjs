import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const label = process.env.POSE_LABEL || 'animation';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5181');
  await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 60000 });
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="practice"]').click();
  await page.locator('.loadout-character').first().click();
  await page.locator('.loadout-deck').nth(2).click();
  await page.locator('.loadout-location').filter({ hasText: 'URBAN WAREHOUSE' }).click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.streetSkate.currentLocation === 'urban-warehouse');
  await page.evaluate(() => {
    const g = window.streetSkate;
    g.skater.reset(); g.skater.position.set(0, .015, 40); g.skater.velocity.set(0, 0, 0);
    g.skater.update(0, {}, 0); g.setMode('explore');
  });
  await page.waitForTimeout(2000);
  const checks = [];
  for (const name of ['The_AdolescentUR', 'The_Heretic', 'The_Anchor', 'TheanchoURi', 'TuxR']) {
    await page.evaluate(async name => {
      const g = window.streetSkate; await g.skater.setRiderModel(`/assets/rider/${name}.glb`);
      g.skater.update(0, {}, 0);
    }, name);
    for (const pose of ['idle', 'coast', 'push', 'brake', 'turn', 'crouch', 'flick', 'spin', 'catch']) {
      const result = await page.evaluate(pose => {
        const g = window.streetSkate, s = g.skater, r = s.rider, b = s.board;
        const flip = ['flick', 'spin', 'catch'].includes(pose);
        const progress = pose === 'flick' ? .34 : pose === 'spin' ? .6 : .97;
        const movement={coast:'COAST',push:'PUSH',brake:'BRAKE',turn:'COAST'};
        const params = { presentation: { state: flip ? 'AIR' : pose === 'crouch' ? 'CROUCH' : movement[pose]||'IDLE' },
          speedRatio:movement[pose] ? .65 : 0,steer:pose==='turn'?.7:0,pushWeight:pose==='push'?1:0,pushPhase:.5,
          crouch: pose === 'crouch' ? 1 : 0, airborne: flip,
          flipState: flip ? { name: 'Kickflip', progress, roll: 1, yaw: 0, pitch: 0 } : null, dt: 1 / 60 };
        b.resetPresentation(); r.resetPresentation();
        for (let i = 0; i < 40; i++) { b.update(params); r.update({ ...params, board: b }); }
        const point = bone => r.root.worldToLocal(bone.getWorldPosition(r.root.position.clone()));
        const hip = point(r.bones.pelvis), head = point(r.bones.head);
        const legs = ['l', 'r'].map(side => {
          const h = point(r.bones['thigh_' + side]), k = point(r.bones['calf_' + side]), f = point(r.bones['foot_' + side]);
          return { side, flex: (Math.PI - h.clone().sub(k).angleTo(f.clone().sub(k))) * 180 / Math.PI, ankle: f.toArray() };
        });
        const finite = [...r.rest.keys()].every(bone => bone.quaternion.toArray().every(Number.isFinite));
        const arms=['l','r'].map(side=>{
          const shoulder=point(r.bones['upperarm_'+side]),elbow=point(r.bones['lowerarm_'+side]),wrist=point(r.bones['hand_'+side]);
          const direction=wrist.clone().sub(shoulder).normalize();
          return {side,flex:(Math.PI-shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)))*180/Math.PI,
            outward:direction.dot(r.armOutward[side]),down:direction.y};
        });
        const p = s.position;
        // Camera looks along the deck, making hip pitch and knee bend readable.
        g.camera.position.set(p.x + 1.6, p.y + .85, p.z - 2.3);
        g.camera.lookAt(p.x, p.y + .8, p.z);
        g.renderer.render(g.scene, g.camera);
        return { pose, hip: hip.toArray(), head: head.toArray(), legs, arms, finite, png: g.renderer.domElement.toDataURL() };
      }, pose);
      const { png, ...check } = result;
      checks.push({ name, ...check });
      await writeFile(`artifacts/collision-audit/${label}-${name}-${pose}.png`, Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  // Exercise the shipping input/physics/presentation path, rather than only IK.
  const gameplay = await page.evaluate(async () => {
    const g = window.streetSkate, s = g.skater;
    await s.setRiderModel('/assets/rider/The_AdolescentUR.glb');
    s.reset(); s.position.set(0, .015, 40); s.velocity.set(0, 0, 0); s.update(0, {}, 0);
    const frames = [];
    for (let i = 0; i < 165; i++) {
      const input = { steer: 0, drive: 0, spin: 0, directionTaps: [],
        ollieHeld: i >= 15 && i < 55, olliePressed: i === 15, ollieReleased: i === 55,
        flipPressed: i === 62, grabHeld: false, brake: false };
      s.update(1 / 60, input, i / 60);
      const r = s.rider;
      frames.push({ frame: i, state: s.presentation.state, charge: s.charge,
        y: s.position.y, flip: s.flipState?.progress ?? null,
        hip: r.bones.pelvis.getWorldPosition(r.root.position.clone()).y - s.root.position.y,
        head: r.bones.head.getWorldPosition(r.root.position.clone()).y - s.root.position.y,
        finite: [...r.rest.keys()].every(b => b.quaternion.toArray().every(Number.isFinite)) });
    }
    return frames;
  });
  await writeFile(`artifacts/collision-audit/${label}-checks.json`, JSON.stringify({ checks, gameplay }, null, 2));
  for (const name of new Set(checks.map(c => c.name))) {
    const idle = checks.find(c => c.name === name && c.pose === 'idle');
    const crouch = checks.find(c => c.name === name && c.pose === 'crouch');
    if (idle.hip[1] - crouch.hip[1] < .13 || idle.head[1] - crouch.head[1] < .18)
      throw new Error(`${name}: crouch did not visibly lower hips and head`);
  }
  if (checks.some(c => !c.finite) || gameplay.some(c => !c.finite)) throw new Error('Nonfinite animation');
  if(checks.filter(c=>['idle','coast','push','brake','turn'].includes(c.pose)).some(c=>c.arms.some(a=>a.flex>22||a.outward<.58||a.down>-.7))) throw new Error('Ground movement lost the stopped A-pose');
  if (!gameplay.some(c => c.state === 'CROUCH' && c.charge > .9) || !gameplay.some(c => c.flip !== null)
    || !gameplay.some(c => c.state === 'LAND')) throw new Error('Input sequence did not charge, flip and land');
  console.log(JSON.stringify({ avatars: 5, poses: checks.length, gameplayFrames: gameplay.length,
    crouchHipDrop: checks.filter(c => c.pose === 'crouch').map(c => ({ name: c.name,
      drop: checks.find(idle => idle.name === c.name && idle.pose === 'idle').hip[1] - c.hip[1] })) }));
} finally { await browser.close(); }
