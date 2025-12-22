/**
 * SKETCH OPUS - Cross-Hatching Image Processor
 * 
 * A comprehensive cross-hatching sketch with dat.GUI controls for:
 * - Overall contrast and brightness
 * - Up to 5 layers with individual angle, style, and threshold controls
 * - Multiple hatching styles (parallel, cross, contour, scribble, stipple)
 */

let img;
let scaleFactor;
let grayPixels;
let gui;

// Hatching style definitions
const HATCHING_STYLES = {
  "Parallel Lines": "parallel",
  "Cross-Hatch": "cross",
  "Contour": "contour",
  "Scribble": "scribble",
  "Stipple": "stipple",
};

// Main parameters
let params = {
  // === Image Adjustments ===
  contrast: 1.2,
  brightness: 0,
  invert: false,

  // === Global Hatching Settings ===
  numLayers: 3,
  lineWeight: 1.0,
  baseSpacing: 4,
  lineLength: 40,
  stepSize: 1.5,
  jitterAngle: 3,
  jitterSpacing: 1,

  // === Layer 1 (Lightest shadows) ===
  layer1_enabled: true,
  layer1_threshold: 200,
  layer1_angle: 45,
  layer1_style: "parallel",
  layer1_spacingMult: 2.0,

  // === Layer 2 (Mid-light tones) ===
  layer2_enabled: true,
  layer2_threshold: 160,
  layer2_angle: 135,
  layer2_style: "parallel",
  layer2_spacingMult: 1.8,

  // === Layer 3 (Mid tones) ===
  layer3_enabled: true,
  layer3_threshold: 120,
  layer3_angle: 90,
  layer3_style: "parallel",
  layer3_spacingMult: 1.5,

  // === Layer 4 (Mid-dark tones) ===
  layer4_enabled: false,
  layer4_threshold: 80,
  layer4_angle: 0,
  layer4_style: "parallel",
  layer4_spacingMult: 1.2,

  // === Layer 5 (Darkest shadows) ===
  layer5_enabled: false,
  layer5_threshold: 50,
  layer5_angle: 60,
  layer5_style: "cross",
  layer5_spacingMult: 1.0,

  // === Actions ===
  redrawCanvas: function () {
    redraw();
  },
  saveImage: function () {
    saveCanvas("crosshatch_output", "png");
  },
  saveSVG: function () {
    // Note: SVG export requires p5.svg library
    console.log("SVG export - implement with p5.svg if needed");
  },
};

// ========================================
// PRELOAD
// ========================================
function preload() {
  // Change this path to load different images
  img = loadImage("old/couple-dancing-in-studio-bw-george-marks.jpg");
}

// ========================================
// SETUP
// ========================================
function setup() {
  // Calculate scale factor to fit screen
  scaleFactor = 1;
  let maxW = windowWidth * 0.85;
  let maxH = windowHeight * 0.9;

  if (img.width > maxW || img.height > maxH) {
    let scaleW = maxW / img.width;
    let scaleH = maxH / img.height;
    scaleFactor = min(scaleW, scaleH);
  }

  // Create canvas
  let canvas = createCanvas(
    floor(img.width * scaleFactor),
    floor(img.height * scaleFactor)
  );
  canvas.parent("canvas-container");

  // Convert image to grayscale and cache pixel values
  convertToGray(img);
  cacheGrayPixels();

  // Build the GUI
  buildGUI();

  noLoop();
  redraw();
}

