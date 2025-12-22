/**
 * SKETCH CONTOUR OPUS - Topographic Contour Image Processor
 *
 * Generates contour lines from image brightness values like a topographic map.
 * Darker areas get denser contour lines, lighter areas get sparser lines.
 *
 * Features:
 * - D3.js contour generation
 * - Bezier curve smoothing
 * - Controllable contour spacing
 * - SVG export for pen plotter
 * - dat.GUI controls
 */

// ========================================
// CONFIGURATION & STATE
// ========================================
let params = {
  // Image adjustments
  contrast: 1.2,
  brightness: 0,
  invert: false,
  blur: 2,
  edgeSoftening: 3, // Extra blur passes to soften harsh edges

  // Contour settings
  numContours: 20,
  minContourLevel: 10,
  maxContourLevel: 245,
  minPathLength: 50, // Minimum path length in pixels (filters out tiny edge noise)

  // Line smoothing
  smoothing: 0.5,
  simplifyTolerance: 1.5,

  // Visual
  strokeWidth: 1.0,
  showImage: false,

  // Actions
  redraw: () => generateContours(),
  exportSVG: () => downloadSVG(),
  loadImage: () => document.getElementById("imageInput").click(),
};

let imageData = null;
let imageWidth = 0;
let imageHeight = 0;
let contourPaths = [];
let svg = null;
let gui = null;

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener("DOMContentLoaded", () => {
  initGUI();
  initSVG();
  initImageLoader();

  // Load default image
  loadDefaultImage();
});

function initSVG() {
  const container = document.getElementById("canvas-container");

  svg = d3
    .select(container)
    .append("svg")
    .attr("id", "contour-svg")
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

  // Apply initial blur if needed
  if (params.blur > 0) {
    ctx.filter = `blur(${params.blur}px)`;
  }

  ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

  // Apply edge softening (multiple blur passes to smooth harsh transitions)
  if (params.edgeSoftening > 0) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = imageWidth;
    tempCanvas.height = imageHeight;
    const tempCtx = tempCanvas.getContext("2d");

    // Copy current state
    tempCtx.drawImage(canvas, 0, 0);

    // Apply progressive blur passes
    for (let i = 0; i < params.edgeSoftening; i++) {
      ctx.filter = `blur(${1 + i * 0.5}px)`;
      ctx.globalAlpha = 0.3; // Blend with original
      ctx.drawImage(tempCanvas, 0, 0);
    }
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
  }

  // Get pixel data
  const pixels = ctx.getImageData(0, 0, imageWidth, imageHeight);

  // Convert to grayscale values array
  imageData = new Float64Array(imageWidth * imageHeight);

  for (let i = 0; i < imageWidth * imageHeight; i++) {
    const idx = i * 4;
    const r = pixels.data[idx];
    const g = pixels.data[idx + 1];
    const b = pixels.data[idx + 2];

    // Luminance formula
    let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Apply inversion
    if (params.invert) {
      gray = 255 - gray;
    }

    // Apply contrast
    gray = params.contrast * (gray - 128) + 128;

    // Apply brightness
    gray += params.brightness;

    // Clamp
    imageData[i] = Math.max(0, Math.min(255, gray));
  }

  // Store original image for preview
  window._originalImage = img;

  generateContours();
}

// ========================================
// CONTOUR GENERATION
// ========================================
function generateContours() {
  if (!imageData || imageWidth === 0) return;

  // Clear existing paths
  svg.selectAll("*").remove();

  // Add background
  svg
    .append("rect")
    .attr("width", imageWidth)
    .attr("height", imageHeight)
    .attr("fill", "#fff");

  // Show image preview if enabled
  if (params.showImage && window._originalImage) {
    svg
      .append("image")
      .attr("href", window._originalImage.src)
      .attr("width", imageWidth)
      .attr("height", imageHeight)
      .attr("opacity", 0.3);
  }

  // Generate contour thresholds
  // More thresholds in darker areas (lower values)
  const thresholds = generateThresholds();

  // Create contour generator
  const contours = d3
    .contours()
    .size([imageWidth, imageHeight])
    .thresholds(thresholds);

  // Generate contours from image data
  const contourData = contours(imageData);

  // Create path generator with smoothing
  const path = d3.geoPath();

  // Create group for contours
  const contourGroup = svg
    .append("g")
    .attr("class", "contours")
    .attr("fill", "none")
    .attr("stroke", "#000")
    .attr("stroke-width", params.strokeWidth)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round");

  // Store paths for export
  contourPaths = [];

  contourData.forEach((contour, i) => {
    // Process each ring in the contour
    contour.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => {
        // Calculate path length to filter out tiny edge noise
        const pathLength = calculatePathLength(ring);
        if (pathLength < params.minPathLength) {
          return; // Skip paths that are too short
        }

        // Simplify the path if needed
        let simplifiedRing = ring;
        if (params.simplifyTolerance > 0) {
          simplifiedRing = simplifyPath(ring, params.simplifyTolerance);
        }

        // Generate path string
        let pathStr;
        if (params.smoothing > 0 && simplifiedRing.length >= 3) {
          pathStr = generateSmoothPath(simplifiedRing, params.smoothing);
        } else {
          pathStr = generateLinearPath(simplifiedRing);
        }

        if (pathStr) {
          contourGroup
            .append("path")
            .attr("d", pathStr)
            .attr("data-level", contour.value);

          contourPaths.push(pathStr);
        }
      });
    });
  });

  console.log(`Generated ${contourPaths.length} contour paths`);
}

