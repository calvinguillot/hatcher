let img;
let scaleFactor;
let grayPixels; // Cached grayscale values for fast access

// Grid to track where lines have been drawn (to prevent crossing)
let drawnGrid;
let gridResolution = 2;

// dat.GUI instance
let gui;

// ========================================
// CROSS HATCHING PARAMETERS
// ========================================
let params = {
  contrast: 0.5,        // Overall image contrast (0-1)
  numLayers: 3,          // Number of hatching layers (1-5)
  baseSpacing: 4,        // Base spacing between lines
  stepSize: 1,           // Step size for line tracing
  spacingRandom: 1,      // Random spacing variation
  angleRandom: 2,        // Random angle variation (±degrees)

  // Layer angles (in degrees)
  layer1_angle: 45,
  layer2_angle: 135,
  layer3_angle: 90,
  layer4_angle: 0,
  layer5_angle: 30,

  // Layer thresholds (brightness values where layers start appearing)
  layer1_threshold: 200,  // Lightest shadows
  layer2_threshold: 170,  // Light-mid tones
  layer3_threshold: 140,  // Mid tones
  layer4_threshold: 110,  // Mid-dark tones
  layer5_threshold: 80,   // Dark tones
};

function preload() {
  // Load an interesting image from the old folder
  img = loadImage("old/couple-dancing-in-studio-bw-george-marks.jpg");
}

function setup() {
  scaleFactor = 4; // Scale down for performance
  let canvas = createCanvas(img.width / scaleFactor, img.height / scaleFactor);
  canvas.parent("canvas-container");

  // Convert to grayscale and cache values for fast access
  convertToGray(img);
  cacheGrayPixels();

  // Setup dat.GUI
  gui = new dat.GUI({ autoPlace: false });
  let guiContainer = document.getElementById("canvas-container");
  guiContainer.appendChild(gui.domElement);

  // Main controls
  gui.add(params, "contrast", 0, 1, 0.01).name("Contrast").onChange(redraw);
  gui.add(params, "numLayers", 1, 5, 1).name("Layers").onChange(redraw);
  gui.add(params, "baseSpacing", 1, 10, 0.5).name("Spacing").onChange(redraw);
  gui.add(params, "stepSize", 0.5, 3, 0.1).name("Step Size").onChange(redraw);
  gui.add(params, "spacingRandom", 0, 5, 0.1).name("Spacing Var").onChange(redraw);
  gui.add(params, "angleRandom", 0, 10, 0.5).name("Angle Var").onChange(redraw);

  // Layer angle controls
  let layerFolder = gui.addFolder('Layer Angles');
  layerFolder.add(params, "layer1_angle", 0, 180, 1).name("Layer 1 (°)").onChange(redraw);
  layerFolder.add(params, "layer2_angle", 0, 180, 1).name("Layer 2 (°)").onChange(redraw);
  layerFolder.add(params, "layer3_angle", 0, 180, 1).name("Layer 3 (°)").onChange(redraw);
  layerFolder.add(params, "layer4_angle", 0, 180, 1).name("Layer 4 (°)").onChange(redraw);
  layerFolder.add(params, "layer5_angle", 0, 180, 1).name("Layer 5 (°)").onChange(redraw);

  // Layer threshold controls
  let thresholdFolder = gui.addFolder('Layer Thresholds');
  thresholdFolder.add(params, "layer1_threshold", 0, 255, 5).name("Layer 1").onChange(redraw);
  thresholdFolder.add(params, "layer2_threshold", 0, 255, 5).name("Layer 2").onChange(redraw);
  thresholdFolder.add(params, "layer3_threshold", 0, 255, 5).name("Layer 3").onChange(redraw);
  thresholdFolder.add(params, "layer4_threshold", 0, 255, 5).name("Layer 4").onChange(redraw);
  thresholdFolder.add(params, "layer5_threshold", 0, 255, 5).name("Layer 5").onChange(redraw);

  layerFolder.open();
  thresholdFolder.open();

  noLoop();
}

/**
 * Cache grayscale pixel values for fast access during drawing.
 */
function cacheGrayPixels() {
  let w = img.width;
  let h = img.height;
  grayPixels = new Uint8Array(w * h);

  img.loadPixels();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = (y * w + x) * 4;
      let originalGray = img.pixels[idx];

      // Apply contrast adjustment
      let adjustedGray = applyContrast(originalGray, params.contrast);

      grayPixels[y * w + x] = adjustedGray;
    }
  }
}

/**
 * Apply contrast adjustment to a grayscale value.
 * contrast: 0 = all gray (no contrast), 1 = full contrast
 */
function applyContrast(grayValue, contrast) {
  // Map contrast 0-1 to a multiplier
  // contrast=0 → multiplier approaches 0 (all values become middle gray)
  // contrast=1 → multiplier=1 (original values)
  let multiplier = contrast;

  // Center around middle gray (127.5)
  let center = 127.5;
  let adjusted = center + (grayValue - center) * multiplier;

  // Clamp to 0-255 range
  return constrain(adjusted, 0, 255);
}

