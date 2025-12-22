let img;
let scaleFactor; // ratio of image size to canvas size

/**
 * Example usage in `draw()`:
 *   drawThresholdLines(45, 5, 1, 50, 2, 5);
 *
 * Meaning:
 *   - baseAngle = 45°,
 *   - baseLineSpacing = 5,
 *   - stepSize = 1,
 *   - threshold = 50,
 *   - lineSpacingRandom = 2   (spacing can vary ±2),
 *   - angleRandom = 5         (angle can vary ±5°).
 */

function preload() {
  img = loadImage(
    "old/oulu/museovirasto.45a47a74-0268-441d-8e4c-3157b75f63eb-0-master Ainola's bridge and Oulu Cathedral in Finland in 1960..jpg"
  );
}

function setup() {
  scaleFactor = 4; // change this to scale the output
  createCanvas(img.width / scaleFactor, img.height / scaleFactor);
  convertToGray(img);
  noLoop();
}

function draw() {
  background(255);

  // ========================================
  // HATCHING PARAMETERS - adjust these!
  // ========================================

  // Base spacing between lines (smaller = denser)
  let baseSpacing = 4;

  // Step size for line tracing (1 = smooth, higher = faster but choppier)
  let stepSize = 1;

  // Randomization amounts
  let spacingRandom = 1;
  let angleRandom = 2;

  // ========================================
  // LAYER 1: Lightest shadows (first direction)
  // Appears in areas with brightness < 200
  // ========================================
  let layer1_angle = 45;
  let layer1_threshold = 200;
  let layer1_spacing = baseSpacing * 2;
  drawThresholdLines(
    layer1_angle,
    layer1_spacing,
    stepSize,
    layer1_threshold,
    spacingRandom,
    angleRandom
  );

  // ========================================
  // LAYER 2: Light-mid tones (cross direction)
  // Adds second direction for areas < 170
  // ========================================
  let layer2_angle = 135;
  let layer2_threshold = 170;
  let layer2_spacing = baseSpacing * 2;
  drawThresholdLines(
    layer2_angle,
    layer2_spacing,
    stepSize,
    layer2_threshold,
    spacingRandom,
    angleRandom
  );

  // ========================================
  // LAYER 3: Mid tones (denser first direction)
  // Fills in more for areas < 140
  // ========================================
  let layer3_angle = 50; // slightly offset from layer 1
  let layer3_threshold = 140;
  let layer3_spacing = baseSpacing * 1.5;
  drawThresholdLines(
    layer3_angle,
    layer3_spacing,
    stepSize,
    layer3_threshold,
    spacingRandom,
    angleRandom
  );

  // ========================================
  // LAYER 4: Mid-dark tones (vertical)
  // Adds third direction for areas < 110
  // ========================================
  let layer4_angle = 90;
  let layer4_threshold = 110;
  let layer4_spacing = baseSpacing * 1.5;
  drawThresholdLines(
    layer4_angle,
    layer4_spacing,
    stepSize,
    layer4_threshold,
    spacingRandom,
    angleRandom
  );

  // ========================================
  // LAYER 5: Dark tones (horizontal)
  // Adds fourth direction for areas < 80
  // ========================================
  let layer5_angle = 0;
  let layer5_threshold = 80;
  let layer5_spacing = baseSpacing;
  drawThresholdLines(
    layer5_angle,
    layer5_spacing,
    stepSize,
    layer5_threshold,
    spacingRandom,
    angleRandom
  );

  // ========================================
  // LAYER 6: Darker tones (dense diagonal)
  // Extra density for areas < 60
  // ========================================
  let layer6_angle = 40;
  let layer6_threshold = 60;
  let layer6_spacing = baseSpacing;
  drawThresholdLines(
    layer6_angle,
    layer6_spacing,
    stepSize,
    layer6_threshold,
    spacingRandom,
    angleRandom
  );

  // ========================================
  // LAYER 7: Very dark (dense cross)
  // Maximum density for areas < 40
  // ========================================
  let layer7_angle = 130;
  let layer7_threshold = 40;
  let layer7_spacing = baseSpacing * 0.8;
  drawThresholdLines(
    layer7_angle,
    layer7_spacing,
    stepSize,
    layer7_threshold,
    spacingRandom,
    angleRandom
  );

  // ========================================
  // LAYER 8: Darkest shadows
  // Final pass for near-black areas < 25
  // ========================================
  let layer8_angle = 85;
  let layer8_threshold = 25;
  let layer8_spacing = baseSpacing * 0.6;
  drawThresholdLines(
    layer8_angle,
    layer8_spacing,
    stepSize,
    layer8_threshold,
    spacingRandom,
    angleRandom
  );

  // Uncomment if you want to save
  //saveCanvas('myCrossHatchOutput', 'png');
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
      // alpha unchanged
    }
  }
  inputImg.updatePixels();
}

/**
 * Draw diagonal lines at an approximate baseAngle (in degrees),
 * but each line can have a random ± angleRandom shift.
 * Similarly, line spacing is around baseLineSpacing ± lineSpacingRandom.
 *
 * @param {number} baseAngle        - The central angle in degrees (e.g. 45)
 * @param {number} baseLineSpacing  - The average distance between diagonals
 * @param {number} stepSize         - How far we move along each line each step
 * @param {number} threshold        - Brightness cutoff for drawing lines
 * @param {number} lineSpacingRandom - Max random deviation for spacing
 * @param {number} angleRandom       - Max random deviation (±) for angle
 */
function drawThresholdLines(
  baseAngle,
  baseLineSpacing,
  stepSize,
  threshold,
  lineSpacingRandom,
  angleRandom
) {
  stroke(0);
  strokeWeight(1);

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
    let spacing =
      baseLineSpacing + random(-lineSpacingRandom, lineSpacingRandom);
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
    let spacing =
      baseLineSpacing + random(-lineSpacingRandom, lineSpacingRandom);
    spacing = max(spacing, 1);
    currentX += spacing;
  }
}

/**
 * Trace a single diagonal line that begins at (startX, startY)
 * and extends inside the canvas, drawing segments where brightness < threshold.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} angleDeg
 * @param {number} stepSize
 * @param {number} threshold
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

    // Map canvas coordinates to image coordinates using scaleFactor
    let bx = floor(x * scaleFactor);
    let by = floor(y * scaleFactor);
    let c = img.get(bx, by);
    let bright = c[0]; // grayscale => r == g == b

    // If dark enough => continue line
    if (bright < threshold) {
      if (lineStart === null) {
        lineStart = { x, y };
      }
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
 * Listen for key presses. If 'S' is pressed, save an SVG.
 */
// function keyPressed() {
//   if (key === "S" || key === "s") {
//     // p5.svg library uses save(), just like normal,
//     // but it exports the drawing as an SVG file.
//     save("oulu_crossHatch.svg");
//   }
// }
