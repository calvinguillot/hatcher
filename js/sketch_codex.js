let img;
let scaleFactor;
let grayPixels;
let gui;

const MAX_LAYERS = 5;

// Display names → internal style keys
const HATCHING_STYLES = {
  "Cross hatching": "cross",
  "Single hatch": "hatch",
  Scribble: "scribble",
  "Zig zag": "zigzag",
  Circles: "circles",
};

let params = {
  // Global image adjustments
  contrast: 1.2, // Multiplier around mid-value (128)
  brightness: 0, // Linear offset

  // Global stroke settings
  strokeWeight: 1,
  lineLength: 26,
  stepSize: 2,
  lineSpacing: 6,

  // Active layer count (max 5)
  numLayers: 4,

  // Per-layer settings (up to MAX_LAYERS)
  layers: [
    { enabled: true, threshold: 210, angle: 90, style: "Cross hatching", density: 2400 },
    { enabled: true, threshold: 170, angle: 45, style: "Cross hatching", density: 2200 },
    { enabled: true, threshold: 120, angle: 135, style: "Single hatch", density: 1800 },
    { enabled: false, threshold: 85, angle: 0, style: "Zig zag", density: 1500 },
    { enabled: false, threshold: 55, angle: 30, style: "Scribble", density: 1200 },
  ],
};

function preload() {
  img = loadImage("old/couple-dancing-in-studio-bw-george-marks.jpg");
}

function setup() {
  // Fit image to the window while keeping aspect ratio
  scaleFactor = 1;
  if (img.width > windowWidth || img.height > windowHeight) {
    const scaleW = windowWidth / img.width;
    const scaleH = windowHeight / img.height;
    scaleFactor = min(scaleW, scaleH) * 0.9;
  }

  const canvas = createCanvas(img.width * scaleFactor, img.height * scaleFactor);
  canvas.parent("canvas-container");

  cacheGrayPixels();
  setupGUI();

  noLoop();
  redraw();
}

