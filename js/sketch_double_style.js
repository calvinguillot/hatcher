/**
 * SKETCH DOUBLE STYLE - Edge Lines + Cross-Hatching
 *
 * Combines two artistic effects:
 * 1. Edge detection with hand-drawn style lines (wobbly, multiple strokes)
 * 2. Cross-hatching for shading based on brightness levels
 *
 * Creates a hand-painted look like traditional pen & ink illustrations.
 */

// ========================================
// CONFIGURATION & STATE
// ========================================
let params = {
  // Image adjustments
  contrast: 1.3,
  brightness: 0,
  invert: false,
  blur: 1.5,

  // === EDGE LINES ===
  edgeEnabled: true,
  edgeThreshold: 30, // Sobel edge threshold
  edgeLineWeight: 1.2,
  edgeWobble: 2.5, // Randomness in edge line position
  edgeMultiStroke: 2, // Number of strokes per edge (for sketchy look)
  edgeStrokeOffset: 1.5, // Offset between multiple strokes
  edgeMinLength: 15, // Minimum edge segment length
  edgeSimplify: 2.0, // Path simplification tolerance

  // === CROSS-HATCHING ===
  hatchEnabled: true,
  hatchLineWeight: 0.8,
  hatchSpacing: 5,
  hatchLength: 60,
  hatchWobble: 1.5, // Slight angle variation
  hatchStepSize: 2,

  // Layer 1 - Light shadows (45°)
  layer1Enabled: true,
  layer1Threshold: 180,
  layer1Angle: 45,
  layer1SpacingMult: 2.0,

  // Layer 2 - Medium shadows (135°)
  layer2Enabled: true,
  layer2Threshold: 130,
  layer2Angle: 135,
  layer2SpacingMult: 1.5,

  // Layer 3 - Dark shadows (90°)
  layer3Enabled: true,
  layer3Threshold: 80,
  layer3Angle: 90,
  layer3SpacingMult: 1.2,

  // Actions
  redraw: () => generateDrawing(),
  exportSVG: () => downloadSVG(),
  loadImage: () => document.getElementById("imageInput").click(),
};

let imageData = null;
let edgeData = null;
let imageWidth = 0;
let imageHeight = 0;
let allPaths = [];
let svg = null;
let gui = null;

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener("DOMContentLoaded", () => {
  initGUI();
  initSVG();
  initImageLoader();
  loadDefaultImage();
});

function initSVG() {
  const container = document.getElementById("canvas-container");
  svg = d3
    .select(container)
    .append("svg")
    .attr("id", "output-svg")
    .style("background", "#fff");
}

function initImageLoader() {
  const input = document.getElementById("imageInput");
  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        loadImageFromSrc(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  });
}

function loadDefaultImage() {
  loadImageFromSrc("old/couple-dancing-in-studio-bw-george-marks.jpg");
}

function loadImageFromSrc(src) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    processImage(img);
  };
  img.onerror = () => {
    console.error("Failed to load image:", src);
  };
  img.src = src;
}

// ========================================
// IMAGE PROCESSING
// ========================================
function processImage(img) {
  // Calculate dimensions to fit screen
  const maxW = window.innerWidth * 0.85;
  const maxH = window.innerHeight * 0.9;

  let scale = 1;
  if (img.width > maxW || img.height > maxH) {
    scale = Math.min(maxW / img.width, maxH / img.height);
  }

  imageWidth = Math.floor(img.width * scale);
  imageHeight = Math.floor(img.height * scale);

  // Resize SVG
  svg
    .attr("width", imageWidth)
    .attr("height", imageHeight)
    .attr("viewBox", `0 0 ${imageWidth} ${imageHeight}`);

  // Draw image to canvas to extract pixel data
  const canvas = document.createElement("canvas");
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const ctx = canvas.getContext("2d");

  // Apply blur
  if (params.blur > 0) {
    ctx.filter = `blur(${params.blur}px)`;
  }

  ctx.drawImage(img, 0, 0, imageWidth, imageHeight);
  ctx.filter = "none";

  // Get pixel data
  const pixels = ctx.getImageData(0, 0, imageWidth, imageHeight);

  // Convert to grayscale values array with adjustments
  imageData = new Float64Array(imageWidth * imageHeight);

  for (let i = 0; i < imageWidth * imageHeight; i++) {
    const idx = i * 4;
    const r = pixels.data[idx];
    const g = pixels.data[idx + 1];
    const b = pixels.data[idx + 2];

    // Luminance formula
    let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (params.invert) {
      gray = 255 - gray;
    }

    // Apply contrast
    gray = params.contrast * (gray - 128) + 128;

    // Apply brightness
    gray += params.brightness;

    imageData[i] = Math.max(0, Math.min(255, gray));
  }

  // Compute edge detection
  computeEdges();

  // Store original image for preview
  window._originalImage = img;

  generateDrawing();
}

