let img;
let scaleFactor;
let grayPixels; // cached grayscale values for fast lookups

// dat.GUI instance
let gui;

// Global hatching controls
let params = {
  contrast: 0.6, // 0 = dense/black, 1 = sparse/white
  layersCount: 4, // 1..5
  baseSpacing: 4,
  spacingJitter: 1,
  angleJitter: 3,
  stepSize: 1.2,
  lineWeight: 1,
};

// Per-layer defaults (up to 5)
let layerSettings = [
  { angle: 90, threshold: 220, spacingMul: 2.0 },
  { angle: 0, threshold: 175, spacingMul: 1.8 },
  { angle: 45, threshold: 135, spacingMul: 1.4 },
  { angle: 135, threshold: 95, spacingMul: 1.1 },
  { angle: 25, threshold: 60, spacingMul: 0.9 },
];

function preload() {
  // Feel free to swap the source image; the GUI drives the rest
  img = loadImage(
    "old/oulu/museovirasto.45a47a74-0268-441d-8e4c-3157b75f63eb-0-master Ainola's bridge and Oulu Cathedral in Finland in 1960..jpg"
  );
}

function setup() {
  scaleFactor = 4; // down-scale for speed; lower value = bigger canvas

  let canvas = createCanvas(img.width / scaleFactor, img.height / scaleFactor);
  canvas.parent("canvas-container");

  convertToGray(img);
  cacheGrayPixels();

  buildGUI();
  noLoop();
}

function draw() {
  background(255);
  strokeWeight(params.lineWeight);
  stroke(0);

  // Contrast remaps thresholds: low contrast → more ink, high → less
  let contrastMult = map(params.contrast, 0, 1, 2, 0);

  for (let i = 0; i < params.layersCount && i < layerSettings.length; i++) {
    let layer = layerSettings[i];
    let threshold = min(255, layer.threshold * contrastMult);
    let spacing = max(1, params.baseSpacing * layer.spacingMul);
    let angle = layer.angle;

    drawThresholdLines(
      angle,
      spacing,
      params.stepSize,
      threshold,
      params.spacingJitter,
      params.angleJitter
    );
  }
}

// -----------------------
// GUI
// -----------------------
function buildGUI() {
  if (gui) {
    gui.destroy();
  }

  gui = new dat.GUI({ autoPlace: false });
  let guiContainer = document.getElementById("canvas-container");
  guiContainer.appendChild(gui.domElement);

  gui.add(params, "contrast", 0, 1, 0.01).name("Contrast").onChange(redraw);

  gui
    .add(params, "layersCount", 1, 5, 1)
    .name("Layers (max 5)")
    .onChange((val) => {
      params.layersCount = val;
      // Rebuild to refresh layer folders
      buildGUI();
      redraw();
    });

  gui.add(params, "baseSpacing", 2, 15, 0.5).name("Base Spacing").onChange(redraw);
  gui
    .add(params, "spacingJitter", 0, 5, 0.1)
    .name("Spacing Jitter")
    .onChange(redraw);
  gui
    .add(params, "angleJitter", 0, 15, 0.5)
    .name("Angle Jitter")
    .onChange(redraw);
  gui.add(params, "stepSize", 0.5, 5, 0.1).name("Step Size").onChange(redraw);
  gui.add(params, "lineWeight", 0.5, 3, 0.1).name("Line Weight").onChange(redraw);

  for (let i = 0; i < params.layersCount && i < layerSettings.length; i++) {
    let layer = layerSettings[i];
    let folder = gui.addFolder(`Layer ${i + 1}`);
    folder.add(layer, "threshold", 0, 255, 1).name("Threshold").onChange(redraw);
    folder.add(layer, "angle", -180, 180, 1).name("Angle (°)").onChange(redraw);
    folder.add(layer, "spacingMul", 0.5, 3, 0.1).name("Spacing ×").onChange(redraw);
  }
}

// -----------------------
// Hatching core
// -----------------------
function drawThresholdLines(
  baseAngle,
  baseLineSpacing,
  stepSize,
  threshold,
  lineSpacingRandom,
  angleRandom
) {
  // Spawn lines from left and top edges

  // 1) From left edge
  let currentY = 0;
  while (currentY < height) {
    let actualAngle = baseAngle + random(-angleRandom, angleRandom);
    traceLine(0, currentY, actualAngle, stepSize, threshold);

    let spacing = baseLineSpacing + random(-lineSpacingRandom, lineSpacingRandom);
    spacing = max(spacing, 1);
    currentY += spacing;
  }

  // 2) From top edge
  let currentX = 0;
  while (currentX < width) {
    let actualAngle = baseAngle + random(-angleRandom, angleRandom);
    traceLine(currentX, 0, actualAngle, stepSize, threshold);

    let spacing = baseLineSpacing + random(-lineSpacingRandom, lineSpacingRandom);
    spacing = max(spacing, 1);
    currentX += spacing;
  }
}

