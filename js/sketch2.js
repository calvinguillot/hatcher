let img;
let scaleFactor;

// ========================================
// FLOW FIELD HATCHING PARAMETERS
// ========================================
let params = {
  contrast: 0.3,
  noiseScale: 0.01,
  minLineLength: 10,
  maxLineLength: 80,
  stepSize: 2,
};

// Grid to track where lines have been drawn (to prevent crossing)
let drawnGrid;
let gridResolution = 2; // Size of each grid cell in pixels

// dat.GUI instance
let gui;

function preload() {
  img = loadImage("old/oulu/WhatsApp Image 2025-12-06 at 18.54.16.jpeg");
}

function setup() {
  scaleFactor = 2;
  let canvas = createCanvas(img.width / scaleFactor, img.height / scaleFactor);
  canvas.parent("canvas-container");
  convertToGray(img);

  // Setup dat.GUI
  gui = new dat.GUI({ autoPlace: false });

  // Add GUI to canvas container for positioning
  let guiContainer = document.getElementById("canvas-container");
  guiContainer.appendChild(gui.domElement);

  // Add controls
  gui.add(params, "contrast", 0, 1, 0.01).name("Contrast").onChange(redraw);
  gui
    .add(params, "noiseScale", 0.001, 0.05, 0.001)
    .name("Noise Scale")
    .onChange(redraw);
  gui
    .add(params, "minLineLength", 5, 100, 1)
    .name("Min Length")
    .onChange(redraw);
  gui
    .add(params, "maxLineLength", 20, 200, 1)
    .name("Max Length")
    .onChange(redraw);
  gui.add(params, "stepSize", 1, 10, 0.5).name("Step Size").onChange(redraw);

  noLoop();
}

function draw() {
  background(255);

  // Initialize grid to track drawn areas
  let gridWidth = ceil(width / gridResolution);
  let gridHeight = ceil(height / gridResolution);
  drawnGrid = new Array(gridWidth * gridHeight).fill(false);

  // ========================================
  // CONTRAST ADJUSTMENT
  // Maps contrast (0-1) to a multiplier:
  //   contrast=0 → multiplier=2 (all black, max lines)
  //   contrast=0.5 → multiplier=1 (normal)
  //   contrast=1 → multiplier=0 (all white, no lines)
  // ========================================
  let contrastMultiplier = map(params.contrast, 0, 1, 2, 0);

  // Calculate threshold and density based on contrast
  let baseThreshold = 180;
  let baseDensity = 5000;

  let threshold = min(255, baseThreshold * contrastMultiplier);
  let density = baseDensity * contrastMultiplier;

  // Draw the flow field (single layer, no crossing)
  drawFlowField(threshold, density);

  // Uncomment to save
  // saveCanvas('flowHatch', 'png');
}

/**
 * Draw flow field lines in areas darker than threshold.
 * Lines will not cross each other.
 */
function drawFlowField(threshold, numLines) {
  stroke(0);
  strokeWeight(1);
  noFill();

  for (let i = 0; i < numLines; i++) {
    // Pick a random starting point
    let x = random(width);
    let y = random(height);

    // Check if starting point is already occupied
    if (isGridOccupied(x, y)) {
      continue;
    }

    // Check if starting point is dark enough
    let imgX = floor(x * scaleFactor);
    let imgY = floor(y * scaleFactor);
    let c = img.get(imgX, imgY);
    let bright = c[0];

    if (bright < threshold) {
      // Draw a flow line from this point
      drawFlowLine(x, y, threshold);
    }
  }
}

/**
 * Check if a grid cell is already occupied
 */
function isGridOccupied(x, y) {
  let gridX = floor(x / gridResolution);
  let gridY = floor(y / gridResolution);
  let gridWidth = ceil(width / gridResolution);

  if (
    gridX < 0 ||
    gridX >= gridWidth ||
    gridY < 0 ||
    gridY >= ceil(height / gridResolution)
  ) {
    return true; // Out of bounds = occupied
  }

  let idx = gridY * gridWidth + gridX;
  return drawnGrid[idx];
}

/**
 * Mark a grid cell as occupied
 */
function markGridOccupied(x, y) {
  let gridX = floor(x / gridResolution);
  let gridY = floor(y / gridResolution);
  let gridWidth = ceil(width / gridResolution);

  if (
    gridX >= 0 &&
    gridX < gridWidth &&
    gridY >= 0 &&
    gridY < ceil(height / gridResolution)
  ) {
    let idx = gridY * gridWidth + gridX;
    drawnGrid[idx] = true;
  }
}

/**
 * Draw a single line that follows the Perlin noise flow field.
 * The line stops if it exits a dark region, goes out of bounds, or hits another line.
 */
function drawFlowLine(startX, startY, threshold) {
  let x = startX;
  let y = startY;
  let len = 0;

  // Random line length between min and max
  let targetLen = random(params.minLineLength, params.maxLineLength);

  let points = [];
  points.push({ x: x, y: y });

  while (len < targetLen) {
    // Get flow angle from Perlin noise
    let angle =
      noise(x * params.noiseScale, y * params.noiseScale) * TWO_PI * 2;

    // Move in that direction
    let newX = x + cos(angle) * params.stepSize;
    let newY = y + sin(angle) * params.stepSize;

    // Check bounds
    if (newX < 0 || newX >= width || newY < 0 || newY >= height) {
      break;
    }

    // Check if would cross another line
    if (isGridOccupied(newX, newY)) {
      break;
    }

    // Check if still in dark region
    let imgX = floor(newX * scaleFactor);
    let imgY = floor(newY * scaleFactor);
    let c = img.get(imgX, imgY);
    let bright = c[0];

    if (bright >= threshold) {
      // Exited dark region, stop the line
      break;
    }

    x = newX;
    y = newY;
    len += params.stepSize;
    points.push({ x: x, y: y });
  }

  // Only draw if line is long enough
  if (len >= params.minLineLength) {
    beginShape();
    for (let p of points) {
      vertex(p.x, p.y);
      markGridOccupied(p.x, p.y);
    }
    endShape();
  }
}

/**
 * Convert image to grayscale (in-place).
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