// ========================================
// SOBEL EDGE DETECTION
// ========================================
function computeEdges() {
  edgeData = new Float64Array(imageWidth * imageHeight);

  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < imageHeight - 1; y++) {
    for (let x = 1; x < imageWidth - 1; x++) {
      let gx = 0;
      let gy = 0;

      // Apply Sobel kernel
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * imageWidth + (x + kx);
          const kidx = (ky + 1) * 3 + (kx + 1);
          const val = imageData[idx];

          gx += val * sobelX[kidx];
          gy += val * sobelY[kidx];
        }
      }

      // Edge magnitude
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeData[y * imageWidth + x] = magnitude;
    }
  }
}

// ========================================
// MAIN DRAWING GENERATION
// ========================================
function generateDrawing() {
  if (!imageData || imageWidth === 0) return;

  // Clear existing paths
  svg.selectAll("*").remove();
  allPaths = [];

  // Add background
  svg
    .append("rect")
    .attr("width", imageWidth)
    .attr("height", imageHeight)
    .attr("fill", "#fff");

  // Create groups for organization
  const hatchGroup = svg
    .append("g")
    .attr("class", "hatching")
    .attr("fill", "none")
    .attr("stroke", "#000")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round");

  const edgeGroup = svg
    .append("g")
    .attr("class", "edges")
    .attr("fill", "none")
    .attr("stroke", "#000")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round");

  // Generate cross-hatching layers (drawn first, underneath edges)
  if (params.hatchEnabled) {
    generateHatching(hatchGroup);
  }

  // Generate edge lines (drawn on top)
  if (params.edgeEnabled) {
    generateEdgeLines(edgeGroup);
  }

  console.log(`Generated ${allPaths.length} paths`);
}

// ========================================
// CROSS-HATCHING GENERATION
// ========================================
function generateHatching(group) {
  const layers = [
    {
      enabled: params.layer1Enabled,
      threshold: params.layer1Threshold,
      angle: params.layer1Angle,
      spacingMult: params.layer1SpacingMult,
    },
    {
      enabled: params.layer2Enabled,
      threshold: params.layer2Threshold,
      angle: params.layer2Angle,
      spacingMult: params.layer2SpacingMult,
    },
    {
      enabled: params.layer3Enabled,
      threshold: params.layer3Threshold,
      angle: params.layer3Angle,
      spacingMult: params.layer3SpacingMult,
    },
  ];

  layers.forEach((layer) => {
    if (!layer.enabled) return;
    drawHatchingLayer(group, layer.threshold, layer.angle, layer.spacingMult);
  });
}

function drawHatchingLayer(group, threshold, baseAngle, spacingMult) {
  const spacing = params.hatchSpacing * spacingMult;
  const angleRad = (baseAngle * Math.PI) / 180;
  const wobbleRad = (params.hatchWobble * Math.PI) / 180;

  // Calculate line spawn parameters
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Diagonal length for spawning
  const diagonal = Math.sqrt(imageWidth ** 2 + imageHeight ** 2);

  // Spawn lines perpendicular to angle
  const perpAngle = angleRad + Math.PI / 2;
  const perpCos = Math.cos(perpAngle);
  const perpSin = Math.sin(perpAngle);

  // Center point
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;

  // Generate lines across the canvas
  for (let d = -diagonal; d < diagonal; d += spacing) {
    // Starting point perpendicular to line direction
    const startX = cx + d * perpCos - diagonal * cosA;
    const startY = cy + d * perpSin - diagonal * sinA;

    // Add slight angle wobble
    const wobble = (Math.random() - 0.5) * 2 * wobbleRad;
    const lineAngle = angleRad + wobble;
    const lineCos = Math.cos(lineAngle);
    const lineSin = Math.sin(lineAngle);

    // Trace the line
    const segments = traceHatchLine(
      startX,
      startY,
      lineCos,
      lineSin,
      threshold
    );

    // Draw segments
    segments.forEach((seg) => {
      if (seg.length < 2) return;

      const pathStr = generateWobblyPath(seg, params.hatchWobble * 0.5);
      if (pathStr) {
        group
          .append("path")
          .attr("d", pathStr)
          .attr("stroke-width", params.hatchLineWeight);
        allPaths.push({ d: pathStr, weight: params.hatchLineWeight });
      }
    });
  }
}