function generateThresholds() {
  const thresholds = [];
  const min = params.minContourLevel;
  const max = params.maxContourLevel;
  const count = params.numContours;

  // Linear distribution of thresholds
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const value = min + t * (max - min);
    thresholds.push(value);
  }

  return thresholds;
}

// ========================================
// PATH LENGTH CALCULATION
// ========================================
function calculatePathLength(points) {
  if (points.length < 2) return 0;

  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

// ========================================
// PATH SMOOTHING (Bezier Curves)
// ========================================
function generateSmoothPath(points, tension) {
  if (points.length < 2) return null;
  if (points.length === 2) {
    return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`;
  }

  // Use Catmull-Rom to Bezier conversion for smooth curves
  let d = `M ${points[0][0]},${points[0][1]}`;

  const n = points.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(n - 1, i + 1)];
    const p3 = points[Math.min(n - 1, i + 2)];

    // Calculate control points using Catmull-Rom
    const cp1x = p1[0] + ((p2[0] - p0[0]) * tension) / 6;
    const cp1y = p1[1] + ((p2[1] - p0[1]) * tension) / 6;
    const cp2x = p2[0] - ((p3[0] - p1[0]) * tension) / 6;
    const cp2y = p2[1] - ((p3[1] - p1[1]) * tension) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }

  // Check if path is closed (first and last points are close)
  const first = points[0];
  const last = points[n - 1];
  const dist = Math.sqrt((first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2);

  if (dist < 2) {
    d += " Z";
  }

  return d;
}

function generateLinearPath(points) {
  if (points.length < 2) return null;

  let d = `M ${points[0][0]},${points[0][1]}`;

  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]},${points[i][1]}`;
  }

  // Check if closed
  const first = points[0];
  const last = points[points.length - 1];
  const dist = Math.sqrt((first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2);

  if (dist < 2) {
    d += " Z";
  }

  return d;
}

// ========================================
// PATH SIMPLIFICATION (Douglas-Peucker)
// ========================================
function simplifyPath(points, tolerance) {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line
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

  // If max distance is greater than tolerance, recursively simplify
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
// SVG EXPORT
// ========================================
function downloadSVG() {
  const svgElement = document.getElementById("contour-svg");

  // Clone the SVG
  const clone = svgElement.cloneNode(true);

  // Remove the background image if present
  const images = clone.querySelectorAll("image");
  images.forEach((img) => img.remove());

  // Add XML declaration and namespaces
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clone);

  // Add proper SVG header for pen plotter compatibility
  svgString = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${imageWidth}" 
     height="${imageHeight}" 
     viewBox="0 0 ${imageWidth} ${imageHeight}">
  <g fill="none" stroke="#000" stroke-width="${
    params.strokeWidth
  }" stroke-linecap="round" stroke-linejoin="round">
    ${contourPaths.map((p) => `<path d="${p}"/>`).join("\n    ")}
  </g>
</svg>`;

  // Create download link
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "contour_output.svg";
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
  imgFolder
    .add(params, "contrast", 0.2, 3.0, 0.05)
    .name("Contrast")
    .onChange(reprocessImage);
  imgFolder
    .add(params, "brightness", -100, 100, 1)
    .name("Brightness")
    .onChange(reprocessImage);
  imgFolder.add(params, "invert").name("Invert").onChange(reprocessImage);
  imgFolder
    .add(params, "blur", 0, 10, 0.5)
    .name("Blur")
    .onChange(reprocessImage);
  imgFolder
    .add(params, "edgeSoftening", 0, 10, 1)
    .name("Edge Softening")
    .onChange(reprocessImage);
  imgFolder.open();

  // Contour settings
  const contourFolder = gui.addFolder("📊 Contour Settings");
  contourFolder
    .add(params, "numContours", 5, 100, 1)
    .name("Number of Contours")
    .onChange(generateContours);
  contourFolder
    .add(params, "minContourLevel", 0, 127, 1)
    .name("Min Level (Dark)")
    .onChange(generateContours);
  contourFolder
    .add(params, "maxContourLevel", 128, 255, 1)
    .name("Max Level (Light)")
    .onChange(generateContours);
  contourFolder
    .add(params, "minPathLength", 0, 200, 5)
    .name("Min Path Length")
    .onChange(generateContours);
  contourFolder.open();

  // Smoothing settings
  const smoothFolder = gui.addFolder("〰️ Line Smoothing");
  smoothFolder
    .add(params, "smoothing", 0, 2, 0.1)
    .name("Bezier Smoothing")
    .onChange(generateContours);
  smoothFolder
    .add(params, "simplifyTolerance", 0, 10, 0.5)
    .name("Simplify Tolerance")
    .onChange(generateContours);
  smoothFolder.open();

  // Visual settings
  const visualFolder = gui.addFolder("👁️ Visual");
  visualFolder
    .add(params, "strokeWidth", 0.3, 3.0, 0.1)
    .name("Line Weight")
    .onChange(updateStroke);
  visualFolder
    .add(params, "showImage")
    .name("Show Image Preview")
    .onChange(generateContours);
  visualFolder.open();

  // Actions
  const actionsFolder = gui.addFolder("💾 Actions");
  actionsFolder.add(params, "loadImage").name("📂 Load Image");
  actionsFolder.add(params, "redraw").name("↻ Redraw");
  actionsFolder.add(params, "exportSVG").name("📥 Export SVG");
  actionsFolder.open();
}

function updateStroke() {
  svg.selectAll(".contours path").attr("stroke-width", params.strokeWidth);
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
  if (e.key === "s" || e.key === "S") {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      downloadSVG();
    }
  }
  if (e.key === "r" || e.key === "R") {
    generateContours();
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