function traceLine(startX, startY, angleDeg, stepSize, threshold) {
  let angle = radians(angleDeg);
  let cosA = cos(angle);
  let sinA = sin(angle);

  let t = 0;
  let lineStart = null;

  while (true) {
    let x = startX + t * cosA;
    let y = startY + t * sinA;

    if (x < 0 || x >= width || y < 0 || y >= height) {
      if (lineStart !== null) {
        line(lineStart.x, lineStart.y, x, y);
      }
      break;
    }

    let bright = getBrightnessFast(x, y);

    if (bright < threshold) {
      if (lineStart === null) {
        lineStart = { x, y };
      }
    } else if (lineStart !== null) {
      line(lineStart.x, lineStart.y, x, y);
      lineStart = null;
    }

    t += stepSize;
  }
}

// -----------------------
// Image helpers
// -----------------------
function cacheGrayPixels() {
  let w = img.width;
  let h = img.height;
  grayPixels = new Uint8Array(w * h);

  img.loadPixels();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = (y * w + x) * 4;
      grayPixels[y * w + x] = img.pixels[idx];
    }
  }
}

function getBrightnessFast(x, y) {
  let bx = floor(x * scaleFactor);
  let by = floor(y * scaleFactor);

  bx = constrain(bx, 0, img.width - 1);
  by = constrain(by, 0, img.height - 1);

  return grayPixels[by * img.width + bx];
}

function convertToGray(inputImg) {
  inputImg.loadPixels();
  for (let y = 0; y < inputImg.height; y++) {
    for (let x = 0; x < inputImg.width; x++) {
      let idx = (y * inputImg.width + x) * 4;
      let r = inputImg.pixels[idx + 0];
      let g = inputImg.pixels[idx + 1];
      let b = inputImg.pixels[idx + 2];
      let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      inputImg.pixels[idx + 0] = gray;
      inputImg.pixels[idx + 1] = gray;
      inputImg.pixels[idx + 2] = gray;
    }
  }
  inputImg.updatePixels();
}
let img;
let scaleFactor;
let grayPixels; // Cached grayscale values for fast access

// Grid to track where lines have been drawn
let drawnGrid;
let gridResolution = 2;

// dat.GUI instance
let gui;

// Hatching style options
const HATCHING_STYLES = {
  "Cross-hatching": "cross",
  Hatching: "hatch",
  Scribbles: "scribble",
  "Zig-zags": "zigzag",
  Circles: "circles",
};

// ========================================
// CROSS HATCHING PARAMETERS
// ========================================
let params = {
  contrast: 0.5,
  numLayers: 3,
  // Layer configurations (up to 5 layers)
  layer1_enabled: true,
  layer1_threshold: 220,
  layer1_angle: 90,
  layer1_style: "Cross-hatching",
  layer1_density: 2000,

  layer2_enabled: true,
  layer2_threshold: 150,
  layer2_angle: 0,
  layer2_style: "Cross-hatching",
  layer2_density: 2000,

  layer3_enabled: true,
  layer3_threshold: 80,
  layer3_angle: 45,
  layer3_style: "Cross-hatching",
  layer3_density: 2000,

  layer4_enabled: false,
  layer4_threshold: 50,
  layer4_angle: 135,
  layer4_style: "Cross-hatching",
  layer4_density: 2000,

  layer5_enabled: false,
  layer5_threshold: 30,
  layer5_angle: 22.5,
  layer5_style: "Cross-hatching",
  layer5_density: 2000,

  // Global settings
  lineLength: 30,
  stepSize: 2,
  lineSpacing: 5,
};

function preload() {
  img = loadImage(
    "old/oulu/museovirasto.45a47a74-0268-441d-8e4c-3157b75f63eb-0-master Ainola's bridge and Oulu Cathedral in Finland in 1960..jpg"
  );
}

