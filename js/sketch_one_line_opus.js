/**
 * One Line Plotter Art
 * 
 * Creates a single continuous zigzag line that represents an image.
 * The line goes left-to-right, then down, then right-to-left.
 * Vertical spacing varies based on brightness:
 * - Dark areas = lines closer together (denser)
 * - Bright areas = lines further apart (sparser)
 */

let img;
let scaleFactor;
let grayPixels;
let gui;
let pathPoints = [];

// Parameters with dat.gui controls
let params = {
  // Image adjustments
  contrast: 1.5,
  brightness: 0,
  invert: false,
  
  // Line spacing settings
  minSpacing: 2,        // Minimum row spacing (for darkest areas - lines close together)
  maxSpacing: 15,       // Maximum row spacing (for brightest areas - lines far apart)
  horizontalStep: 2,    // How many pixels to move horizontally each step
  lineWeight: 1.0,      // Stroke weight
  
  // Wave/oscillation settings
  maxAmplitude: 3,      // Max wave amplitude (for darkest areas)
  minAmplitude: 0,      // Min wave amplitude (for brightest areas)
  waveFrequency: 0.4,   // How fast the wave oscillates
  
  // Sampling
  sampleWidth: 20,      // Width of area to sample for row spacing decisions
  
  // Display
  showOriginal: false,
  originalOpacity: 30,
  
  // Actions
  regenerate: function() { generatePath(); redraw(); },
  saveSVG: function() { exportSVG(); },
  savePNG: function() { save('one_line_output.png'); }
};

function preload() {
  // Load default image
  img = loadImage("old/couple-dancing-in-studio-bw-george-marks.jpg");
}

function setup() {
  // Scale down if image is too large for screen
  scaleFactor = 1;
  let maxW = windowWidth * 0.85;
  let maxH = windowHeight * 0.85;
  
  if (img.width > maxW || img.height > maxH) {
    let scaleW = maxW / img.width;
    let scaleH = maxH / img.height;
    scaleFactor = min(scaleW, scaleH);
  }

  // Create canvas matching the (scaled) image size
  let canvas = createCanvas(img.width * scaleFactor, img.height * scaleFactor);
  canvas.parent("canvas-container");
  
  // Enable drag and drop
  canvas.drop(handleFile);

  // Pre-process image to grayscale
  cacheGrayPixels();

  setupGUI();
  generatePath();
  noLoop();
}

function setupGUI() {
  if (gui) gui.destroy();
  gui = new dat.GUI({ width: 300 });

  // Image adjustments folder
  let imgFolder = gui.addFolder("Image Adjustments");
  imgFolder.add(params, "contrast", 0.5, 3.0, 0.1).name("Contrast").onChange(regenerateAndDraw);
  imgFolder.add(params, "brightness", -100, 100, 5).name("Brightness").onChange(regenerateAndDraw);
  imgFolder.add(params, "invert").name("Invert").onChange(regenerateAndDraw);
  imgFolder.open();

  // Line spacing folder
  let spacingFolder = gui.addFolder("Line Spacing");
  spacingFolder.add(params, "minSpacing", 1, 10, 0.5).name("Min Spacing (dark)").onChange(regenerateAndDraw);
  spacingFolder.add(params, "maxSpacing", 5, 40, 1).name("Max Spacing (light)").onChange(regenerateAndDraw);
  spacingFolder.add(params, "horizontalStep", 1, 10, 0.5).name("Horizontal Step").onChange(regenerateAndDraw);
  spacingFolder.add(params, "sampleWidth", 5, 100, 5).name("Sample Width").onChange(regenerateAndDraw);
  spacingFolder.add(params, "lineWeight", 0.5, 5, 0.5).name("Line Weight").onChange(redraw);
  spacingFolder.open();

  // Wave settings folder
  let waveFolder = gui.addFolder("Wave Settings");
  waveFolder.add(params, "maxAmplitude", 0, 15, 0.5).name("Max Amplitude (dark)").onChange(regenerateAndDraw);
  waveFolder.add(params, "minAmplitude", 0, 10, 0.5).name("Min Amplitude (light)").onChange(regenerateAndDraw);
  waveFolder.add(params, "waveFrequency", 0.1, 1.0, 0.05).name("Wave Frequency").onChange(regenerateAndDraw);
  waveFolder.open();

  // Display folder
  let displayFolder = gui.addFolder("Display");
  displayFolder.add(params, "showOriginal").name("Show Original").onChange(redraw);
  displayFolder.add(params, "originalOpacity", 10, 100, 5).name("Original Opacity").onChange(redraw);

  // Actions folder
  let actionsFolder = gui.addFolder("Actions");
  actionsFolder.add(params, "regenerate").name("⟳ Regenerate");
  actionsFolder.add(params, "saveSVG").name("💾 Save SVG");
  actionsFolder.add(params, "savePNG").name("📷 Save PNG");
  actionsFolder.open();
}

function regenerateAndDraw() {
  generatePath();
  redraw();
}

