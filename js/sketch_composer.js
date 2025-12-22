let img;
let scaleFactor;
let grayPixels;
let gui;

// Hatching styles based on value scale examples
const HATCHING_STYLES = {
  "Cross-hatching": "cross",
  Hatching: "hatch",
  Scribbles: "scribble",
  "Zig-zags": "zigzag",
  Circles: "circles",
};

// Parameters with dat.gui controls
let params = {
  // Global image adjustments
  contrast: 1.0, // Overall contrast multiplier
  brightness: 0, // Brightness adjustment

  // Number of layers (max 5)
  numLayers: 3,

  // Global line settings
  lineLength: 20,
  stepSize: 2,
  lineSpacing: 5,

  // Layer 1 (Darkest shadows)
  layer1_enabled: true,
  layer1_threshold: 200,
  layer1_angle: 45,
  layer1_style: "cross",
  layer1_density: 3000,

  // Layer 2 (Mid-dark tones)
  layer2_enabled: true,
  layer2_threshold: 150,
  layer2_angle: 135,
  layer2_style: "cross",
  layer2_density: 3000,

  // Layer 3 (Mid-tones)
  layer3_enabled: true,
  layer3_threshold: 100,
  layer3_angle: 0,
  layer3_style: "hatch",
  layer3_density: 2000,

  // Layer 4 (Light tones)
  layer4_enabled: false,
  layer4_threshold: 60,
  layer4_angle: 90,
  layer4_style: "hatch",
  layer4_density: 1500,

  // Layer 5 (Lightest tones)
  layer5_enabled: false,
  layer5_threshold: 30,
  layer5_angle: 30,
  layer5_style: "scribble",
  layer5_density: 1000,
};

function preload() {
  // Load default image - you can change this
  img = loadImage("old/couple-dancing-in-studio-bw-george-marks.jpg");
}

function setup() {
  // Scale down if image is too large for screen
  scaleFactor = 1;
  if (img.width > windowWidth || img.height > windowHeight) {
    let scaleW = windowWidth / img.width;
    let scaleH = windowHeight / img.height;
    scaleFactor = min(scaleW, scaleH) * 0.9;
  }

  // Create canvas matching the (scaled) image size
  let canvas = createCanvas(img.width * scaleFactor, img.height * scaleFactor);
  canvas.parent("canvas-container");

  // Pre-process image to grayscale
  cacheGrayPixels();

  setupGUI();
  noLoop();
  redraw();
}

function setupGUI() {
  if (gui) gui.destroy();
  gui = new dat.GUI();

  // Image adjustments folder
  let imgFolder = gui.addFolder("Image Adjustments");
  imgFolder
    .add(params, "contrast", 0.5, 3.0, 0.1)
    .name("Contrast")
    .onChange(redraw);
  imgFolder
    .add(params, "brightness", -100, 100, 5)
    .name("Brightness")
    .onChange(redraw);
  imgFolder.open();

  // Global line settings folder
  let globalFolder = gui.addFolder("Global Line Settings");
  globalFolder
    .add(params, "lineLength", 5, 100, 1)
    .name("Max Length")
    .onChange(redraw);
  globalFolder
    .add(params, "stepSize", 1, 10, 0.5)
    .name("Step Size")
    .onChange(redraw);
  globalFolder
    .add(params, "lineSpacing", 2, 50, 1)
    .name("Min Spacing")
    .onChange(redraw);

  // Number of layers control
  gui
    .add(params, "numLayers", 1, 5, 1)
    .name("Number of Layers")
    .onChange(updateLayerGUI);

  // Setup layer controls
  setupLayerControls();
}

function setupLayerControls() {
  // Remove old layer folders if any
  let folders = gui.__folders;
  for (let key in folders) {
    if (key.startsWith("Layer ")) {
      gui.removeFolder(folders[key]);
    }
  }

  // Create controls for each active layer
  for (let i = 1; i <= params.numLayers; i++) {
    let layerFolder = gui.addFolder(`Layer ${i}`);
    layerFolder
      .add(params, `layer${i}_enabled`)
      .name("Enabled")
      .onChange(redraw);
    layerFolder
      .add(params, `layer${i}_threshold`, 0, 255, 1)
      .name("Threshold (0-255)")
      .onChange(redraw);
    layerFolder
      .add(params, `layer${i}_angle`, 0, 360, 1)
      .name("Angle (degrees)")
      .onChange(redraw);
    layerFolder
      .add(params, `layer${i}_style`, HATCHING_STYLES)
      .name("Style")
      .onChange(redraw);
    layerFolder
      .add(params, `layer${i}_density`, 100, 10000, 100)
      .name("Density (Count)")
      .onChange(redraw);
    layerFolder.open();
  }
}

function updateLayerGUI() {
  setupLayerControls();
  redraw();
}

function draw() {
  background(255);

  // Draw each enabled layer
  for (let i = 1; i <= params.numLayers; i++) {
    if (!params[`layer${i}_enabled`]) continue;

    let threshold = params[`layer${i}_threshold`];
    let angle = params[`layer${i}_angle`];
    let style = params[`layer${i}_style`];
    let density = params[`layer${i}_density`];

    drawLayer(i, threshold, angle, style, density);
  }
}