// ========================================
// DAT.GUI SETUP
// ========================================
function buildGUI() {
  if (gui) {
    gui.destroy();
  }

  gui = new dat.GUI({ width: 300 });

  // --- Image Adjustments ---
  let imgFolder = gui.addFolder("🎨 Image Adjustments");
  imgFolder
    .add(params, "contrast", 0.2, 3.0, 0.05)
    .name("Contrast")
    .onChange(redraw);
  imgFolder
    .add(params, "brightness", -100, 100, 1)
    .name("Brightness")
    .onChange(redraw);
  imgFolder.add(params, "invert").name("Invert Image").onChange(redraw);
  imgFolder.open();

  // --- Global Hatching Settings ---
  let globalFolder = gui.addFolder("⚙️ Global Hatching");
  globalFolder
    .add(params, "numLayers", 1, 5, 1)
    .name("Layers (1-5)")
    .onChange(() => {
      rebuildLayerFolders();
      redraw();
    });
  globalFolder
    .add(params, "lineWeight", 0.3, 3.0, 0.1)
    .name("Line Weight")
    .onChange(redraw);
  globalFolder
    .add(params, "baseSpacing", 2, 20, 0.5)
    .name("Base Spacing")
    .onChange(redraw);
  globalFolder
    .add(params, "lineLength", 10, 150, 5)
    .name("Line Length")
    .onChange(redraw);
  globalFolder
    .add(params, "stepSize", 0.5, 5, 0.25)
    .name("Step Size")
    .onChange(redraw);
  globalFolder
    .add(params, "jitterAngle", 0, 15, 0.5)
    .name("Angle Jitter")
    .onChange(redraw);
  globalFolder
    .add(params, "jitterSpacing", 0, 5, 0.25)
    .name("Spacing Jitter")
    .onChange(redraw);
  globalFolder.open();

  // --- Layer Controls ---
  rebuildLayerFolders();

  // --- Actions ---
  let actionsFolder = gui.addFolder("💾 Actions");
  actionsFolder.add(params, "redrawCanvas").name("↻ Redraw");
  actionsFolder.add(params, "saveImage").name("📥 Save PNG");
}

let layerFolders = [];

function rebuildLayerFolders() {
  // Remove existing layer folders
  for (let folder of layerFolders) {
    try {
      gui.removeFolder(folder);
    } catch (e) {
      // Folder might already be removed
    }
  }
  layerFolders = [];

  // Create folders for active layers
  for (let i = 1; i <= params.numLayers; i++) {
    let layerName = getLayerName(i);
    let folder = gui.addFolder(`📐 Layer ${i} (${layerName})`);

    folder
      .add(params, `layer${i}_enabled`)
      .name("Enabled")
      .onChange(redraw);

    folder
      .add(params, `layer${i}_threshold`, 0, 255, 1)
      .name("Threshold")
      .onChange(redraw);

    folder
      .add(params, `layer${i}_angle`, -180, 180, 1)
      .name("Angle (°)")
      .onChange(redraw);

    folder
      .add(params, `layer${i}_style`, HATCHING_STYLES)
      .name("Style")
      .onChange(redraw);

    folder
      .add(params, `layer${i}_spacingMult`, 0.3, 4.0, 0.1)
      .name("Spacing ×")
      .onChange(redraw);

    folder.open();
    layerFolders.push(folder);
  }
}

function getLayerName(layerNum) {
  const names = ["Highlights", "Light", "Mid", "Dark", "Darkest"];
  return names[layerNum - 1] || "Layer";
}

// ========================================
// DRAW
// ========================================
function draw() {
  background(255);
  strokeWeight(params.lineWeight);
  stroke(0);
  noFill();

  // Draw each enabled layer
  for (let i = 1; i <= params.numLayers; i++) {
    if (!params[`layer${i}_enabled`]) continue;

    let threshold = params[`layer${i}_threshold`];
    let angle = params[`layer${i}_angle`];
    let style = params[`layer${i}_style`];
    let spacingMult = params[`layer${i}_spacingMult`];

    drawHatchingLayer(threshold, angle, style, spacingMult);
  }
}

// ========================================
// HATCHING LAYER DRAWING
// ========================================
function drawHatchingLayer(threshold, baseAngle, style, spacingMult) {
  let spacing = params.baseSpacing * spacingMult;

  switch (style) {
    case "parallel":
      drawParallelLines(threshold, baseAngle, spacing);
      break;
    case "cross":
      drawParallelLines(threshold, baseAngle, spacing);
      drawParallelLines(threshold, baseAngle + 90, spacing);
      break;
    case "contour":
      drawContourLines(threshold, baseAngle, spacing);
      break;
    case "scribble":
      drawScribbleLines(threshold, baseAngle, spacing);
      break;
    case "stipple":
      drawStipple(threshold, spacing);
      break;
    default:
      drawParallelLines(threshold, baseAngle, spacing);
  }
}

