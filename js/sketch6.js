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
  "Cross-hatch": "cross",
  "Parallel": "parallel",
  "Diagonal": "diagonal",
  "Mixed": "mixed"
};

// ========================================
// CROSS HATCHING PARAMETERS
// ========================================
let params = {
  contrast: 0.6,
  numLayers: 3,

  // Layer configurations (up to 5 layers)
  layer1_enabled: true,
  layer1_threshold: 200,
  layer1_angle: 45,
  layer1_style: "cross",

  layer2_enabled: true,
  layer2_threshold: 140,
  layer2_angle: 0,
  layer2_style: "parallel",

  layer3_enabled: true,
  layer3_threshold: 80,
  layer3_angle: 90,
  layer3_style: "cross",

  layer4_enabled: false,
  layer4_threshold: 50,
  layer4_angle: 135,
  layer4_style: "diagonal",

  layer5_enabled: false,
  layer5_threshold: 30,
  layer5_angle: 22.5,
  layer5_style: "mixed",

  // Global settings
  lineLength: 25,
  stepSize: 2,
  lineSpacing: 4,
  density: 1500
};

function preload() {
  // Load one of the example images from the old folder
  img = loadImage("old/couple-dancing-in-studio-bw-george-marks.jpg");
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
  gui.add(params, "contrast", 0, 1, 0.01).name("Overall Contrast").onChange(redraw);
  gui.add(params, "numLayers", 1, 5, 1).name("Number of Layers").onChange(updateGUI);

  // Global settings
  let globalFolder = gui.addFolder("Global Settings");
  globalFolder.add(params, "lineLength", 10, 100, 5).name("Line Length").onChange(redraw);
  globalFolder.add(params, "stepSize", 1, 10, 0.5).name("Step Size").onChange(redraw);
  globalFolder.add(params, "lineSpacing", 2, 20, 1).name("Line Spacing").onChange(redraw);
  globalFolder.add(params, "density", 500, 5000, 100).name("Density").onChange(redraw);

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

    layerFolder.add(params, enabledKey).name("Enabled").onChange(redraw);
    layerFolder.add(params, thresholdKey, 0, 255, 5).name("Threshold").onChange(redraw);
    layerFolder.add(params, angleKey, 0, 180, 1).name("Angle (degrees)").onChange(redraw);
    layerFolder.add(params, styleKey, Object.keys(HATCHING_STYLES)).name("Style").onChange(redraw);

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

  // Contrast adjustment - higher contrast = more dramatic difference
  let contrastMult = map(params.contrast, 0, 1, 0.5, 2.0);

  // Draw each enabled layer
  for (let i = 1; i <= params.numLayers; i++) {
    let enabledKey = `layer${i}_enabled`;
    if (!params[enabledKey]) continue;

    let thresholdKey = `layer${i}_threshold`;
    let angleKey = `layer${i}_angle`;
    let styleKey = `layer${i}_style`;

    let threshold = min(255, params[thresholdKey] * contrastMult);
    let angle = params[angleKey];
    let styleName = params[styleKey];
    let style = HATCHING_STYLES[styleName] || "cross";

    drawHatchLayer(threshold, angle, style);
  }
}

/**
 * Draw a hatching layer at a specific angle with a specific style.
 */
function drawHatchLayer(threshold, angleDeg, style) {
  stroke(0);
  strokeWeight(1);
  noFill();

  let angle = radians(angleDeg);
  let cosA = cos(angle);
  let sinA = sin(angle);

  let numLines = floor(params.density / params.numLayers);

  switch (style) {
    case "cross":
      drawCrossHatching(numLines, threshold, angle);
      break;
    case "parallel":
      drawParallelHatching(numLines, threshold, angle);
      break;
    case "diagonal":
      drawDiagonalHatching(numLines, threshold);
      break;
    case "mixed":
      drawMixedHatching(numLines, threshold, angle);
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
function drawParallelHatching(numLines, threshold, angle) {
  drawHatchingLines(numLines, threshold, angle);
}

/**
 * Draw diagonal hatching (45° and 135°)
 */
function drawDiagonalHatching(numLines, threshold) {
  drawHatchingLines(numLines / 2, threshold, radians(45));
  drawHatchingLines(numLines / 2, threshold, radians(135));
}

/**
 * Draw mixed hatching (random angles around base angle)
 */
function drawMixedHatching(numLines, threshold, baseAngle) {
  for (let i = 0; i < numLines; i++) {
    let angleVariation = random(-30, 30);
    let angle = baseAngle + radians(angleVariation);
    drawHatchingLines(1, threshold, angle);
  }
}

/**
 * Core function to draw parallel lines
 */
function drawHatchingLines(numLines, threshold, angle) {
  let angleRad = radians(angle);
  let cosA = cos(angleRad);
  let sinA = sin(angleRad);

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
 * Fast brightness lookup using cached array.
 */
function getBrightnessFast(x, y) {
  let imgX = floor(x * scaleFactor);
  let imgY = floor(y * scaleFactor);

  if (imgX < 0) imgX = 0;
  if (imgX >= img.width) imgX = img.width - 1;
  if (imgY < 0) imgY = 0;
  if (imgY >= img.height) imgY = img.height - 1;

  return grayPixels[imgY * img.width + imgX];
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
