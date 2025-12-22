let img;
let scaleFactor;
let grayPixels;
let gui;

// Hatching styles
const HATCHING_STYLES = {
  "Hatch (Single)": "hatch",
  "Cross-Hatch (Double)": "cross",
  "Scribble": "scribble"
};

let params = {
  // Global Image Settings
  contrast: 1.0,
  brightness: 0,
  
  // Global Line Settings
  lineLength: 20,
  stepSize: 2,
  
  // Layers Control
  activeLayers: 3, // How many layers to show in GUI
  
  // Layer 1 (Darkest)
  l1_enabled: true,
  l1_val: 200,   // Threshold (0-255)
  l1_ang: 45,    // Angle
  l1_style: "cross",
  l1_den: 4000,  // Density
  
  // Layer 2
  l2_enabled: true,
  l2_val: 150,
  l2_ang: 135,
  l2_style: "cross",
  l2_den: 3500,
  
  // Layer 3
  l3_enabled: true,
  l3_val: 100,
  l3_ang: 90,
  l3_style: "hatch",
  l3_den: 3000,
  
  // Layer 4
  l4_enabled: false,
  l4_val: 60,
  l4_ang: 0,
  l4_style: "hatch",
  l4_den: 2000,
  
  // Layer 5
  l5_enabled: false,
  l5_val: 30,
  l5_ang: 30,
  l5_style: "scribble",
  l5_den: 1000,
};

function preload() {
  // Loading a default image from the old folder
  img = loadImage("old/couple-dancing-in-studio-bw-george-marks.jpg");
}

function setup() {
  // Responsive canvas sizing
  scaleFactor = 1;
  // Limit max dimension to keep performance reasonable
  let maxDim = 800;
  if (img.width > maxDim || img.height > maxDim) {
    let scaleW = maxDim / img.width;
    let scaleH = maxDim / img.height;
    scaleFactor = min(scaleW, scaleH);
  }
  
  let c = createCanvas(img.width * scaleFactor, img.height * scaleFactor);
  c.parent("canvas-container");
  
  // Process image
  cacheGrayPixels();
  
  // Initialize GUI
  setupGUI();
  
  noLoop();
}

function draw() {
  background(255);
  
  // Draw enabled layers
  for (let i = 1; i <= 5; i++) {
    if (!params[`l${i}_enabled`]) continue;
    
    // Get parameters for this layer
    let threshold = params[`l${i}_val`];
    let angle = params[`l${i}_ang`];
    let style = params[`l${i}_style`];
    let density = params[`l${i}_den`];
    
    drawLayer(threshold, angle, style, density);
  }
}

function drawLayer(threshold, angleDeg, style, density) {
  stroke(0);
  strokeWeight(1);
  noFill();
  
  let angle = radians(angleDeg);
  let count = 0;
  // Safety break
  let maxAttempts = density * 20;
  let attempts = 0;
  
  while (count < density && attempts < maxAttempts) {
    attempts++;
    
    // Random position
    let rx = random(width);
    let ry = random(height);
    
    // Check brightness
    let val = getProcessedBrightness(rx, ry);
    
    // If pixel is lighter than threshold, don't draw
    // (We want to draw in dark areas where val < threshold)
    // Wait, typical thresholding: 
    // val (0..255). 0 is black, 255 is white.
    // If we want to draw in DARK areas, we draw if val < threshold.
    // e.g. Threshold 50 => Draw only in very dark areas.
    // e.g. Threshold 200 => Draw in everything except highlights.
    
    if (val > threshold) continue;
    
    drawElement(rx, ry, angle, style, threshold);
    count++;
  }
}

function drawElement(x, y, angle, style, threshold) {
  switch (style) {
    case "hatch":
      drawLine(x, y, angle, threshold);
      break;
    case "cross":
      drawLine(x, y, angle, threshold);
      drawLine(x, y, angle + HALF_PI, threshold);
      break;
    case "scribble":
      drawScribble(x, y, threshold);
      break;
  }
}

function drawLine(startX, startY, angle, threshold) {
  let dx = cos(angle) * params.stepSize;
  let dy = sin(angle) * params.stepSize;
  
  let halfLen = params.lineLength / 2;
  
  // Draw forward
  let x = startX;
  let y = startY;
  
  let points = [];
  
  // Trace forward
  for (let i = 0; i < halfLen; i += params.stepSize) {
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    // Stop if we hit a light area
    if (getProcessedBrightness(x, y) > threshold + 10) break;
    
    points.push({x, y});
    x += dx;
    y += dy;
  }
  
  // Trace backward
  x = startX - dx;
  y = startY - dy;
  for (let i = 0; i < halfLen; i += params.stepSize) {
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    if (getProcessedBrightness(x, y) > threshold + 10) break;
    
    points.unshift({x, y}); // Add to start
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
  for (let i = 0; i < params.lineLength; i += 3) {
    if (px < 0 || px >= width || py < 0 || py >= height) break;
    if (getProcessedBrightness(px, py) > threshold) break;
    
    vertex(px, py);
    px += random(-3, 3);
    py += random(-3, 3);
  }
  endShape();
}

function getProcessedBrightness(x, y) {
  let imgX = floor(x / scaleFactor);
  let imgY = floor(y / scaleFactor);
  
  imgX = constrain(imgX, 0, img.width - 1);
  imgY = constrain(imgY, 0, img.height - 1);
  
  let idx = imgY * img.width + imgX;
  let raw = grayPixels[idx];
  
  // Apply contrast
  // Formula: factor * (value - 128) + 128 + brightness
  let val = params.contrast * (raw - 128) + 128 + params.brightness;
  return constrain(val, 0, 255);
}

function cacheGrayPixels() {
  img.loadPixels();
  grayPixels = new Uint8Array(img.width * img.height);
  for (let i = 0; i < img.width * img.height; i++) {
    let r = img.pixels[i*4];
    let g = img.pixels[i*4+1];
    let b = img.pixels[i*4+2];
    grayPixels[i] = 0.299*r + 0.587*g + 0.114*b;
  }
}

function setupGUI() {
  if (gui) gui.destroy();
  gui = new dat.GUI();
  
  let fGlobal = gui.addFolder("Image & Global Settings");
  fGlobal.add(params, "contrast", 0.1, 3.0, 0.1).name("Contrast").onChange(redraw);
  fGlobal.add(params, "brightness", -100, 100, 5).name("Brightness").onChange(redraw);
  fGlobal.add(params, "lineLength", 5, 100, 1).name("Line Length").onChange(redraw);
  fGlobal.add(params, "stepSize", 1, 10, 0.5).name("Step Quality").onChange(redraw);
  fGlobal.open();
  
  for (let i = 1; i <= 5; i++) {
    let f = gui.addFolder(`Layer ${i}`);
    f.add(params, `l${i}_enabled`).name("Enabled").onChange(redraw);
    f.add(params, `l${i}_val`, 0, 255).name("Threshold").onChange(redraw);
    f.add(params, `l${i}_ang`, 0, 180).name("Angle").onChange(redraw);
    f.add(params, `l${i}_style`, HATCHING_STYLES).name("Style").onChange(redraw);
    f.add(params, `l${i}_den`, 100, 10000, 100).name("Density").onChange(redraw);
    // Open the first 3 by default
    if (i <= 3) f.open();
  }
}

function keyPressed() {
  if (key === 's' || key === 'S') {
    saveCanvas('crosshatch_g3', 'png');
  }
}

