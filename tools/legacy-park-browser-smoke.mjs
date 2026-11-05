import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.STREETSKATE_URL || 'http://127.0.0.1:4173';
const screenshotPath = process.env.STREETSKATE_SCREENSHOT || 'artifacts/phase1-browser-smoke.png';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});

const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const parkResponses = [];

function angleDelta(a, b) {
  const tau = Math.PI * 2;
  let d = (Number(b) || 0) - (Number(a) || 0);
  d = ((d + Math.PI) % tau + tau) % tau - Math.PI;
  return d;
}

page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
page.on('requestfailed', request => {
  failedRequests.push({
    url: request.url(),
    failure: request.failure()?.errorText || 'unknown',
  });
});
page.on('response', response => {
  const url = response.url();
  if (/\/assets\/park\//.test(url)) {
    parkResponses.push({ url, status: response.status() });
  }
});

try {
  await page.goto(baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });

  await page.waitForFunction(
    () => window.streetSkate?.ready === true,
    null,
    { timeout: 60_000 },
  );

  const boot = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const resources = performance.getEntriesByType('resource')
      .map(entry => entry.name);
    const state = window.streetSkate;
    const skater = state?.skater;

    return {
      canvasCount: document.querySelectorAll('canvas').length,
      mode: app?.dataset?.mode || null,
      controlsVersion: state?.controlsVersion || null,
      spawn: state?.manifest?.spawn || null,
      rails: state?.manifest?.rails?.length ?? null,
      ready: state?.ready === true,
      grounded: Boolean(skater?.grounded),
      position: skater?.position?.toArray?.() || null,
      velocity: skater?.velocity?.toArray?.() || null,
      heading: Number(skater?.heading),
      yawViolations: Number(skater?.landingYawInvariantViolations || 0),
      invariantCodes: (skater?.stateInvariantViolations || []).map(entry => entry?.code).filter(Boolean),
      cameraPosition: state?.camera?.position?.toArray?.() || null,
      cameraQuaternion: state?.camera?.quaternion?.toArray?.() || null,
      resources,
      rendererFrame: Number(state?.renderer?.info?.render?.frame || 0),
      qaState: state?.captureState?.() || null,
    };
  });

  assert.equal(boot.ready, true, 'window.streetSkate never reached ready=true');
  assert.ok(boot.canvasCount >= 1, 'WebGL canvas was not created');
  assert.equal(boot.mode, 'skate', 'game did not enter skate mode after load');
  assert.equal(boot.controlsVersion, 'thug-controls-v1');
  assert.ok(Array.isArray(boot.spawn) && boot.spawn.length === 3, 'park manifest spawn missing');
  assert.ok(Number.isInteger(boot.rails) && boot.rails > 0, 'park rails metadata missing');
  assert.ok(Array.isArray(boot.position) && boot.position.every(Number.isFinite), 'skater position is not finite');
  assert.ok(Array.isArray(boot.velocity) && boot.velocity.every(Number.isFinite), 'skater velocity is not finite');
  assert.ok(Number.isFinite(boot.heading), 'skater heading is not finite');
  assert.equal(boot.yawViolations, 0, 'landing yaw invariant already violated during bootstrap');
  assert.deepEqual(boot.invariantCodes, [], 'canonical state already diverged during bootstrap');
  assert.ok(Array.isArray(boot.cameraPosition) && boot.cameraPosition.every(Number.isFinite),
    'camera position is not finite at bootstrap');
  assert.ok(Array.isArray(boot.cameraQuaternion) && boot.cameraQuaternion.every(Number.isFinite),
    'camera quaternion is not finite at bootstrap');
  assert.ok(boot.rendererFrame >= 0, 'renderer frame counter is invalid at bootstrap');
  assert.ok(boot.qaState && typeof boot.qaState === 'object',
    'canonical staging QA snapshot hook is unavailable');
  assert.equal(boot.qaState.landingYawInvariantViolations, 0,
    'QA snapshot reports a landing yaw violation at bootstrap');
  assert.deepEqual(boot.qaState.stateInvariantCodes, [],
    'QA snapshot reports canonical state divergence at bootstrap');

  const hasResource = pattern => boot.resources.some(url => pattern.test(url));
  assert.equal(
    hasResource(/\/assets\/park\/insanity-inspired-park\.glb(?:$|\?)/),
    true,
    'original visual arena was not requested',
  );
  assert.equal(
    hasResource(/\/assets\/park\/park-collision\.glb(?:$|\?)/),
    true,
    'optimized collision arena was not requested',
  );
  assert.equal(
    hasResource(/halfpipenew\.glb/i),
    false,
    'halfpipenew must remain inactive during Phase 1 staging',
  );

  for (const response of parkResponses) {
    assert.ok(response.status >= 200 && response.status < 400,
      `park asset failed: ${response.status} ${response.url}`);
  }

  await page.bringToFront();
  await page.evaluate(() => window.focus());
  // Headless Chromium may report both document.hasFocus() and document.hidden
  // unreliably. The captureInput assertions below are the authoritative proof
  // that Playwright keyboard events reached the real SkateInput path.

  // Real browser-loop ground input validation. Let auto-push establish useful
  // park speed, then prove steering owns yaw and brake owns speed.
  await page.waitForTimeout(900);
  const steerStart = await page.evaluate(() => {
    const state = window.streetSkate;
    const skater = state.skater;
    return {
      heading: skater.heading,
      speed: skater.velocity.length(),
      grounded: skater.grounded,
      rendererFrame: state.renderer.info.render.frame,
    };
  });
  assert.equal(steerStart.grounded, true, 'skater was not grounded before steering smoke');

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(120);
  const steeringInput = await page.evaluate(() => window.streetSkate.captureInput?.() || null);
  assert.ok(steeringInput, 'browser QA input snapshot unavailable during steering');
  assert.ok(steeringInput.steer > 0.9,
    `KeyD did not reach SkateInput as steer=+1: ${JSON.stringify(steeringInput)}`);
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
  const steerEnd = await page.evaluate(() => {
    const state = window.streetSkate;
    const skater = state.skater;
    return {
      heading: skater.heading,
      speed: skater.velocity.length(),
      grounded: skater.grounded,
      yawViolations: skater.landingYawInvariantViolations || 0,
      invariantCodes: (skater.stateInvariantViolations || []).map(entry => entry?.code).filter(Boolean),
      cameraPosition: state.camera.position.toArray(),
      cameraQuaternion: state.camera.quaternion.toArray(),
      rendererFrame: state.renderer.info.render.frame,
    };
  });
  assert.equal(steerEnd.grounded, true, 'ground steering unexpectedly left the surface');
  assert.ok(Math.abs(angleDelta(steerStart.heading, steerEnd.heading)) > 0.04,
    `KeyD did not produce a meaningful player-authored yaw change: ${steerStart.heading} -> ${steerEnd.heading}`);
  assert.equal(steerEnd.yawViolations, 0, 'steering smoke triggered a landing yaw violation');
  assert.deepEqual(steerEnd.invariantCodes, [], 'steering smoke diverged canonical state');
  assert.ok(steerEnd.cameraPosition.every(Number.isFinite), 'camera position became non-finite during steering');
  assert.ok(steerEnd.cameraQuaternion.every(Number.isFinite), 'camera quaternion became non-finite during steering');

  // Isolate braking from the steering line and park geometry. Reset to the real
  // production spawn, seed a known forward speed, then apply the official S/down
  // input through SkateInput. This remains a real browser-loop physics check.
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(220);
  await page.evaluate(() => {
    const skater = window.streetSkate.skater;
    skater.velocity.copy(skater.forward).multiplyScalar(6);
    skater.speed = 6;
  });
  await page.waitForTimeout(60);
  const brakeStart = await page.evaluate(() => ({
    speed: window.streetSkate.skater.velocity.length(),
    grounded: window.streetSkate.skater.grounded,
    movementState: window.streetSkate.skater.movementState,
  }));
  assert.equal(brakeStart.grounded, true, 'skater was not grounded before brake smoke');
  assert.ok(brakeStart.speed > 1.0, `insufficient speed before brake smoke: ${brakeStart.speed}`);

  await page.keyboard.down('KeyS');
  await page.waitForTimeout(120);
  const brakingInput = await page.evaluate(() => window.streetSkate.captureInput?.() || null);
  assert.ok(brakingInput, 'browser QA input snapshot unavailable during braking');
  assert.ok(brakingInput.drive < -0.9 || brakingInput.brake === true,
    `KeyS did not reach SkateInput as brake/down input: ${JSON.stringify(brakingInput)}`);
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyS');
  const brakeEnd = await page.evaluate(() => ({
    speed: window.streetSkate.skater.velocity.length(),
    grounded: window.streetSkate.skater.grounded,
    yawViolations: window.streetSkate.skater.landingYawInvariantViolations || 0,
  }));
  assert.equal(brakeEnd.grounded, true, 'braking unexpectedly left the surface');
  assert.ok(brakeEnd.speed < brakeStart.speed - 0.35,
    `brake did not remove enough speed: ${brakeStart.speed} -> ${brakeEnd.speed}`);
  assert.equal(brakeEnd.yawViolations, 0, 'brake smoke triggered a landing yaw violation');

  // Ollie is a separate scenario. Reset again so a ramp/pump context reached by
  // previous smoke steps cannot legitimately consume Space release as PUMP.
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(240);
  const start = await page.evaluate(() => ({
    y: window.streetSkate.skater.position.y,
    grounded: window.streetSkate.skater.grounded,
    movementState: window.streetSkate.skater.movementState,
  }));
  assert.equal(start.grounded, true, 'reset spawn was not grounded before ollie smoke');

  await page.keyboard.down('Space');
  await page.waitForTimeout(320);
  await page.keyboard.up('Space');

  let maxY = start.y;
  let observedAir = !start.grounded;
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(25);
    const sample = await page.evaluate(() => ({
      y: window.streetSkate.skater.position.y,
      grounded: window.streetSkate.skater.grounded,
      velocity: window.streetSkate.skater.velocity.toArray(),
      heading: window.streetSkate.skater.heading,
      yawViolations: window.streetSkate.skater.landingYawInvariantViolations || 0,
    }));
    maxY = Math.max(maxY, sample.y);
    observedAir ||= !sample.grounded;
    assert.ok(sample.velocity.every(Number.isFinite), 'non-finite velocity during browser ollie');
    assert.ok(Number.isFinite(sample.heading), 'non-finite heading during browser ollie');
    assert.equal(sample.yawViolations, 0, 'contact-driven yaw invariant violated during browser ollie');
  }

  assert.equal(observedAir, true, 'Space input never produced an airborne frame');
  assert.ok(maxY > start.y + 0.12,
    `ollie did not gain expected height: start=${start.y}, max=${maxY}`);

  // Exercise a real authored production quarter through the browser loop.
  // Use the canonical eastern-quarter lip and discover its real sloped collision
  // side with a small bounded probe set. The gameplay loop itself owns takeoff,
  // vert air and re-entry; the harness only seeds an approach line.
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(220);
  const transitionSetup = await page.evaluate(() => {
    const skater = window.streetSkate?.skater;
    const transition = skater?.transitions?.get?.('eastern-quarter');
    if (!transition?.lipStart || !transition?.lipEnd) {
      return { ok: false, reason: 'eastern-quarter metadata unavailable' };
    }

    const a = transition.lipStart.clone();
    const b = transition.lipEnd.clone();
    const tangent = b.clone().sub(a).setY(0);
    if (tangent.lengthSq() < 1e-8) {
      return { ok: false, reason: 'eastern-quarter coping tangent is degenerate' };
    }
    tangent.normalize();
    const lip = a.clone().add(b).multiplyScalar(0.5);
    const perpendicular = tangent.clone().set(tangent.z, 0, -tangent.x).normalize();
    let best = null;

    for (const sign of [1, -1]) {
      for (const distance of [0.38, 0.58, 0.82, 1.08, 1.34]) {
        const probe = lip.clone().addScaledVector(perpendicular, sign * distance);
        probe.y = lip.y;
        const support = skater.surface.ground(probe, 2.2, 4.4);
        if (!support?.point || !support?.normal) continue;
        const ny = Math.abs(support.normal.y);
        if (ny <= 0.04 || ny >= 0.94) continue;

        const deckOutward = support.normal.clone().setY(0);
        if (deckOutward.lengthSq() < 1e-8) continue;
        deckOutward.normalize().negate();
        const boardForward = deckOutward.clone().projectOnPlane(support.normal);
        if (boardForward.lengthSq() < 1e-8) continue;
        boardForward.normalize();
        if (boardForward.y <= 0.08) continue;

        const score = boardForward.y * 4 - distance * 0.12;
        if (!best || score > best.score) {
          best = {
            score,
            supportPoint: support.point.clone(),
            supportNormal: support.normal.clone(),
            deckOutward,
            boardForward,
          };
        }
      }
    }

    if (!best) {
      return { ok: false, reason: 'eastern-quarter has no discoverable sloped collision support' };
    }

    skater.position.copy(best.supportPoint).addScaledVector(best.supportNormal, 0.015);
    skater.normal.copy(best.supportNormal);
    skater.heading = Math.atan2(-best.deckOutward.x, -best.deckOutward.z);
    skater.groundDirection();
    skater.velocity.copy(skater.forward).multiplyScalar(10.5);
    skater.speed = skater.velocity.length();
    skater.grounded = true;
    skater.transitionAir = null;
    skater.pendingBoardTransition = null;
    skater.grind = null;
    skater.manual = null;
    skater.wallRide = null;
    skater.bailTime = 0;
    skater.airSpin = 0;
    skater.steer = 0;
    skater.rampExitIntentTime = 0;
    skater.lastWheelSupport = null;
    skater.syncMovementState?.();
    skater.syncCanonicalState?.();

    return {
      ok: true,
      transitionId: transition.id,
      transitionType: transition.type,
      lipHeight: lip.y,
      heading: skater.heading,
      startY: skater.position.y,
      startVelocity: skater.velocity.toArray(),
      normal: skater.normal.toArray(),
    };
  });

  assert.equal(transitionSetup.ok, true,
    `could not prepare eastern-quarter browser smoke: ${JSON.stringify(transitionSetup)}`);
  assert.ok(transitionSetup.startVelocity[1] > 0.5,
    `transition setup is not climbing: ${JSON.stringify(transitionSetup)}`);

  let transitionObserved = false;
  let transitionObservedId = null;
  let transitionMaxY = transitionSetup.startY;
  let transitionMaxHeadingDelta = 0;
  let transitionFlight = null;

  // Keep timing on the Playwright side. Page-side timers can be heavily
  // throttled in headless/background Chromium and turn a few seconds into minutes.
  for (let frame = 0; frame < 90; frame++) {
    await page.waitForTimeout(50);
    const sample = await page.evaluate(() => {
      const skater = window.streetSkate.skater;
      return {
        y: skater.position.y,
        heading: skater.heading,
        grounded: skater.grounded,
        transitionActive: Boolean(skater.transitionAir),
        transitionId: skater.transitionAir?.transitionId ?? null,
        fakie: Boolean(skater.fakie),
        velocity: skater.velocity.toArray(),
        yawViolations: skater.landingYawInvariantViolations || 0,
        invariantCodes: (skater.stateInvariantViolations || [])
          .map(entry => entry?.code)
          .filter(Boolean),
      };
    });

    transitionMaxY = Math.max(transitionMaxY, sample.y);
    transitionMaxHeadingDelta = Math.max(
      transitionMaxHeadingDelta,
      Math.abs(angleDelta(transitionSetup.heading, sample.heading)),
    );
    if (sample.transitionActive) {
      transitionObserved = true;
      transitionObservedId ||= sample.transitionId;
    }

    assert.ok(sample.velocity.every(Number.isFinite),
      'non-finite velocity during authored transition smoke');
    assert.ok(Number.isFinite(sample.heading),
      'non-finite heading during authored transition smoke');
    assert.equal(sample.yawViolations, 0,
      'authored transition smoke triggered a contact-driven yaw violation');
    assert.deepEqual(sample.invariantCodes, [],
      'authored transition smoke diverged canonical state');

    if (transitionObserved && sample.grounded && !sample.transitionActive) {
      transitionFlight = {
        ok: true,
        observed: true,
        observedId: transitionObservedId,
        landed: true,
        maxY: transitionMaxY,
        maxHeadingDelta: transitionMaxHeadingDelta,
        finalHeading: sample.heading,
        fakie: sample.fakie,
        velocity: sample.velocity,
      };
      break;
    }
  }

  transitionFlight ||= {
    ok: false,
    reason: 'transition did not reconnect before timeout',
    observed: transitionObserved,
    observedId: transitionObservedId,
    landed: false,
    maxY: transitionMaxY,
    maxHeadingDelta: transitionMaxHeadingDelta,
  };

  assert.equal(transitionFlight.ok, true,
    `real eastern-quarter flight failed: ${JSON.stringify(transitionFlight)}`);
  assert.equal(transitionFlight.observed, true,
    `real eastern-quarter never entered transition air: ${JSON.stringify(transitionFlight)}`);
  assert.equal(transitionFlight.observedId, transitionSetup.transitionId,
    `wrong authored transition activated: expected ${transitionSetup.transitionId}, got ${transitionFlight.observedId}`);
  assert.equal(transitionFlight.landed, true,
    `real eastern-quarter did not reconnect: ${JSON.stringify(transitionFlight)}`);
  assert.ok(transitionFlight.maxY > transitionSetup.lipHeight + 0.10,
    `transition did not produce visible air above coping: lip=${transitionSetup.lipHeight}, max=${transitionFlight.maxY}`);
  assert.ok(transitionFlight.maxHeadingDelta < 0.08,
    `no-spin authored transition changed horizontal heading by ${transitionFlight.maxHeadingDelta} rad`);

  const finalState = await page.evaluate(() => {
    const state = window.streetSkate;
    const skater = state.skater;
    return {
      rendererFrame: state.renderer.info.render.frame,
      cameraPosition: state.camera.position.toArray(),
      cameraQuaternion: state.camera.quaternion.toArray(),
      yawViolations: skater.landingYawInvariantViolations || 0,
      invariantCodes: (skater.stateInvariantViolations || []).map(entry => entry?.code).filter(Boolean),
    };
  });
  assert.ok(finalState.rendererFrame > steerStart.rendererFrame,
    `renderer did not advance: ${steerStart.rendererFrame} -> ${finalState.rendererFrame}`);
  assert.ok(finalState.cameraPosition.every(Number.isFinite), 'camera position non-finite after gameplay smoke');
  assert.ok(finalState.cameraQuaternion.every(Number.isFinite), 'camera quaternion non-finite after gameplay smoke');
  assert.equal(finalState.yawViolations, 0, 'browser gameplay smoke ended with landing yaw violations');
  assert.deepEqual(finalState.invariantCodes, [], 'browser gameplay smoke ended with canonical state divergence');

  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Phase 1 transition-authoring debug mode must be inspectable in the real
  // browser build, not only through unit tests.
  const debugUrl = new URL(baseUrl);
  debugUrl.searchParams.set('debug', '1');
  await page.goto(debugUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => window.streetSkate?.ready === true, null, { timeout: 60_000 });
  const transitionDebug = await page.evaluate(() => {
    const state = window.streetSkate;
    const overlay = state?.transitionDebug;
    return {
      summary: state?.captureTransitionDebug?.() || null,
      mounted: Boolean(overlay?.group?.parent),
      staticChildren: Number(overlay?.staticGroup?.children?.length || 0),
      activeVisible: Boolean(overlay?.activeGroup?.visible),
    };
  });
  assert.ok(transitionDebug.summary, 'transition debug summary hook unavailable');
  assert.ok(transitionDebug.summary.count >= 5,
    `too few authored transitions in debug summary: ${JSON.stringify(transitionDebug.summary)}`);
  assert.ok(transitionDebug.summary.vertIds.length >= 5,
    `too few authored vert transitions: ${JSON.stringify(transitionDebug.summary)}`);
  assert.equal(transitionDebug.mounted, true, '?debug=1 transition overlay was not mounted');
  assert.ok(transitionDebug.staticChildren >= transitionDebug.summary.count,
    `transition overlay did not create authored geometry: ${transitionDebug.staticChildren}`);

  assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
  assert.deepEqual(failedRequests, [], `failed requests:\n${JSON.stringify(failedRequests, null, 2)}`);
  assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);

  process.stdout.write(JSON.stringify({
    ok: true,
    baseUrl,
    maxOllieY: maxY,
    parkResponses,
    screenshotPath,
  }, null, 2) + '\n');
} catch (error) {
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {}
  throw error;
} finally {
  await browser.close();
}