function cacheGrayPixels() {
  const w = img.width;
  const h = img.height;
  grayPixels = new Uint8Array(w * h);

  img.loadPixels();
  for (let i = 0; i < w * h; i++) {
    const r = img.pixels[i * 4];
    const g = img.pixels[i * 4 + 1];
    const b = img.pixels[i * 4 + 2];
    // Luminance
    grayPixels[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
}

function setupGUI() {
  if (gui) {
    gui.destroy();
  }

  gui = new dat.GUI({ autoPlace: false });

  // Attach GUI to the canvas container to keep it aligned
  const container = document.getElementById("canvas-container");
  container.appendChild(gui.domElement);

  // Image adjustments
  const imgFolder = gui.addFolder("Image");
  imgFolder.add(params, "contrast", 0.3, 3, 0.05).name("Contrast").onChange(redraw);
  imgFolder.add(params, "brightness", -120, 120, 1).name("Brightness").onChange(redraw);
  imgFolder.add(params, "numLayers", 1, MAX_LAYERS, 1).name("Active Layers").onChange(updateLayerGUI);
  imgFolder.open();

  // Global stroke settings
  const strokeFolder = gui.addFolder("Stroke");
  strokeFolder.add(params, "strokeWeight", 0.5, 4, 0.1).name("Weight").onChange(redraw);
  strokeFolder.add(params, "lineLength", 6, 120, 2).name("Max Length").onChange(redraw);
  strokeFolder.add(params, "stepSize", 1, 10, 0.5).name("Step Size").onChange(redraw);
  strokeFolder.add(params, "lineSpacing", 2, 24, 1).name("Spacing").onChange(redraw);

  setupLayerControls();
}

function setupLayerControls() {
  // Build layer folders
  for (let i = 0; i < params.numLayers && i < MAX_LAYERS; i++) {
    const layer = params.layers[i];
    const folder = gui.addFolder(`Layer ${i + 1}`);

    folder.add(layer, "enabled").name("Enabled").onChange(redraw);
    folder.add(layer, "threshold", 0, 255, 1).name("Threshold").onChange(redraw);
    folder.add(layer, "angle", 0, 360, 1).name("Angle (deg)").onChange(redraw);
    folder
      .add(layer, "style", Object.keys(HATCHING_STYLES))
      .name("Style")
      .onChange(redraw);
    folder.add(layer, "density", 200, 8000, 100).name("Density").onChange(redraw);
  }
}

function updateLayerGUI() {
  setupGUI();
  redraw();
}

function draw() {
  background(255);
  strokeWeight(params.strokeWeight);

  for (let i = 0; i < params.numLayers && i < MAX_LAYERS; i++) {
    const layer = params.layers[i];
    if (!layer.enabled) continue;

    const styleKey = HATCHING_STYLES[layer.style] || HATCHING_STYLES["Cross hatching"];
    drawLayer(layer.threshold, layer.angle, styleKey, layer.density);
  }
}

function drawLayer(threshold, angleDeg, style, density) {
  stroke(0);
  noFill();

  let count = 0;
  let attempts = 0;
  const maxAttempts = density * 8; // Avoid infinite loops on high thresholds

  while (count < density && attempts < maxAttempts) {
    attempts++;
    const x = random(width);
    const y = random(height);
    const val = getProcessedBrightness(x, y);
    if (val > threshold) continue;

    drawStyle(x, y, angleDeg, style, threshold);
    count++;
  }
}

function drawStyle(x, y, angleDeg, style, threshold) {
  const angle = radians(angleDeg);

  switch (style) {
    case "cross":
      drawLineSegment(x, y, angle, threshold);
      drawLineSegment(x, y, angle + HALF_PI, threshold);
      break;
    case "hatch":
      drawLineSegment(x, y, angle, threshold);
      break;
    case "scribble":
      drawScribble(x, y, threshold);
      break;
    case "zigzag":
      drawZigZag(x, y, angle, threshold);
      break;
    case "circles":
      drawCircleCluster(x, y, threshold);
      break;
  }
}

function drawLineSegment(startX, startY, angleRad, threshold) {
  const dx = cos(angleRad) * params.stepSize;
  const dy = sin(angleRad) * params.stepSize;
  const halfLen = params.lineLength / 2;

  const points = [];

  // Forward
  let x = startX;
  let y = startY;
  for (let l = 0; l < halfLen; l += params.stepSize) {
    if (outOfBounds(x, y) || getProcessedBrightness(x, y) > threshold + 10) break;
    points.push({ x, y });
    x += dx;
    y += dy;
  }

  // Backward
  x = startX - dx;
  y = startY - dy;
  const back = [];
  for (let l = 0; l < halfLen; l += params.stepSize) {
    if (outOfBounds(x, y) || getProcessedBrightness(x, y) > threshold + 10) break;
    back.push({ x, y });
    x -= dx;
    y -= dy;
  }

  if (points.length + back.length < 2) return;

  beginShape();
  for (let i = back.length - 1; i >= 0; i--) {
    vertex(back[i].x, back[i].y);
  }
  vertex(startX, startY);
  for (const p of points) {
    vertex(p.x, p.y);
  }
  endShape();
}

function drawScribble(x, y, threshold) {
  let px = x;
  let py = y;

  beginShape();
  for (let i = 0; i < params.lineLength * 2; i += params.stepSize) {
    if (outOfBounds(px, py) || getProcessedBrightness(px, py) > threshold) break;
    vertex(px, py);
    px += random(-params.lineSpacing, params.lineSpacing);
    py += random(-params.lineSpacing, params.lineSpacing);
  }
  endShape();
}

function drawZigZag(x, y, angle, threshold) {
  const dx = cos(angle) * params.stepSize;
  const dy = sin(angle) * params.stepSize;
  const pdx = -dy;
  const pdy = dx;
  const zig = params.lineSpacing;

  let px = x;
  let py = y;

  beginShape();
  for (let i = 0; i < params.lineLength; i += params.stepSize) {
    if (outOfBounds(px, py) || getProcessedBrightness(px, py) > threshold) break;
    const offset = i % (zig * 2) < zig ? zig : -zig;
    vertex(px + pdx * offset * 0.3, py + pdy * offset * 0.3);
    px += dx;
    py += dy;
  }
  endShape();
}

function drawCircleCluster(x, y, threshold) {
  const val = getProcessedBrightness(x, y);
  const darkness = map(val, 0, threshold, 1, 0, true);
  const baseR = map(darkness, 0, 1, 2, params.lineSpacing * 1.2);
  const circles = max(1, floor(darkness * 4));

  for (let i = 0; i < circles; i++) {
    const ox = random(-baseR, baseR);
    const oy = random(-baseR, baseR);
    const r = random(baseR * 0.4, baseR);
    ellipse(x + ox, y + oy, r, r);
  }
}

function outOfBounds(x, y) {
  return x < 0 || x >= width || y < 0 || y >= height;
}

function getProcessedBrightness(x, y) {
  // Map canvas coords to image coords
  let imgX = floor(x / scaleFactor);
  let imgY = floor(y / scaleFactor);

  imgX = constrain(imgX, 0, img.width - 1);
  imgY = constrain(imgY, 0, img.height - 1);

  const idx = imgY * img.width + imgX;
  const raw = grayPixels[idx];

  // Contrast/brightness adjustments around mid-gray
  const contrasted = params.contrast * (raw - 128) + 128 + params.brightness;
  return constrain(contrasted, 0, 255);
}