function generatePath() {
  pathPoints = [];
  
  let baseY = params.minSpacing; // Start with some margin
  let goingRight = true;
  let wavePhase = 0; // Continuous wave phase across rows
  
  while (baseY < height - params.minSpacing) {
    // Sample average brightness along this row to determine spacing to next row
    let rowBrightnessSum = 0;
    let sampleCount = 0;
    
    // Create points for this horizontal pass with wave oscillation
    if (goingRight) {
      for (let x = 0; x <= width; x += params.horizontalStep) {
        // Get brightness at this position
        let brightness = getProcessedBrightness(x, baseY);
        rowBrightnessSum += brightness;
        sampleCount++;
        
        // Map brightness to wave amplitude
        // Dark (0) = maxAmplitude, Bright (255) = minAmplitude
        let amplitude = map(brightness, 0, 255, params.maxAmplitude, params.minAmplitude);
        
        // Calculate wave offset using sine
        let waveOffset = sin(wavePhase) * amplitude;
        
        // Add point with wave offset
        pathPoints.push({ 
          x: x, 
          y: constrain(baseY + waveOffset, 0, height - 1)
        });
        
        // Advance wave phase
        wavePhase += params.waveFrequency;
      }
    } else {
      for (let x = width; x >= 0; x -= params.horizontalStep) {
        // Get brightness at this position
        let brightness = getProcessedBrightness(x, baseY);
        rowBrightnessSum += brightness;
        sampleCount++;
        
        // Map brightness to wave amplitude
        let amplitude = map(brightness, 0, 255, params.maxAmplitude, params.minAmplitude);
        
        // Calculate wave offset using sine
        let waveOffset = sin(wavePhase) * amplitude;
        
        // Add point with wave offset
        pathPoints.push({ 
          x: x, 
          y: constrain(baseY + waveOffset, 0, height - 1)
        });
        
        // Advance wave phase
        wavePhase += params.waveFrequency;
      }
    }
    
    // Calculate average brightness for this row
    let avgBrightness = rowBrightnessSum / sampleCount;
    
    // Map brightness to row spacing
    // Dark (0) = minSpacing (lines close together)
    // Bright (255) = maxSpacing (lines far apart)
    let rowSpacing = map(avgBrightness, 0, 255, params.minSpacing, params.maxSpacing);
    
    // Move to next row based on calculated spacing
    baseY += rowSpacing;
    
    // Flip direction for zigzag
    goingRight = !goingRight;
  }
}

function draw() {
  background(255);
  
  // Optionally show the original image
  if (params.showOriginal) {
    push();
    tint(255, params.originalOpacity * 2.55);
    image(img, 0, 0, width, height);
    pop();
  }
  
  // Draw the single continuous line
  if (pathPoints.length > 1) {
    stroke(0);
    strokeWeight(params.lineWeight);
    noFill();
    
    beginShape();
    for (let pt of pathPoints) {
      vertex(pt.x, pt.y);
    }
    endShape();
  }
  
  // Show info
  fill(100);
  noStroke();
  textSize(10);
  textAlign(LEFT, TOP);
  // text(`Points: ${pathPoints.length}`, 10, 10);
}

// --- File Handling ---

function handleFile(file) {
  if (file.type === 'image') {
    loadImage(file.data, newImg => {
      img = newImg;
      
      // Recalculate scale
      let maxW = windowWidth * 0.85;
      let maxH = windowHeight * 0.85;
      
      if (img.width > maxW || img.height > maxH) {
        let scaleW = maxW / img.width;
        let scaleH = maxH / img.height;
        scaleFactor = min(scaleW, scaleH);
      } else {
        scaleFactor = 1;
      }
      
      // Resize canvas
      resizeCanvas(img.width * scaleFactor, img.height * scaleFactor);
      
      // Recache and regenerate
      cacheGrayPixels();
      generatePath();
      redraw();
    });
  }
}

// --- SVG Export ---

function exportSVG() {
  if (pathPoints.length < 2) return;
  
  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${width}mm" 
     height="${height}mm" 
     viewBox="0 0 ${width} ${height}">
  <path d="`;
  
  // Build path data
  let pathData = `M ${pathPoints[0].x.toFixed(2)} ${pathPoints[0].y.toFixed(2)}`;
  for (let i = 1; i < pathPoints.length; i++) {
    pathData += ` L ${pathPoints[i].x.toFixed(2)} ${pathPoints[i].y.toFixed(2)}`;
  }
  
  svgContent += pathData;
  svgContent += `" fill="none" stroke="black" stroke-width="${params.lineWeight}"/>
</svg>`;
  
  // Create download
  let blob = new Blob([svgContent], { type: 'image/svg+xml' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = 'one_line_output.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  let val = params.contrast * (rawVal - 128) + 128 + params.brightness;
  val = constrain(val, 0, 255);
  
  // Invert if needed
  if (params.invert) {
    val = 255 - val;
  }
  
  return val;
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

// --- Keyboard Shortcuts ---

function keyPressed() {
  if (key === 's' || key === 'S') {
    exportSVG();
  } else if (key === 'p' || key === 'P') {
    save('one_line_output.png');
  } else if (key === 'r' || key === 'R') {
    generatePath();
    redraw();
  }
}

// --- Window Resize ---

function windowResized() {
  let maxW = windowWidth * 0.85;
  let maxH = windowHeight * 0.85;
  
  if (img.width > maxW || img.height > maxH) {
    let scaleW = maxW / img.width;
    let scaleH = maxH / img.height;
    scaleFactor = min(scaleW, scaleH);
  } else {
    scaleFactor = 1;
  }
  
  resizeCanvas(img.width * scaleFactor, img.height * scaleFactor);
  generatePath();
  redraw();
}