function traceHatchLine(startX, startY, cosA, sinA, threshold) {
  const segments = [];
  let currentSegment = [];
  const step = params.hatchStepSize;
  const maxLen = Math.sqrt(imageWidth ** 2 + imageHeight ** 2) * 2;

  for (let t = 0; t < maxLen; t += step) {
    const x = startX + t * cosA;
    const y = startY + t * sinA;

    // Check bounds
    if (x < 0 || x >= imageWidth || y < 0 || y >= imageHeight) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    const brightness = getBrightness(x, y);

    if (brightness < threshold) {
      // Dark enough - add to segment
      currentSegment.push([x, y]);
    } else {
      // Too bright - end segment
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

// ========================================
// EDGE LINE GENERATION
// ========================================
function generateEdgeLines(group) {
  // Find edge pixels above threshold
  const edgePoints = [];

  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const edge = edgeData[y * imageWidth + x];
      if (edge > params.edgeThreshold) {
        edgePoints.push({ x, y, strength: edge });
      }
    }
  }

  // Trace connected edge segments
  const visited = new Set();
  const segments = [];

  edgePoints.forEach((point) => {
    const key = `${point.x},${point.y}`;
    if (visited.has(key)) return;

    const segment = traceEdgeSegment(point.x, point.y, visited);
    if (segment.length >= params.edgeMinLength / 2) {
      segments.push(segment);
    }
  });

  // Draw edge segments with hand-drawn style
  segments.forEach((segment) => {
    // Simplify the segment
    const simplified = simplifyPath(segment, params.edgeSimplify);

    if (simplified.length < 2) return;

    // Draw multiple strokes for sketchy look
    for (let stroke = 0; stroke < params.edgeMultiStroke; stroke++) {
      const offset = (stroke - (params.edgeMultiStroke - 1) / 2) * params.edgeStrokeOffset;
      const offsetSegment = simplified.map((p) => [
        p[0] + offset * (Math.random() - 0.5) * 2,
        p[1] + offset * (Math.random() - 0.5) * 2,
      ]);

      const pathStr = generateWobblyPath(offsetSegment, params.edgeWobble);
      if (pathStr) {
        group
          .append("path")
          .attr("d", pathStr)
          .attr("stroke-width", params.edgeLineWeight);
        allPaths.push({ d: pathStr, weight: params.edgeLineWeight });
      }
    }
  });
}

function traceEdgeSegment(startX, startY, visited) {
  const segment = [];
  const stack = [[startX, startY]];
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],          [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (x < 0 || x >= imageWidth || y < 0 || y >= imageHeight) continue;

    const edge = edgeData[y * imageWidth + x];
    if (edge <= params.edgeThreshold) continue;

    visited.add(key);
    segment.push([x, y]);

    // Find connected edge pixels (prefer continuing in same direction)
    directions.forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      const nkey = `${nx},${ny}`;

      if (!visited.has(nkey) && nx >= 0 && nx < imageWidth && ny >= 0 && ny < imageHeight) {
        if (edgeData[ny * imageWidth + nx] > params.edgeThreshold) {
          stack.push([nx, ny]);
        }
      }
    });
  }

  // Sort segment points to create continuous line
  return orderSegmentPoints(segment);
}

