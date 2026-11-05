// Live-browser renderer audit. Run against a LOCAL Vite preview of this branch.
// Requires the project's browser-smoke dependency: npm i --no-save @playwright/test.
// Output values are observed at runtime; GPU timings/memory are NOT inferred.
const { chromium } = await import('@playwright/test');
const url = process.env.STREETSKATE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.streetSkate?.ready === true,
    null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const { renderer, scene, park, manifest } = window.streetSkate;
    const samples = [];
    for (let i = 0; i < 90; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const { calls, triangles, points, lines } = renderer.info.render;
      samples.push({ calls, triangles, points, lines });
    }
    const sorted = key => samples.map(s => s[key]).sort((a, b) => a - b);
    const summary = key => {
      const values = sorted(key);
      return { median: values[Math.floor(values.length / 2)], min: values[0],
        max: values.at(-1) };
    };
    const uniqueMaterials = new Set(), uniqueTextures = new Set();
    const sceneGeometries = new Set();
    const materialsByType = {};
    let meshCount = 0, transparentMeshCount = 0;
    const distinctWebpMapSizes = [];
    scene.traverse(object => {
      if (!object.isMesh) return;
      meshCount++;
      sceneGeometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        uniqueMaterials.add(material);
        if (material.transparent) transparentMeshCount++;
        materialsByType[material.type] = (materialsByType[material.type] || 0) + 1;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'alphaMap']) {
          if (material[key]) uniqueTextures.add(material[key]);
        }
      }
    });
    for (const tex of uniqueTextures) {
      const img = tex.image;
      if (img?.width && img?.height) distinctWebpMapSizes.push({
        name: tex.name || '(unnamed)', width: img.width, height: img.height,
        type: tex.type, format: tex.format, colorSpace: tex.colorSpace,
      });
    }
    return {
      scope: 'Live WebGLRenderer.info, 90 rendered samples at 1440x900 DPR 1; NO GPU frame timer',
      sampledDrawCalls: summary('calls'),
      sampledTriangles: summary('triangles'),
      sampledLines: summary('lines'),
      rendererGeometries: renderer.info.memory.geometries,
      rendererTextures: renderer.info.memory.textures,
      shaderPrograms: renderer.info.programs?.length ?? null,
      sceneMeshCount: meshCount, sceneDistinctMaterials: uniqueMaterials.size,
      sceneDistinctGeometries: sceneGeometries.size,
      sceneDistinctMaterialTextures: uniqueTextures.size,
      sceneTransparentMeshCount: transparentMeshCount,
      materialsByType, textureDimensions: distinctWebpMapSizes,
      manifestVisualTriangles: manifest.visualTriangles,
      parkName: park.name,
      userAgent: navigator.userAgent,
      precision: renderer.capabilities.precision,
      webgl2: renderer.capabilities.isWebGL2,
    };
  });
  console.log(JSON.stringify({ url, ...result }, null, 2));
  if (process.env.STREETSKATE_SCREENSHOT) {
    await page.screenshot({ path: process.env.STREETSKATE_SCREENSHOT, fullPage: true });
    console.log('Screenshot: ' + process.env.STREETSKATE_SCREENSHOT);
  }
} finally {
  await browser.close();
}