function draw() {
  background(255);

  // Recache pixels if contrast changed
  cacheGrayPixels();

  // Initialize grid to track drawn areas
  let gridWidth = ceil(width / gridResolution);
  let gridHeight = ceil(height / gridResolution);
  drawnGrid = new Uint8Array(gridWidth * gridHeight);

  // Draw each layer
  for (let layer = 1; layer <= params.numLayers; layer++) {
    drawHatchLayer(layer);
  }

  // Uncomment to save output
  // saveCanvas('crossHatch_grok', 'png');
}

/**
 * Draw a single hatching layer.
 */
function drawHatchLayer(layerNum) {
  stroke(0);
  strokeWeight(1);

  // Get layer parameters
  let angle = params[`layer${layerNum}_angle`];
  let threshold = params[`layer${layerNum}_threshold`];
  let spacing = params.baseSpacing;

  // Adjust spacing based on layer (darker layers get denser)
  if (layerNum > 1) {
    spacing = spacing * (0.8 ** (layerNum - 1)); // Each layer 20% denser
  }

  // Draw threshold lines for this layer
  drawThresholdLines(angle, spacing, params.stepSize, threshold,
                    params.spacingRandom, params.angleRandom);
}

/**
 * Draw diagonal lines at an approximate baseAngle (in degrees),
 * but each line can have a random ± angleRandom shift.
 * Similar to the original sketch.js implementation but optimized.
 */
function drawThresholdLines(baseAngle, baseLineSpacing, stepSize, threshold,
                           lineSpacingRandom, angleRandom) {
  // We'll spawn lines from the LEFT edge and the TOP edge.
  // Because each line has a random spacing from the previous,
  // we use a while loop, incrementing by a random amount each time.

  // 1) Lines starting from the LEFT edge, for y in [0..height]
  let currentY = 0;
  while (currentY < height) {
    // Pick a random angle for this line
    let actualAngle = baseAngle + random(-angleRandom, angleRandom);

    // Draw a line starting at (0, currentY), going at actualAngle
    traceLine(0, currentY, actualAngle, stepSize, threshold);

    // Randomize the spacing for the NEXT line
    let spacing = baseLineSpacing + random(-lineSpacingRandom, lineSpacingRandom);
    spacing = max(spacing, 1); // ensure it doesn't go below 1
    currentY += spacing;
  }

  // 2) Lines starting from the TOP edge, for x in [0..width]
  let currentX = 0;
  while (currentX < width) {
    // Pick a random angle for this line
    let actualAngle = baseAngle + random(-angleRandom, angleRandom);

    // Draw line from (currentX, 0)
    traceLine(currentX, 0, actualAngle, stepSize, threshold);

    // Randomize the spacing for the NEXT line
    let spacing = baseLineSpacing + random(-lineSpacingRandom, lineSpacingRandom);
    spacing = max(spacing, 1);
    currentX += spacing;
  }
}

/**
 * Trace a single diagonal line that begins at (startX, startY)
 * and extends inside the canvas, drawing segments where brightness < threshold.
 */
function traceLine(startX, startY, angleDeg, stepSize, threshold) {
  let angle = radians(angleDeg);
  let cosA = cos(angle);
  let sinA = sin(angle);

  let t = 0;
  let lineStart = null; // store { x, y } if we are currently in a dark region

  while (true) {
    // Parametric form:
    // x = startX + t*cosA
    // y = startY + t*sinA
    let x = startX + t * cosA;
    let y = startY + t * sinA;

    // If we go out of bounds, finalize any active line and break
    if (x < 0 || x >= width || y < 0 || y >= height) {
      if (lineStart !== null) {
        line(lineStart.x, lineStart.y, x, y);
      }
      break;
    }

    // Check if grid cell is already occupied
    if (isGridOccupied(x, y)) {
      if (lineStart !== null) {
        line(lineStart.x, lineStart.y, x, y);
      }
      break;
    }

    // Get brightness from cached array
    let bright = getBrightnessFast(x, y);

    // If dark enough => continue line
    if (bright < threshold) {
      if (lineStart === null) {
        lineStart = { x, y };
      }
      markGridOccupied(x, y);
    } else {
      // Not dark => if a line is active, finalize it
      if (lineStart !== null) {
        line(lineStart.x, lineStart.y, x, y);
        lineStart = null;
      }
    }

    t += stepSize;
  }
}

/**
 * Fast brightness lookup using cached array.
 */
function getBrightnessFast(x, y) {
  let imgX = floor(x * scaleFactor);
  let imgY = floor(y * scaleFactor);

  // Clamp to image bounds
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
    return true; // Out of bounds = occupied
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
