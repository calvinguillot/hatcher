let img;
let scaleFactor;
let grayPixels; // Cached grayscale values for fast access

// Grid to track where lines have been drawn
let drawnGrid;
let gridResolution = 2;

// dat.GUI instance
let gui;

// ========================================
// CROSS HATCHING PARAMETERS
// ========================================
let params = {
  contrast: 0.5,
  density: 3000,
  lineLength: 30,
  stepSize: 2,
  // Layer thresholds (brightness below this gets the layer)
  layer1_threshold: 220, // Light shadows - vertical (90°)
  layer2_threshold: 150, // Mid tones - adds horizontal (0°)
  layer3_threshold: 80, // Dark areas - adds diagonal (45°)
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

  // Controls
  gui.add(params, "contrast", 0, 1, 0.01).name("Contrast").onChange(redraw);
  gui.add(params, "density", 500, 10000, 100).name("Density").onChange(redraw);
  gui
    .add(params, "lineLength", 10, 100, 5)
    .name("Line Length")
    .onChange(redraw);
  gui.add(params, "stepSize", 1, 5, 0.5).name("Step Size").onChange(redraw);

  gui
    .add(params, "layer1_threshold", 100, 255, 5)
    .name("Layer 1 (90°)")
    .onChange(redraw);
  gui
    .add(params, "layer2_threshold", 50, 200, 5)
    .name("Layer 2 (0°)")
    .onChange(redraw);
  gui
    .add(params, "layer3_threshold", 0, 150, 5)
    .name("Layer 3 (45°)")
    .onChange(redraw);

  noLoop();
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
  let contrastMult = map(params.contrast, 0, 1, 2, 0);

  let t1 = min(255, params.layer1_threshold * contrastMult);
  let t2 = min(255, params.layer2_threshold * contrastMult);
  let t3 = min(255, params.layer3_threshold * contrastMult);

  // Layer 1: Vertical lines (90°) for light shadows
  drawHatchLayer(t1, 90);

  // Layer 2: Horizontal lines (0°) for mid tones
  drawHatchLayer(t2, 0);

  // Layer 3: Diagonal lines (45°) for dark areas
  drawHatchLayer(t3, 45);
}

/**
 * Draw a hatching layer at a specific angle.
 */
function drawHatchLayer(threshold, angleDeg) {
  stroke(0);
  strokeWeight(1);
  noFill();

  let angle = radians(angleDeg);
  let cosA = cos(angle);
  let sinA = sin(angle);

  let density = floor(params.density);

  for (let i = 0; i < density; i++) {
    // Random starting point
    let x = random(width);
    let y = random(height);

    // Check if starting point is dark enough
    let bright = getBrightnessFast(x, y);
    if (bright >= threshold) continue;

    // Check if already occupied
    if (isGridOccupied(x, y)) continue;

    // Draw line in both directions from this point
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
    points.push(x, y);
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
    backPoints.push(x, y);
  }

  // Need at least a few points
  let totalPoints = (points.length + backPoints.length) / 2 + 1;
  if (totalPoints < 3) return;

  // Draw the line
  beginShape();

  // Backward points (reversed)
  for (let i = backPoints.length - 2; i >= 0; i -= 2) {
    let px = backPoints[i];
    let py = backPoints[i + 1];
    vertex(px, py);
    markGridOccupied(px, py);
  }

  // Center point
  vertex(startX, startY);
  markGridOccupied(startX, startY);

  // Forward points
  for (let i = 0; i < points.length; i += 2) {
    let px = points[i];
    let py = points[i + 1];
    vertex(px, py);
    markGridOccupied(px, py);
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