function setup() {
  scaleFactor = 4;
  let canvas = createCanvas(img.width / scaleFactor, img.height / scaleFactor);
  canvas.parent("canvas-container");

  // Convert to grayscale and cache values
  convertToGray(img);
  cacheGrayPixels();

  // Setup dat.GUI
  gui = new dat.GUI({ autoPlace: false });

  let guiContainer = document.getElementById("canvas-container");
  guiContainer.appendChild(gui.domElement);

  // Main controls
  gui
    .add(params, "contrast", 0, 1, 0.01)
    .name("Overall Contrast")
    .onChange(redraw);
  gui
    .add(params, "numLayers", 1, 5, 1)
    .name("Number of Layers")
    .onChange(updateGUI);

  // Global settings
  let globalFolder = gui.addFolder("Global Settings");
  globalFolder
    .add(params, "lineLength", 10, 100, 5)
    .name("Line Length")
    .onChange(redraw);
  globalFolder
    .add(params, "stepSize", 1, 10, 0.5)
    .name("Step Size")
    .onChange(redraw);
  globalFolder
    .add(params, "lineSpacing", 2, 20, 1)
    .name("Line Spacing")
    .onChange(redraw);

  // Layer controls
  setupLayerControls();

  noLoop();
}

function setupLayerControls() {
  // Remove existing layer folders
  let folders = gui.__folders;
  for (let key in folders) {
    if (key.startsWith("Layer")) {
      gui.removeFolder(folders[key]);
    }
  }

  // Create layer folders
  for (let i = 1; i <= params.numLayers; i++) {
    let layerFolder = gui.addFolder(`Layer ${i}`);
    let enabledKey = `layer${i}_enabled`;
    let thresholdKey = `layer${i}_threshold`;
    let angleKey = `layer${i}_angle`;
    let styleKey = `layer${i}_style`;
    let densityKey = `layer${i}_density`;

    layerFolder.add(params, enabledKey).name("Enabled").onChange(redraw);
    layerFolder
      .add(params, thresholdKey, 0, 255, 5)
      .name("Threshold")
      .onChange(redraw);
    layerFolder
      .add(params, angleKey, 0, 180, 1)
      .name("Angle (degrees)")
      .onChange(redraw);
    layerFolder
      .add(params, styleKey, Object.keys(HATCHING_STYLES))
      .name("Style")
      .onChange(redraw);
    layerFolder
      .add(params, densityKey, 500, 10000, 100)
      .name("Density")
      .onChange(redraw);

    layerFolder.open();
  }
}

function updateGUI() {
  setupLayerControls();
  redraw();
}

/**
 * Cache grayscale pixel values for fast access.
 */
function cacheGrayPixels() {
  let w = img.width;
  let h = img.height;
  grayPixels = new Uint8Array(w * h);

  img.loadPixels();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = (y * w + x) * 4;
      grayPixels[y * w + x] = img.pixels[idx];
    }
  }
}

function draw() {
  background(255);

  // Reset grid
  let gridWidth = ceil(width / gridResolution);
  let gridHeight = ceil(height / gridResolution);
  drawnGrid = new Uint8Array(gridWidth * gridHeight);

  // Contrast adjustment
  // Higher contrast = more dramatic difference between light and dark
  // We'll apply contrast when reading brightness values

  // Draw each enabled layer
  for (let i = 1; i <= params.numLayers; i++) {
    let enabledKey = `layer${i}_enabled`;
    if (!params[enabledKey]) continue;

    let thresholdKey = `layer${i}_threshold`;
    let angleKey = `layer${i}_angle`;
    let styleKey = `layer${i}_style`;
    let densityKey = `layer${i}_density`;

    let threshold = params[thresholdKey];
    let angle = params[angleKey];
    let styleName = params[styleKey];
    let style = HATCHING_STYLES[styleName] || HATCHING_STYLES["Cross-hatching"];
    let density = params[densityKey];

    drawHatchLayer(threshold, angle, style, density);
  }
}

/**
 * Draw a hatching layer at a specific angle with a specific style.
 */
function drawHatchLayer(threshold, angleDeg, style, density) {
  stroke(0);
  strokeWeight(1);
  noFill();

  let angle = radians(angleDeg);
  let cosA = cos(angle);
  let sinA = sin(angle);

  let numLines = floor(density);

  switch (style) {
    case "cross":
      drawCrossHatching(numLines, threshold, angle);
      break;
    case "hatch":
      drawHatching(numLines, threshold, angle);
      break;
    case "scribble":
      drawScribbles(numLines, threshold, angle);
      break;
    case "zigzag":
      drawZigZags(numLines, threshold, angle);
      break;
    case "circles":
      drawCircles(numLines, threshold, angle);
      break;
  }
}

/**
 * Draw cross-hatching (lines in one direction, then perpendicular)
 */
function drawCrossHatching(numLines, threshold, angle) {
  // First direction
  drawHatchingLines(numLines / 2, threshold, angle);
  // Perpendicular direction
  drawHatchingLines(numLines / 2, threshold, angle + 90);
}