function orderSegmentPoints(points) {
  if (points.length < 2) return points;

  // Simple ordering: find the point closest to each previous point
  const ordered = [points[0]];
  const remaining = new Set(points.slice(1).map((p) => `${p[0]},${p[1]}`));
  const pointMap = new Map(points.map((p) => [`${p[0]},${p[1]}`, p]));

  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let closest = null;
    let closestDist = Infinity;
    let closestKey = null;

    remaining.forEach((key) => {
      const p = pointMap.get(key);
      const dist = Math.sqrt((p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closest = p;
        closestKey = key;
      }
    });

    // If closest point is too far, break the chain
    if (closestDist > 3) break;

    ordered.push(closest);
    remaining.delete(closestKey);
  }

  return ordered;
}

// ========================================
// PATH GENERATION WITH WOBBLE
// ========================================
function generateWobblyPath(points, wobbleAmount) {
  if (points.length < 2) return null;

  // Add subtle randomness to each point
  const wobbly = points.map((p) => [
    p[0] + (Math.random() - 0.5) * wobbleAmount,
    p[1] + (Math.random() - 0.5) * wobbleAmount,
  ]);

  // Generate smooth bezier path
  if (wobbly.length === 2) {
    return `M ${wobbly[0][0]},${wobbly[0][1]} L ${wobbly[1][0]},${wobbly[1][1]}`;
  }

  let d = `M ${wobbly[0][0]},${wobbly[0][1]}`;

  const tension = 0.4;
  const n = wobbly.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = wobbly[Math.max(0, i - 1)];
    const p1 = wobbly[i];
    const p2 = wobbly[Math.min(n - 1, i + 1)];
    const p3 = wobbly[Math.min(n - 1, i + 2)];

    // Catmull-Rom to Bezier control points
    const cp1x = p1[0] + ((p2[0] - p0[0]) * tension) / 6;
    const cp1y = p1[1] + ((p2[1] - p0[1]) * tension) / 6;
    const cp2x = p2[0] - ((p3[0] - p1[0]) * tension) / 6;
    const cp2y = p2[1] - ((p3[1] - p1[1]) * tension) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }

  return d;
}

// ========================================
// PATH SIMPLIFICATION (Douglas-Peucker)
// ========================================
function simplifyPath(points, tolerance) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIndex = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(points.slice(maxIndex), tolerance);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag === 0) {
    return Math.sqrt(
      (point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2
    );
  }

  const u =
    ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) /
    (mag * mag);

  let closestX, closestY;

  if (u < 0) {
    closestX = lineStart[0];
    closestY = lineStart[1];
  } else if (u > 1) {
    closestX = lineEnd[0];
    closestY = lineEnd[1];
  } else {
    closestX = lineStart[0] + u * dx;
    closestY = lineStart[1] + u * dy;
  }

  return Math.sqrt((point[0] - closestX) ** 2 + (point[1] - closestY) ** 2);
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function getBrightness(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  if (ix < 0 || ix >= imageWidth || iy < 0 || iy >= imageHeight) {
    return 255;
  }

  return imageData[iy * imageWidth + ix];
}