// ========================================
// PARALLEL LINES (Edge-spawned)
// ========================================
function drawParallelLines(threshold, baseAngle, baseSpacing) {
  let step = params.stepSize;
  let jAngle = params.jitterAngle;
  let jSpace = params.jitterSpacing;

  // Spawn lines from LEFT edge
  let y = 0;
  while (y < height) {
    let angle = baseAngle + random(-jAngle, jAngle);
    traceLine(0, y, angle, step, threshold);
    y += baseSpacing + random(-jSpace, jSpace);
    y = max(y, 1);
  }

  // Spawn lines from TOP edge
  let x = 0;
  while (x < width) {
    let angle = baseAngle + random(-jAngle, jAngle);
    traceLine(x, 0, angle, step, threshold);
    x += baseSpacing + random(-jSpace, jSpace);
    x = max(x, 1);
  }

  // Spawn lines from RIGHT edge (for angles pointing left)
  y = 0;
  while (y < height) {
    let angle = baseAngle + random(-jAngle, jAngle);
    traceLine(width - 1, y, angle, step, threshold);
    y += baseSpacing + random(-jSpace, jSpace);
    y = max(y, 1);
  }

  // Spawn lines from BOTTOM edge
  x = 0;
  while (x < width) {
    let angle = baseAngle + random(-jAngle, jAngle);
    traceLine(x, height - 1, angle, step, threshold);
    x += baseSpacing + random(-jSpace, jSpace);
    x = max(x, 1);
  }
}

// ========================================
// CONTOUR LINES (Curved hatching)
// ========================================
function drawContourLines(threshold, baseAngle, baseSpacing) {
  let step = params.stepSize;
  let jSpace = params.jitterSpacing;

  // Spawn from left edge with curve following
  let y = 0;
  while (y < height) {
    traceContourLine(0, y, baseAngle, step, threshold);
    y += baseSpacing + random(-jSpace, jSpace);
    y = max(y, 1);
  }

  // Spawn from top edge
  let x = 0;
  while (x < width) {
    traceContourLine(x, 0, baseAngle, step, threshold);
    x += baseSpacing + random(-jSpace, jSpace);
    x = max(x, 1);
  }
}

function traceContourLine(startX, startY, baseAngle, stepSize, threshold) {
  let angleRad = radians(baseAngle);
  let cosA = cos(angleRad);
  let sinA = sin(angleRad);

  let t = 0;
  let lineStart = null;
  let maxLen = params.lineLength * 5;
  let points = [];

  while (t < maxLen) {
    let x = startX + t * cosA;
    let y = startY + t * sinA;

    if (x < 0 || x >= width || y < 0 || y >= height) {
      break;
    }

    let bright = getAdjustedBrightness(x, y);

    // Slight curve based on local brightness gradient
    let gradX = getAdjustedBrightness(x + 2, y) - getAdjustedBrightness(x - 2, y);
    let gradY = getAdjustedBrightness(x, y + 2) - getAdjustedBrightness(x, y - 2);
    let curveFactor = 0.002;
    angleRad += (gradY * cosA - gradX * sinA) * curveFactor;
    cosA = cos(angleRad);
    sinA = sin(angleRad);

    if (bright < threshold) {
      if (lineStart === null) {
        lineStart = { x, y };
        points = [{ x, y }];
      } else {
        points.push({ x, y });
      }
    } else if (lineStart !== null) {
      // End the line segment
      if (points.length >= 2) {
        beginShape();
        for (let p of points) {
          vertex(p.x, p.y);
        }
        endShape();
      }
      lineStart = null;
      points = [];
    }

    t += stepSize;
  }

  // Finish any remaining segment
  if (points.length >= 2) {
    beginShape();
    for (let p of points) {
      vertex(p.x, p.y);
    }
    endShape();
  }
}

// ========================================
// SCRIBBLE LINES
// ========================================
function drawScribbleLines(threshold, baseAngle, baseSpacing) {
  let numScribbles = floor((width * height) / (baseSpacing * baseSpacing * 50));

  for (let i = 0; i < numScribbles; i++) {
    let x = random(width);
    let y = random(height);

    if (getAdjustedBrightness(x, y) < threshold) {
      drawSingleScribble(x, y, baseAngle, threshold);
    }
  }
}

function drawSingleScribble(startX, startY, baseAngle, threshold) {
  let points = [];
  let x = startX;
  let y = startY;
  let angle = radians(baseAngle);
  let maxLen = params.lineLength;

  for (let i = 0; i < maxLen; i++) {
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    if (getAdjustedBrightness(x, y) >= threshold) break;

    points.push({ x, y });

    // Wobbly movement
    angle += random(-0.4, 0.4);
    x += cos(angle) * params.stepSize;
    y += sin(angle) * params.stepSize;
  }

  if (points.length >= 2) {
    beginShape();
    for (let p of points) {
      vertex(p.x, p.y);
    }
    endShape();
  }
}