/**
 * Draw parallel hatching lines
 */
function drawHatching(numLines, threshold, angle) {
  drawHatchingLines(numLines, threshold, angle);
}

/**
 * Core function to draw parallel lines
 */
function drawHatchingLines(numLines, threshold, angle) {
  let angleRad = radians(angle);
  let cosA = cos(angleRad);
  let sinA = sin(angleRad);

  // Calculate perpendicular direction for spacing
  let perpAngle = angleRad + PI / 2;
  let perpCos = cos(perpAngle);
  let perpSin = sin(perpAngle);

  for (let i = 0; i < numLines; i++) {
    // Random starting point
    let x = random(width);
    let y = random(height);

    // Check if starting point is dark enough
    let bright = getBrightnessFast(x, y);
    if (bright >= threshold) continue;

    // Check if already occupied
    if (isGridOccupied(x, y)) continue;

    // Draw line in both directions
    drawStraightLine(x, y, cosA, sinA, threshold);
  }
}

/**
 * Draw scribbles/squiggles
 */
function drawScribbles(numLines, threshold, angle) {
  for (let i = 0; i < numLines; i++) {
    let x = random(width);
    let y = random(height);

    let bright = getBrightnessFast(x, y);
    if (bright >= threshold) continue;
    if (isGridOccupied(x, y)) continue;

    drawScribble(x, y, threshold, angle);
  }
}

/**
 * Draw a single scribble
 */
function drawScribble(startX, startY, threshold, baseAngle) {
  let points = [];
  let x = startX;
  let y = startY;
  let stepSize = params.stepSize;
  let maxLength = params.lineLength * 2;

  for (let i = 0; i < maxLength; i++) {
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    if (isGridOccupied(x, y)) break;
    if (getBrightnessFast(x, y) >= threshold) break;

    points.push({ x, y });
    markGridOccupied(x, y);

    // Random direction with slight bias towards base angle
    let angle = radians(baseAngle) + random(-PI / 3, PI / 3);
    x += cos(angle) * stepSize;
    y += sin(angle) * stepSize;
  }

  if (points.length < 2) return;

  beginShape();
  for (let p of points) {
    vertex(p.x, p.y);
  }
  endShape();
}

/**
 * Draw zig-zag lines
 */
function drawZigZags(numLines, threshold, angle) {
  for (let i = 0; i < numLines; i++) {
    let x = random(width);
    let y = random(height);

    let bright = getBrightnessFast(x, y);
    if (bright >= threshold) continue;
    if (isGridOccupied(x, y)) continue;

    drawZigZag(x, y, threshold, angle);
  }
}

/**
 * Draw a single zig-zag line
 */
function drawZigZag(startX, startY, threshold, baseAngle) {
  let points = [];
  let x = startX;
  let y = startY;
  let stepSize = params.stepSize;
  let zigSize = params.lineSpacing;
  let maxLength = params.lineLength * 2;
  let angle = radians(baseAngle);
  let perpAngle = angle + PI / 2;
  let direction = 1;

  for (let i = 0; i < maxLength; i++) {
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    if (isGridOccupied(x, y)) break;
    if (getBrightnessFast(x, y) >= threshold) break;

    points.push({ x, y });
    markGridOccupied(x, y);

    // Move forward along base angle
    x += cos(angle) * stepSize;
    y += sin(angle) * stepSize;

    // Zig-zag perpendicular to base angle
    if (i % zigSize === 0) {
      direction *= -1;
    }
    x += cos(perpAngle) * direction * stepSize * 0.5;
    y += sin(perpAngle) * direction * stepSize * 0.5;
  }

  if (points.length < 2) return;

  beginShape();
  for (let p of points) {
    vertex(p.x, p.y);
  }
  endShape();
}

/**
 * Draw circles/ovals
 */
function drawCircles(numCircles, threshold, angle) {
  for (let i = 0; i < numCircles; i++) {
    let x = random(width);
    let y = random(height);

    let bright = getBrightnessFast(x, y);
    if (bright >= threshold) continue;
    if (isGridOccupied(x, y)) continue;

    // Circle size based on darkness
    let darkness = 1 - bright / 255;
    let radius = map(darkness, 0, 1, 2, params.lineSpacing * 2);

    // Draw circle outline
    let numPoints = 16;
    let points = [];
    for (let j = 0; j < numPoints; j++) {
      let a = (TWO_PI / numPoints) * j;
      let px = x + cos(a) * radius;
      let py = y + sin(a) * radius;

      if (px >= 0 && px < width && py >= 0 && py < height) {
        if (getBrightnessFast(px, py) < threshold) {
          points.push({ x: px, y: py });
          markGridOccupied(px, py);
        }
      }
    }

    if (points.length < 3) continue;

    beginShape();
    for (let p of points) {
      vertex(p.x, p.y);
    }
    endShape(CLOSE);
  }
}