// ========================================
// SVG EXPORT
// ========================================
function downloadSVG() {
  // Create clean SVG for export
  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${imageWidth}" 
     height="${imageHeight}" 
     viewBox="0 0 ${imageWidth} ${imageHeight}">
  <rect width="${imageWidth}" height="${imageHeight}" fill="#fff"/>
  <g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">
`;

  allPaths.forEach((path) => {
    svgContent += `    <path d="${path.d}" stroke-width="${path.weight}"/>\n`;
  });

  svgContent += `  </g>
</svg>`;

  // Create download
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "double_style_output.svg";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  console.log("SVG exported successfully");
}

// ========================================
// DAT.GUI SETUP
// ========================================
function initGUI() {
  gui = new dat.GUI({ width: 320 });

  // Image adjustments
  const imgFolder = gui.addFolder("🖼️ Image Adjustments");
  imgFolder.add(params, "contrast", 0.2, 3.0, 0.05).name("Contrast").onChange(reprocessImage);
  imgFolder.add(params, "brightness", -100, 100, 1).name("Brightness").onChange(reprocessImage);
  imgFolder.add(params, "invert").name("Invert").onChange(reprocessImage);
  imgFolder.add(params, "blur", 0, 10, 0.5).name("Blur").onChange(reprocessImage);
  imgFolder.open();

  // Edge settings
  const edgeFolder = gui.addFolder("✏️ Edge Lines");
  edgeFolder.add(params, "edgeEnabled").name("Enabled").onChange(generateDrawing);
  edgeFolder.add(params, "edgeThreshold", 10, 150, 5).name("Edge Threshold").onChange(generateDrawing);
  edgeFolder.add(params, "edgeLineWeight", 0.3, 3.0, 0.1).name("Line Weight").onChange(generateDrawing);
  edgeFolder.add(params, "edgeWobble", 0, 8, 0.5).name("Wobble").onChange(generateDrawing);
  edgeFolder.add(params, "edgeMultiStroke", 1, 5, 1).name("Multi-Stroke").onChange(generateDrawing);
  edgeFolder.add(params, "edgeStrokeOffset", 0.5, 4, 0.5).name("Stroke Offset").onChange(generateDrawing);
  edgeFolder.add(params, "edgeMinLength", 5, 50, 5).name("Min Length").onChange(generateDrawing);
  edgeFolder.add(params, "edgeSimplify", 0.5, 10, 0.5).name("Simplify").onChange(generateDrawing);
  edgeFolder.open();

  // Hatching global settings
  const hatchFolder = gui.addFolder("📐 Cross-Hatching");
  hatchFolder.add(params, "hatchEnabled").name("Enabled").onChange(generateDrawing);
  hatchFolder.add(params, "hatchLineWeight", 0.3, 2.0, 0.1).name("Line Weight").onChange(generateDrawing);
  hatchFolder.add(params, "hatchSpacing", 2, 15, 0.5).name("Base Spacing").onChange(generateDrawing);
  hatchFolder.add(params, "hatchWobble", 0, 5, 0.5).name("Wobble").onChange(generateDrawing);
  hatchFolder.add(params, "hatchStepSize", 0.5, 5, 0.5).name("Step Size").onChange(generateDrawing);
  hatchFolder.open();

  // Layer 1
  const layer1 = gui.addFolder("🎨 Layer 1 (Light Shadows - 45°)");
  layer1.add(params, "layer1Enabled").name("Enabled").onChange(generateDrawing);
  layer1.add(params, "layer1Threshold", 50, 255, 5).name("Threshold").onChange(generateDrawing);
  layer1.add(params, "layer1Angle", -180, 180, 5).name("Angle").onChange(generateDrawing);
  layer1.add(params, "layer1SpacingMult", 0.5, 4, 0.1).name("Spacing ×").onChange(generateDrawing);

  // Layer 2
  const layer2 = gui.addFolder("🎨 Layer 2 (Medium Shadows - 135°)");
  layer2.add(params, "layer2Enabled").name("Enabled").onChange(generateDrawing);
  layer2.add(params, "layer2Threshold", 50, 255, 5).name("Threshold").onChange(generateDrawing);
  layer2.add(params, "layer2Angle", -180, 180, 5).name("Angle").onChange(generateDrawing);
  layer2.add(params, "layer2SpacingMult", 0.5, 4, 0.1).name("Spacing ×").onChange(generateDrawing);

  // Layer 3
  const layer3 = gui.addFolder("🎨 Layer 3 (Dark Shadows - 90°)");
  layer3.add(params, "layer3Enabled").name("Enabled").onChange(generateDrawing);
  layer3.add(params, "layer3Threshold", 50, 255, 5).name("Threshold").onChange(generateDrawing);
  layer3.add(params, "layer3Angle", -180, 180, 5).name("Angle").onChange(generateDrawing);
  layer3.add(params, "layer3SpacingMult", 0.5, 4, 0.1).name("Spacing ×").onChange(generateDrawing);

  // Actions
  const actionsFolder = gui.addFolder("💾 Actions");
  actionsFolder.add(params, "loadImage").name("📂 Load Image");
  actionsFolder.add(params, "redraw").name("↻ Redraw");
  actionsFolder.add(params, "exportSVG").name("📥 Export SVG");
  actionsFolder.open();
}

function reprocessImage() {
  if (window._originalImage) {
    processImage(window._originalImage);
  }
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener("keydown", (e) => {
  if ((e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    downloadSVG();
  }
  if (e.key === "r" || e.key === "R") {
    generateDrawing();
  }
});

// ========================================
// WINDOW RESIZE
// ========================================
window.addEventListener("resize", () => {
  if (window._originalImage) {
    processImage(window._originalImage);
  }
});