// ========================================
// STIPPLE (Dots)
// ========================================
function drawStipple(threshold, baseSpacing) {
  let dotSpacing = baseSpacing * 2;
  let numDots = floor((width * height) / (dotSpacing * dotSpacing));

  for (let i = 0; i < numDots; i++) {
    let x = random(width);
    let y = random(height);

    let bright = getAdjustedBrightness(x, y);

    if (bright < threshold) {
      // Darker areas get larger/denser dots
      let darkness = 1 - bright / 255;
      let dotSize = map(darkness, 0, 1, 0.5, params.lineWeight * 2);
      
      fill(0);
      noStroke();
      ellipse(x, y, dotSize, dotSize);
      stroke(0);
      noFill();
    }
  }
}

// ========================================
// LINE TRACING
// ========================================
function traceLine(startX, startY, angleDeg, stepSize, threshold) {
  let angleRad = radians(angleDeg);
  let cosA = cos(angleRad);
  let sinA = sin(angleRad);

  let t = 0;
  let lineStart = null;
  let maxLen = max(width, height) * 2; // Ensure we can cross the canvas

  while (t < maxLen) {
    let x = startX + t * cosA;
    let y = startY + t * sinA;

    // Check bounds
    if (x < -10 || x >= width + 10 || y < -10 || y >= height + 10) {
      // Finalize line if active
      if (lineStart !== null) {
        let endX = constrain(x, 0, width - 1);
        let endY = constrain(y, 0, height - 1);
        line(lineStart.x, lineStart.y, endX, endY);
      }
      break;
    }

    // Clamp for brightness check
    let checkX = constrain(x, 0, width - 1);
    let checkY = constrain(y, 0, height - 1);
    let bright = getAdjustedBrightness(checkX, checkY);

    if (bright < threshold) {
      // Dark enough - continue/start line
      if (lineStart === null) {
        lineStart = { x: checkX, y: checkY };
      }
    } else {
      // Too bright - end line if active
      if (lineStart !== null) {
        line(lineStart.x, lineStart.y, checkX, checkY);
        lineStart = null;
      }
    }

    t += stepSize;
  }
}

// ========================================
// IMAGE PROCESSING HELPERS
// ========================================
function convertToGray(inputImg) {
  inputImg.loadPixels();
  for (let i = 0; i < inputImg.width * inputImg.height; i++) {
    let idx = i * 4;
    let r = inputImg.pixels[idx];
    let g = inputImg.pixels[idx + 1];
    let b = inputImg.pixels[idx + 2];
    // Luminance formula
    let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    inputImg.pixels[idx] = gray;
    inputImg.pixels[idx + 1] = gray;
    inputImg.pixels[idx + 2] = gray;
  }
  inputImg.updatePixels();
}

function cacheGrayPixels() {
  let w = img.width;
  let h = img.height;
  grayPixels = new Uint8Array(w * h);

  img.loadPixels();
  for (let i = 0; i < w * h; i++) {
    grayPixels[i] = img.pixels[i * 4];
  }
}

function getAdjustedBrightness(canvasX, canvasY) {
  // Map canvas coordinates to image coordinates
  let imgX = floor(canvasX / scaleFactor);
  let imgY = floor(canvasY / scaleFactor);

  // Clamp to image bounds
  imgX = constrain(imgX, 0, img.width - 1);
  imgY = constrain(imgY, 0, img.height - 1);

  // Get raw brightness
  let raw = grayPixels[imgY * img.width + imgX];

  // Apply inversion if enabled
  if (params.invert) {
    raw = 255 - raw;
  }

  // Apply contrast: factor * (value - 128) + 128
  let adjusted = params.contrast * (raw - 128) + 128;

  // Apply brightness offset
  adjusted += params.brightness;

  return constrain(adjusted, 0, 255);
}

// ========================================
// WINDOW RESIZE
// ========================================
function windowResized() {
  // Recalculate scale factor
  let maxW = windowWidth * 0.85;
  let maxH = windowHeight * 0.9;

  if (img.width > maxW || img.height > maxH) {
    let scaleW = maxW / img.width;
    let scaleH = maxH / img.height;
    scaleFactor = min(scaleW, scaleH);
  } else {
    scaleFactor = 1;
  }

  resizeCanvas(floor(img.width * scaleFactor), floor(img.height * scaleFactor));
  redraw();
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
function keyPressed() {
  if (key === "s" || key === "S") {
    saveCanvas("crosshatch_output", "png");
  }
  if (key === "r" || key === "R") {
    redraw();
  }
}