/**
 * Draw a straight line at given angle, checking brightness threshold.
 */
function drawStraightLine(startX, startY, cosA, sinA, threshold) {
  let points = [];
  let stepSize = params.stepSize;
  let halfLen = params.lineLength / 2;

  // Forward direction
  let x = startX;
  let y = startY;
  let len = 0;

  while (len < halfLen) {
    let newX = x + cosA * stepSize;
    let newY = y + sinA * stepSize;

    if (newX < 0 || newX >= width || newY < 0 || newY >= height) break;
    if (isGridOccupied(newX, newY)) break;
    if (getBrightnessFast(newX, newY) >= threshold) break;

    x = newX;
    y = newY;
    len += stepSize;
    points.push({ x, y });
  }

  // Backward direction
  x = startX;
  y = startY;
  len = 0;
  let backPoints = [];

  while (len < halfLen) {
    let newX = x - cosA * stepSize;
    let newY = y - sinA * stepSize;

    if (newX < 0 || newX >= width || newY < 0 || newY >= height) break;
    if (isGridOccupied(newX, newY)) break;
    if (getBrightnessFast(newX, newY) >= threshold) break;

    x = newX;
    y = newY;
    len += stepSize;
    backPoints.push({ x, y });
  }

  // Need at least a few points
  let totalPoints = points.length + backPoints.length + 1;
  if (totalPoints < 3) return;

  // Draw the line
  beginShape();

  // Backward points (reversed)
  for (let i = backPoints.length - 1; i >= 0; i--) {
    let p = backPoints[i];
    vertex(p.x, p.y);
    markGridOccupied(p.x, p.y);
  }

  // Center point
  vertex(startX, startY);
  markGridOccupied(startX, startY);

  // Forward points
  for (let p of points) {
    vertex(p.x, p.y);
    markGridOccupied(p.x, p.y);
  }

  endShape();
}

/**
 * Fast brightness lookup using cached array with contrast adjustment.
 */
function getBrightnessFast(x, y) {
  let imgX = floor(x * scaleFactor);
  let imgY = floor(y * scaleFactor);

  if (imgX < 0) imgX = 0;
  if (imgX >= img.width) imgX = img.width - 1;
  if (imgY < 0) imgY = 0;
  if (imgY >= img.height) imgY = img.height - 1;

  let brightness = grayPixels[imgY * img.width + imgX];

  // Apply contrast adjustment
  // Contrast: 0 = low contrast (softer), 1 = high contrast (dramatic)
  // Formula: adjust brightness around midpoint (128)
  let contrastFactor = map(params.contrast, 0, 1, 0.5, 2.0);
  let adjusted = 128 + (brightness - 128) * contrastFactor;

  return constrain(adjusted, 0, 255);
}

/**
 * Check if grid cell is occupied.
 */
function isGridOccupied(x, y) {
  let gridX = floor(x / gridResolution);
  let gridY = floor(y / gridResolution);
  let gridWidth = ceil(width / gridResolution);
  let gridHeight = ceil(height / gridResolution);

  if (gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) {
    return true;
  }

  return drawnGrid[gridY * gridWidth + gridX] === 1;
}

/**
 * Mark grid cell as occupied.
 */
function markGridOccupied(x, y) {
  let gridX = floor(x / gridResolution);
  let gridY = floor(y / gridResolution);
  let gridWidth = ceil(width / gridResolution);
  let gridHeight = ceil(height / gridResolution);

  if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
    drawnGrid[gridY * gridWidth + gridX] = 1;
  }
}

/**
 * Convert image to grayscale.
 */
function convertToGray(inputImg) {
  inputImg.loadPixels();
  for (let y = 0; y < inputImg.height; y++) {
    for (let x = 0; x < inputImg.width; x++) {
      let idx = (y * inputImg.width + x) * 4;
      let r = inputImg.pixels[idx + 0];
      let g = inputImg.pixels[idx + 1];
      let b = inputImg.pixels[idx + 2];
      let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      inputImg.pixels[idx + 0] = gray;
      inputImg.pixels[idx + 1] = gray;
      inputImg.pixels[idx + 2] = gray;
    }
  }
  inputImg.updatePixels();
}