function drawLayer(layerIdx, threshold, angle, style, density) {
  stroke(0);
  strokeWeight(1);
  noFill();

  let count = 0;
  let attempts = 0;
  let maxAttempts = density * 10; // Avoid infinite loops

  while (count < density && attempts < maxAttempts) {
    attempts++;

    // Pick a random spot
    let rx = random(width);
    let ry = random(height);

    // Check brightness with contrast/brightness applied
    let val = getProcessedBrightness(rx, ry);

    // If pixel is brighter than threshold, skip
    // Lower threshold = only covers very dark areas
    // Higher threshold = covers more light areas (more density)
    if (val > threshold) continue;

    // Draw the hatching style at this location
    drawStyle(rx, ry, angle, style, threshold);
    count++;
  }
}

function drawStyle(x, y, angleDeg, style, threshold) {
  let angle = radians(angleDeg);

  switch (style) {
    case "cross":
      // Cross-hatching: draw primary line and perpendicular line
      drawLine(x, y, angle, threshold);
      drawLine(x, y, angle + HALF_PI, threshold);
      break;
    case "hatch":
      // Single direction hatching
      drawLine(x, y, angle, threshold);
      break;
    case "scribble":
      // Scribbled/squiggled lines
      drawScribble(x, y, threshold);
      break;
    case "zigzag":
      // Zig-zag pattern
      drawZigZag(x, y, angle, threshold);
      break;
    case "circles":
      // Circular/oval patterns
      drawCircle(x, y, threshold);
      break;
  }
}

// --- Drawing Primitives ---

function drawLine(startX, startY, angleRad, threshold) {
  let dx = cos(angleRad) * params.stepSize;
  let dy = sin(angleRad) * params.stepSize;

  let x = startX;
  let y = startY;

  let points = [];

  // Trace forward
  for (let i = 0; i < params.lineLength / 2; i += params.stepSize) {
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    // Stop if we hit a bright area
    if (getProcessedBrightness(x, y) > threshold + 20) break; // +20 buffer

    points.push({ x, y });
    x += dx;
    y += dy;
  }

  // Trace backward
  x = startX - dx;
  y = startY - dy;
  for (let i = 0; i < params.lineLength / 2; i += params.stepSize) {
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    if (getProcessedBrightness(x, y) > threshold + 20) break;

    points.unshift({ x, y }); // Add to start
    x -= dx;
    y -= dy;
  }

  if (points.length < 2) return;

  beginShape();
  for (let p of points) vertex(p.x, p.y);
  endShape();
}

function drawScribble(x, y, threshold) {
  let px = x;
  let py = y;

  beginShape();
  for (let i = 0; i < params.lineLength * 2; i += 3) {
    if (px < 0 || px >= width || py < 0 || py >= height) break;
    if (getProcessedBrightness(px, py) > threshold) break;

    vertex(px, py);

    // Random walk for scribble effect
    px += random(-5, 5);
    py += random(-5, 5);
  }
  endShape();
}

function drawZigZag(x, y, angle, threshold) {
  let px = x;
  let py = y;
  let dx = cos(angle);
  let dy = sin(angle);

  // Perpendicular direction for zig zag
  let pdx = -dy;
  let pdy = dx;

  let zigSize = 3;

  beginShape();
  for (let i = 0; i < params.lineLength; i += 2) {
    if (px < 0 || px >= width || py < 0 || py >= height) break;
    if (getProcessedBrightness(px, py) > threshold) break;

    let offset = i % 4 < 2 ? zigSize : -zigSize;
    vertex(px + pdx * offset, py + pdy * offset);

    px += dx * 2;
    py += dy * 2;
  }
  endShape();
}

function drawCircle(x, y, threshold) {
  // Draw circles/ovals based on local darkness
  let val = getProcessedBrightness(x, y);
  let darkness = map(val, 0, threshold, 1, 0); // Inverse: darker = higher value
  let r = map(darkness, 0, 1, 2, 10);

  // Draw multiple overlapping circles for darker areas
  let numCircles = floor(darkness * 3) + 1;
  for (let i = 0; i < numCircles; i++) {
    let offsetX = random(-r, r);
    let offsetY = random(-r, r);
    let circleR = random(r * 0.5, r);
    ellipse(x + offsetX, y + offsetY, circleR, circleR);
  }
}

// --- Helper Functions ---

function getProcessedBrightness(x, y) {
  // Map screen coordinates back to image coordinates
  let imgX = floor(x / scaleFactor);
  let imgY = floor(y / scaleFactor);

  // Clamp to image bounds
  imgX = constrain(imgX, 0, img.width - 1);
  imgY = constrain(imgY, 0, img.height - 1);

  let idx = imgY * img.width + imgX;
  let rawVal = grayPixels[idx];

  // Apply contrast and brightness
  // Contrast formula: factor * (value - 128) + 128
  let val = params.contrast * (rawVal - 128) + 128 + params.brightness;
  return constrain(val, 0, 255);
}

function cacheGrayPixels() {
  let w = img.width;
  let h = img.height;
  grayPixels = new Uint8Array(w * h);

  img.loadPixels();
  for (let i = 0; i < w * h; i++) {
    let r = img.pixels[i * 4];
    let g = img.pixels[i * 4 + 1];
    let b = img.pixels[i * 4 + 2];
    // Luminance formula
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    grayPixels[i] = gray;
  }
}
