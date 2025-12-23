import argparse
import math
import random
import os
import svgwrite
from PIL import Image, ImageFilter, ImageOps
import numpy as np

# Optional imports
try:
    from scipy import ndimage
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

# Optional imports for HED
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision import transforms
    HED_AVAILABLE = True
except ImportError:
    HED_AVAILABLE = False

# Optional imports for YOLO
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

def get_brightness(pixel):
    """Returns brightness of a pixel (0-255)."""
    if isinstance(pixel, int):
        return pixel
    # If RGB
    r, g, b = pixel[:3]
    return int(0.2126 * r + 0.7152 * g + 0.0722 * b)

def apply_wobble(x, y, amount=1.0):
    """Adds random wobble to a point."""
    return x + random.uniform(-amount, amount), y + random.uniform(-amount, amount)

def chaikin_smoothing(points, iterations=2, ratio=0.25):
    """
    Chaikin's corner cutting algorithm for smooth curve generation.
    
    Args:
        points: List of (x, y) tuples
        iterations: Number of subdivision iterations (more = smoother)
        ratio: Cutting ratio (typically 0.25)
    
    Returns:
        List of smoothed (x, y) tuples
    """
    if len(points) < 2:
        return points
    
    result = list(points)
    
    for _ in range(iterations):
        new_points = [result[0]]  # Keep first point
        for i in range(len(result) - 1):
            p1 = result[i]
            p2 = result[i + 1]
            
            # Create two new points between p1 and p2
            q1_x = p1[0] * (1 - ratio) + p2[0] * ratio
            q1_y = p1[1] * (1 - ratio) + p2[1] * ratio
            q2_x = p1[0] * ratio + p2[0] * (1 - ratio)
            q2_y = p1[1] * ratio + p2[1] * (1 - ratio)
            
            new_points.append((q1_x, q1_y))
            new_points.append((q2_x, q2_y))
        
        new_points.append(result[-1])  # Keep last point
        result = new_points
    
    return result

def hermite_interpolation(points, smoothing=0.5):
    """
    Hermite interpolation with tangent vectors for smooth curves.
    
    Args:
        points: List of (x, y) tuples
        smoothing: Tension parameter (0-1, higher = smoother)
    
    Returns:
        List of interpolated (x, y) tuples
    """
    if len(points) < 2:
        return points
    
    if len(points) == 2:
        return points
    
    # Calculate tangents at each point
    tangents = []
    for i in range(len(points)):
        if i == 0:
            # First point: tangent towards next point
            dx = points[1][0] - points[0][0]
            dy = points[1][1] - points[0][1]
        elif i == len(points) - 1:
            # Last point: tangent from previous point
            dx = points[i][0] - points[i-1][0]
            dy = points[i][1] - points[i-1][1]
        else:
            # Intermediate: average of forward and backward differences
            dx1 = points[i+1][0] - points[i][0]
            dy1 = points[i+1][1] - points[i][1]
            dx2 = points[i][0] - points[i-1][0]
            dy2 = points[i][1] - points[i-1][1]
            dx = (dx1 + dx2) / 2
            dy = (dy1 + dy2) / 2
        
        # Normalize and scale tangents
        length = math.sqrt(dx*dx + dy*dy)
        if length > 0:
            # Normalize and apply smoothing factor (controls tension)
            scale = smoothing * 0.5  # Scale factor for tangent magnitude
            dx = dx * scale
            dy = dy * scale
        else:
            dx = 0
            dy = 0
        
        tangents.append((dx, dy))
    
    # Generate interpolated points using Hermite basis functions
    interpolated = [points[0]]
    num_segments = max(3, int(len(points) * 2))
    
    for i in range(len(points) - 1):
        p0 = points[i]
        p1 = points[i + 1]
        m0 = tangents[i]
        m1 = tangents[i + 1]
        
        # Generate points along this segment
        segment_points = max(2, num_segments // (len(points) - 1))
        for j in range(1, segment_points):
            t = j / segment_points
            
            # Hermite basis functions
            h00 = 2*t*t*t - 3*t*t + 1
            h10 = t*t*t - 2*t*t + t
            h01 = -2*t*t*t + 3*t*t
            h11 = t*t*t - t*t
            
            x = h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0]
            y = h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1]
            
            interpolated.append((x, y))
    
    interpolated.append(points[-1])
    return interpolated

def sliding_average_smoothing(points, window_size=3):
    """
    Sliding average (moving average) filter for smoothing.
    
    Args:
        points: List of (x, y) tuples
        window_size: Size of the averaging window (must be odd)
    
    Returns:
        List of smoothed (x, y) tuples
    """
    if len(points) < 2:
        return points
    
    if window_size < 3:
        window_size = 3
    if window_size % 2 == 0:
        window_size += 1
    
    half_window = window_size // 2
    smoothed = []
    
    for i in range(len(points)):
        # Collect points in window
        window_points = []
        for j in range(-half_window, half_window + 1):
            idx = max(0, min(len(points) - 1, i + j))
            window_points.append(points[idx])
        
        # Calculate average
        avg_x = sum(p[0] for p in window_points) / len(window_points)
        avg_y = sum(p[1] for p in window_points) / len(window_points)
        smoothed.append((avg_x, avg_y))
    
    return smoothed

def smooth_path_segment(points, smoothing=0.0, method='bezier'):
    """
    Smooths a path segment using various interpolation methods.
    
    Args:
        points: List of (x, y) tuples representing the path
        smoothing: Float between 0 and 1
            - 0: No smoothing (original path with line segments)
            - 1: Maximum smoothing
            - 0-1: Smooth curve interpolation
        method: Interpolation method
            - 'bezier': Bezier curve interpolation (original)
            - 'chaikin': Chaikin's corner cutting algorithm
            - 'hermite': Hermite interpolation with tangents
            - 'sliding': Sliding average smoothing
    
    Returns:
        SVG path data string with smooth curves
    """
    if len(points) < 2:
        return ""
    
    if smoothing == 0.0:
        # No smoothing - return original path with line segments
        path_data = f"M{points[0][0]:.1f},{points[0][1]:.1f}"
        for x, y in points[1:]:
            path_data += f" L{x:.1f},{y:.1f}"
        return path_data
    
    # Apply method-specific smoothing
    if method == 'chaikin':
        # Chaikin's algorithm: iterations based on smoothing
        iterations = max(1, int(smoothing * 4))
        smoothed_points = chaikin_smoothing(points, iterations=iterations, ratio=0.25)
        
        # If smoothing is 1.0, also blend towards straight line
        if smoothing >= 0.9:
            start = points[0]
            end = points[-1]
            blend_factor = (smoothing - 0.9) * 10  # 0-1 range for 0.9-1.0 smoothing
            final_points = []
            for i, point in enumerate(smoothed_points):
                t = i / (len(smoothed_points) - 1) if len(smoothed_points) > 1 else 0
                line_x = start[0] * (1 - t) + end[0] * t
                line_y = start[1] * (1 - t) + end[1] * t
                final_x = point[0] * (1 - blend_factor) + line_x * blend_factor
                final_y = point[1] * (1 - blend_factor) + line_y * blend_factor
                final_points.append((final_x, final_y))
            smoothed_points = final_points
        
        # Convert to SVG path
        path_data = f"M{smoothed_points[0][0]:.1f},{smoothed_points[0][1]:.1f}"
        for x, y in smoothed_points[1:]:
            path_data += f" L{x:.1f},{y:.1f}"
        return path_data
    
    elif method == 'hermite':
        # Hermite interpolation: smoothing controls tension
        tension = smoothing * 0.5  # Scale for better control
        smoothed_points = hermite_interpolation(points, smoothing=tension)
        
        # If smoothing is 1.0, blend towards straight line
        if smoothing >= 0.9:
            start = points[0]
            end = points[-1]
            blend_factor = (smoothing - 0.9) * 10
            final_points = []
            for i, point in enumerate(smoothed_points):
                t = i / (len(smoothed_points) - 1) if len(smoothed_points) > 1 else 0
                line_x = start[0] * (1 - t) + end[0] * t
                line_y = start[1] * (1 - t) + end[1] * t
                final_x = point[0] * (1 - blend_factor) + line_x * blend_factor
                final_y = point[1] * (1 - blend_factor) + line_y * blend_factor
                final_points.append((final_x, final_y))
            smoothed_points = final_points
        
        # Convert to SVG path with smooth curves
        path_data = f"M{smoothed_points[0][0]:.1f},{smoothed_points[0][1]:.1f}"
        for i in range(1, len(smoothed_points)):
            if i == 1 or i == len(smoothed_points) - 1:
                path_data += f" L{smoothed_points[i][0]:.1f},{smoothed_points[i][1]:.1f}"
            else:
                # Use quadratic Bezier for smooth transitions
                prev = smoothed_points[i-1]
                curr = smoothed_points[i]
                next_p = smoothed_points[i+1] if i < len(smoothed_points) - 1 else curr
                # Control point is midpoint
                cp_x = (curr[0] + next_p[0]) / 2
                cp_y = (curr[1] + next_p[1]) / 2
                path_data += f" Q{cp_x:.1f},{cp_y:.1f} {curr[0]:.1f},{curr[1]:.1f}"
        return path_data
    
    elif method == 'sliding':
        # Sliding average: window size based on smoothing
        window_size = max(3, min(15, int(3 + smoothing * 12)))
        smoothed_points = sliding_average_smoothing(points, window_size=window_size)
        
        # If smoothing is 1.0, blend towards straight line
        if smoothing >= 0.9:
            start = points[0]
            end = points[-1]
            blend_factor = (smoothing - 0.9) * 10
            final_points = []
            for i, point in enumerate(smoothed_points):
                t = i / (len(smoothed_points) - 1) if len(smoothed_points) > 1 else 0
                line_x = start[0] * (1 - t) + end[0] * t
                line_y = start[1] * (1 - t) + end[1] * t
                final_x = point[0] * (1 - blend_factor) + line_x * blend_factor
                final_y = point[1] * (1 - blend_factor) + line_y * blend_factor
                final_points.append((final_x, final_y))
            smoothed_points = final_points
        
        # Convert to SVG path
        path_data = f"M{smoothed_points[0][0]:.1f},{smoothed_points[0][1]:.1f}"
        for x, y in smoothed_points[1:]:
            path_data += f" L{x:.1f},{y:.1f}"
        return path_data
    
    # Default: Bezier method (original implementation)
    if smoothing == 1.0:
        # Maximum smoothing - straight line from start to end
        start = points[0]
        end = points[-1]
        return f"M{start[0]:.1f},{start[1]:.1f} L{end[0]:.1f},{end[1]:.1f}"
    
    # Intermediate smoothing: create smooth curve that interpolates between
    # original path and straight line based on smoothing value
    start = points[0]
    end = points[-1]
    
    if len(points) == 2:
        # Only two points - use quadratic Bezier with control point
        # Control point is interpolated between midpoint and original path
        mid_x = (start[0] + end[0]) / 2
        mid_y = (start[1] + end[1]) / 2
        # At smoothing=0, control point would be at midpoint (but we already handled that)
        # At smoothing=1, it's a straight line (already handled)
        # For intermediate values, create a smooth curve
        control_x = mid_x * (1 - smoothing) + start[0] * smoothing
        control_y = mid_y * (1 - smoothing) + start[1] * smoothing
        return f"M{start[0]:.1f},{start[1]:.1f} Q{control_x:.1f},{control_y:.1f} {end[0]:.1f},{end[1]:.1f}"
    
    # For longer paths, create smooth Bezier curves
    # Reduce number of control points based on smoothing
    num_segments = max(1, int(len(points) * (1 - smoothing * 0.7)))
    
    # Select key points from original path
    if num_segments >= len(points):
        selected_points = points
    else:
        step = (len(points) - 1) / num_segments
        selected_points = [points[0]]
        for i in range(1, num_segments):
            idx = int(i * step)
            if idx < len(points):
                selected_points.append(points[idx])
        selected_points.append(points[-1])
    
    # Interpolate each point toward the straight line based on smoothing
    smoothed_points = []
    for i, point in enumerate(selected_points):
        # Calculate position on straight line
        t = i / (len(selected_points) - 1) if len(selected_points) > 1 else 0
        line_x = start[0] * (1 - t) + end[0] * t
        line_y = start[1] * (1 - t) + end[1] * t
        
        # Blend between original point and line point
        smoothed_x = point[0] * (1 - smoothing) + line_x * smoothing
        smoothed_y = point[1] * (1 - smoothing) + line_y * smoothing
        smoothed_points.append((smoothed_x, smoothed_y))
    
    # Generate smooth Bezier path using cubic Bezier curves
    if len(smoothed_points) == 2:
        return f"M{smoothed_points[0][0]:.1f},{smoothed_points[0][1]:.1f} L{smoothed_points[1][0]:.1f},{smoothed_points[1][1]:.1f}"
    
    # Use cubic Bezier curves for smooth transitions
    path_data = f"M{smoothed_points[0][0]:.1f},{smoothed_points[0][1]:.1f}"
    
    for i in range(1, len(smoothed_points)):
        prev_point = smoothed_points[i-1]
        curr_point = smoothed_points[i]
        
        if i == len(smoothed_points) - 1:
            # Last point - use quadratic Bezier for smooth end
            if i > 1:
                # Calculate control point based on previous direction
                prev_prev = smoothed_points[i-2]
                # Control point extends in the direction of the last segment
                dx = curr_point[0] - prev_point[0]
                dy = curr_point[1] - prev_point[1]
                control_x = prev_point[0] + dx * 0.5
                control_y = prev_point[1] + dy * 0.5
                path_data += f" Q{control_x:.1f},{control_y:.1f} {curr_point[0]:.1f},{curr_point[1]:.1f}"
            else:
                path_data += f" L{curr_point[0]:.1f},{curr_point[1]:.1f}"
        else:
            # Intermediate points - use cubic Bezier
            next_point = smoothed_points[i+1]
            
            # Calculate control points for smooth curve
            # First control point (after prev_point)
            dx1 = curr_point[0] - prev_point[0]
            dy1 = curr_point[1] - prev_point[1]
            cp1_x = prev_point[0] + dx1 * 0.3
            cp1_y = prev_point[1] + dy1 * 0.3
            
            # Second control point (before curr_point)
            dx2 = next_point[0] - curr_point[0]
            dy2 = next_point[1] - curr_point[1]
            cp2_x = curr_point[0] - dx2 * 0.3
            cp2_y = curr_point[1] - dy2 * 0.3
            
            path_data += f" C{cp1_x:.1f},{cp1_y:.1f} {cp2_x:.1f},{cp2_y:.1f} {curr_point[0]:.1f},{curr_point[1]:.1f}"
    
    return path_data

def _convolve2d(image, kernel):
    """
    Manual 2D convolution using numpy (fallback when scipy is not available).
    """
    kernel_height, kernel_width = kernel.shape
    image_height, image_width = image.shape
    
    # Pad the image
    pad_h = kernel_height // 2
    pad_w = kernel_width // 2
    padded = np.pad(image, ((pad_h, pad_h), (pad_w, pad_w)), mode='constant', constant_values=0)
    
    # Initialize output
    output = np.zeros_like(image, dtype=np.float32)
    
    # Perform convolution
    for y in range(image_height):
        for x in range(image_width):
            output[y, x] = np.sum(padded[y:y+kernel_height, x:x+kernel_width] * kernel)
    
    return output

def sobel_edge_detection(img_gray, threshold=50):
    """
    Sobel edge detection using numpy.
    Based on: https://github.com/ErykBrol/Sobel-Edge-Detector
    
    Args:
        img_gray: PIL Image in grayscale mode
        threshold: Threshold value for edge detection (0-255)
    
    Returns:
        PIL Image with detected edges
    """
    # Convert PIL image to numpy array
    img_array = np.array(img_gray, dtype=np.float32)
    
    # Sobel kernels
    sobel_x = np.array([[-1, 0, 1],
                        [-2, 0, 2],
                        [-1, 0, 1]], dtype=np.float32)
    
    sobel_y = np.array([[-1, -2, -1],
                        [0, 0, 0],
                        [1, 2, 1]], dtype=np.float32)
    
    # Apply Sobel operators using convolution
    if SCIPY_AVAILABLE:
        gx = ndimage.convolve(img_array, sobel_x, mode='constant', cval=0.0)
        gy = ndimage.convolve(img_array, sobel_y, mode='constant', cval=0.0)
    else:
        # Fallback to manual convolution
        gx = _convolve2d(img_array, sobel_x)
        gy = _convolve2d(img_array, sobel_y)
    
    # Calculate gradient magnitude
    magnitude = np.sqrt(gx**2 + gy**2)
    
    # Normalize to 0-255
    if magnitude.max() > 0:
        magnitude = (magnitude / magnitude.max() * 255).astype(np.uint8)
    else:
        magnitude = magnitude.astype(np.uint8)
    
    # Apply threshold
    magnitude = np.where(magnitude > threshold, magnitude, 0)
    
    # Convert back to PIL Image
    return Image.fromarray(magnitude, mode='L')

def hed_edge_detection(img_gray, model_path=None):
    """
    Holistically-Nested Edge Detection (HED).
    Based on: https://github.com/s9xie/hed
    
    Args:
        img_gray: PIL Image in grayscale mode (will be converted to RGB)
        model_path: Path to pre-trained HED model weights (optional)
    
    Returns:
        PIL Image with detected edges
    
    Note: Requires PyTorch and a pre-trained HED model. Falls back to Sobel if unavailable.
    Supports multiple HED implementations:
        - hed-tensor package (if installed)
        - Custom PyTorch model (if model_path provided)
        - Falls back to enhanced Sobel if neither available
    """
    if not HED_AVAILABLE:
        print("Warning: PyTorch not available. Falling back to Sobel edge detection.")
        return sobel_edge_detection(img_gray)
    
    try:
        # Try using hed-tensor package first (if available)
        try:
            from hed_tensor import HED, detect_edges
            # Convert grayscale to RGB for HED
            if img_gray.mode != 'RGB':
                img_rgb = img_gray.convert('RGB')
            else:
                img_rgb = img_gray
            
            # Save temporarily to use with hed-tensor (it expects file path)
            import tempfile
            import os
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                img_rgb.save(tmp.name)
                tmp_path = tmp.name
            
            try:
                model = HED()
                edges = detect_edges(tmp_path, model=model)
                os.unlink(tmp_path)
                
                # Convert to PIL Image if needed
                if isinstance(edges, np.ndarray):
                    if edges.max() <= 1.0:
                        edges = (edges * 255).astype(np.uint8)
                    else:
                        edges = edges.astype(np.uint8)
                    return Image.fromarray(edges, mode='L')
                return edges
            except Exception as e:
                os.unlink(tmp_path)
                raise e
        except ImportError:
            pass  # hed-tensor not available, try custom model
        
        # Try loading custom PyTorch model if model_path provided
        if model_path and os.path.exists(model_path):
            # Convert grayscale to RGB for HED
            if img_gray.mode != 'RGB':
                img_rgb = img_gray.convert('RGB')
            else:
                img_rgb = img_gray
            
            # Load model and run inference
            # Note: This is a placeholder - you'll need to implement the actual HED model class
            # based on the architecture from https://github.com/s9xie/hed
            model = torch.load(model_path, map_location='cpu')
            model.eval()
            
            # Preprocess image
            transform = transforms.Compose([
                transforms.Resize((256, 256)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])
            
            input_tensor = transform(img_rgb).unsqueeze(0)
            
            with torch.no_grad():
                output = model(input_tensor)
                # HED outputs multiple side outputs, typically we use the fused output
                if isinstance(output, (list, tuple)):
                    edges = output[-1]  # Use the final fused output
                else:
                    edges = output
                
                # Convert to numpy
                edges = edges.squeeze().cpu().numpy()
                if edges.ndim == 3:
                    edges = edges[0]  # Take first channel if multi-channel
                
                # Normalize to 0-255
                if edges.max() <= 1.0:
                    edges = (edges * 255).astype(np.uint8)
                else:
                    edges = (edges / edges.max() * 255).astype(np.uint8)
            
            # Resize back to original size
            edges_img = Image.fromarray(edges, mode='L')
            edges_img = edges_img.resize(img_gray.size, Image.Resampling.LANCZOS)
            return edges_img
        
        # Fallback: Use enhanced Sobel as approximation
        print("Warning: HED model not available. Using enhanced Sobel as approximation.")
        if img_gray.mode != 'RGB':
            img_rgb = img_gray.convert('RGB')
        else:
            img_rgb = img_gray
        return sobel_edge_detection(img_rgb.convert('L'), threshold=30)
        
    except Exception as e:
        print(f"Error in HED edge detection: {e}. Falling back to Sobel.")
        return sobel_edge_detection(img_gray)

def yolo_segmentation(img, model_path=None, conf=0.25, return_mask=False):
    """
    YOLO11n segmentation to extract object boundaries as edges.
    
    Args:
        img: PIL Image (can be grayscale or RGB)
        model_path: Path to YOLO model file (default: server/static/models/yolo11n-seg.pt)
        conf: Confidence threshold for detections (0.0-1.0). Default 0.25.
              Lower values detect more objects but may include false positives.
        return_mask: If True, also returns the combined mask image for preview.
    
    Returns:
        PIL Image with detected edges from segmentation masks
        If return_mask=True, returns tuple: (edges_image, mask_image)
    """
    if not YOLO_AVAILABLE:
        print("Warning: Ultralytics YOLO not available. Falling back to Sobel edge detection.")
        if img.mode != 'L':
            img = img.convert('L')
        return sobel_edge_detection(img, threshold=50)
    
    try:
        # Convert to RGB if needed (YOLO expects RGB)
        if img.mode != 'RGB':
            img_rgb = img.convert('RGB')
        else:
            img_rgb = img
        
        # Default model path
        if model_path is None:
            # Try to find the model relative to this file
            current_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(current_dir, 'static', 'models', 'yolo11n-seg.pt')
            if not os.path.exists(model_path):
                # Try alternative path
                model_path = 'static/models/yolo11n-seg.pt'
        
        if not os.path.exists(model_path):
            print(f"Warning: YOLO model not found at {model_path}. Falling back to Sobel.")
            return sobel_edge_detection(img_rgb.convert('L'), threshold=50)
        
        # Load YOLO model
        model = YOLO(model_path)
        
        # Run inference with confidence threshold
        # conf parameter controls minimum confidence for detections (0.0-1.0)
        # Lower values = more detections (higher recall, more false positives)
        # Higher values = fewer but more confident detections (higher precision)
        results = model(img_rgb, conf=conf, verbose=False)
        
        # Get image dimensions
        width, height = img_rgb.size
        
        # Create a binary mask for all detected objects
        combined_mask = np.zeros((height, width), dtype=np.uint8)
        
        num_detections = 0
        num_masks_processed = 0
        
        # Process each result
        for result in results:
            # Check if there are any detections at all
            if hasattr(result, 'boxes') and result.boxes is not None:
                num_detections = len(result.boxes)
                print(f"YOLO found {num_detections} detections")
            
            # Check for masks
            if result.masks is not None:
                print(f"YOLO masks found: {result.masks is not None}")
                
                # Access masks data
                masks_data = result.masks.data
                
                if masks_data is not None:
                    try:
                        # Get masks in matrix format (num_objects x H x W)
                        if hasattr(masks_data, 'cpu'):
                            masks = masks_data.cpu().numpy()
                        else:
                            masks = np.array(masks_data)
                        
                        print(f"Mask shape: {masks.shape}, dtype: {masks.dtype}")
                        
                        # Handle different mask formats
                        if masks.ndim == 2:
                            # Single mask
                            masks = masks[np.newaxis, :, :]
                        
                        # Combine all masks
                        for i, mask in enumerate(masks):
                            num_masks_processed += 1
                            print(f"Processing mask {i+1}/{len(masks)}, shape: {mask.shape}, min: {mask.min()}, max: {mask.max()}")
                            
                            # Normalize mask values to 0-1 range if needed
                            if mask.max() > 1.0:
                                mask = mask / 255.0
                            
                            # Resize mask to image dimensions if needed
                            if mask.shape != (height, width):
                                # Convert mask to PIL Image for resizing
                                mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode='L')
                                mask_img = mask_img.resize((width, height), Image.Resampling.LANCZOS)
                                mask = np.array(mask_img) > 127
                            else:
                                mask = mask > 0.5
                            
                            combined_mask[mask] = 255
                            print(f"Mask {i+1} added, combined_mask now has {np.sum(combined_mask > 0)} pixels")
                    except Exception as e:
                        print(f"Warning: Error processing YOLO masks: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
            else:
                print("No masks found in YOLO results")
                # If no masks but we have boxes, we could use bounding boxes as edges
                if hasattr(result, 'boxes') and result.boxes is not None and len(result.boxes) > 0:
                    print(f"Found {len(result.boxes)} boxes, using bounding boxes as edges")
                    # Draw bounding boxes as edges
                    boxes = result.boxes
                    for box in boxes:
                        # Get box coordinates (x1, y1, x2, y2)
                        if hasattr(box, 'xyxy'):
                            coords = box.xyxy[0].cpu().numpy() if hasattr(box.xyxy[0], 'cpu') else box.xyxy[0]
                        elif hasattr(box, 'xywh'):
                            # Convert center-width-height to x1-y1-x2-y2
                            xywh = box.xywh[0].cpu().numpy() if hasattr(box.xywh[0], 'cpu') else box.xywh[0]
                            x, y, w, h = xywh
                            coords = [x - w/2, y - h/2, x + w/2, y + h/2]
                        else:
                            continue
                        
                        x1, y1, x2, y2 = map(int, coords)
                        # Draw rectangle edges
                        combined_mask[max(0, y1-1):min(height, y1+1), max(0, x1):min(width, x2)] = 255  # top
                        combined_mask[max(0, y2-1):min(height, y2+1), max(0, x1):min(width, x2)] = 255  # bottom
                        combined_mask[max(0, y1):min(height, y2), max(0, x1-1):min(width, x1+1)] = 255  # left
                        combined_mask[max(0, y1):min(height, y2), max(0, x2-1):min(width, x2+1)] = 255  # right
        
        print(f"Total masks processed: {num_masks_processed}, combined_mask pixels: {np.sum(combined_mask > 0)}")
        
        # If no detections at all, fall back to regular edge detection
        if np.sum(combined_mask) == 0:
            print("No YOLO detections found, falling back to Sobel edge detection")
            return sobel_edge_detection(img_rgb.convert('L'), threshold=50)
        
        # Extract edges from the combined mask using morphological operations
        # We'll use edge detection on the mask to get clean boundaries
        if SCIPY_AVAILABLE:
            # Use morphological gradient to get edges
            from scipy import ndimage
            # Create a structuring element
            struct = np.ones((3, 3), dtype=np.uint8)
            # Dilate and erode to get edges
            dilated = ndimage.binary_dilation(combined_mask > 0, structure=struct)
            eroded = ndimage.binary_erosion(combined_mask > 0, structure=struct)
            edges = (dilated ^ eroded).astype(np.uint8) * 255
        else:
            # Fallback: use simple edge detection
            # Convert mask to PIL Image and use FIND_EDGES filter
            mask_img = Image.fromarray(combined_mask, mode='L')
            edges = mask_img.filter(ImageFilter.FIND_EDGES)
            edges = ImageOps.autocontrast(edges)
            edges = np.array(edges)
        
        # Convert to PIL Image
        edges_img = Image.fromarray(edges, mode='L')
        
        if return_mask:
            # Return both edges and mask for preview
            mask_img = Image.fromarray(combined_mask, mode='L')
            return edges_img, mask_img
        return edges_img
        
    except Exception as e:
        print(f"Error in YOLO segmentation: {e}. Falling back to Sobel.")
        import traceback
        traceback.print_exc()
        if img.mode != 'L':
            img = img.convert('L')
        fallback_edges = sobel_edge_detection(img, threshold=50)
        if return_mask:
            # Return empty mask on error
            empty_mask = Image.new('L', img.size, 0)
            return fallback_edges, empty_mask
        return fallback_edges

def generate_hatch_lines(dwg, img, width, height, angle_deg, spacing, threshold, stroke_width=1.0, color='black', min_len=0, smoothing=0.0, smooth_method='bezier'):
    """
    Generates hatching lines at a specific angle for pixels darker than threshold.
    """
    if angle_deg >= 180: angle_deg -= 180
    if angle_deg < 0: angle_deg += 180

    rad = math.radians(angle_deg)
    
    # Calculate bounding box to cover the rotation
    corners = [(0, 0), (width, 0), (width, height), (0, height)]
    
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)
    
    rotated_corners = []
    for x, y in corners:
        rx = x * cos_a - y * sin_a
        ry = x * sin_a + y * cos_a
        rotated_corners.append((rx, ry))
        
    min_ry = min(p[1] for p in rotated_corners)
    max_ry = max(p[1] for p in rotated_corners)
    
    min_rx = min(p[0] for p in rotated_corners)
    max_rx = max(p[0] for p in rotated_corners)
    
    # Group for this layer
    group = dwg.g(stroke=color, stroke_width=stroke_width, fill='none', stroke_linecap='round')
    
    # Step through lines
    y_step = spacing
    current_ry = min_ry
    
    # Optimization: sampling step along the line
    sample_step = 2.0 
    
    while current_ry <= max_ry:
        points = []
        current_rx = min_rx
        
        current_segment = []
        
        while current_rx <= max_rx:
            px = current_rx * cos_a + current_ry * sin_a
            py = -current_rx * sin_a + current_ry * cos_a
            
            # Check bounds
            if 0 <= px < width and 0 <= py < height:
                # Check brightness
                try:
                    # Bilinear or nearest neighbor sample
                    val = get_brightness(img.getpixel((int(px), int(py))))
                    
                    if val < threshold:
                        # Dark enough to draw
                        wx, wy = apply_wobble(px, py, amount=0.5)
                        current_segment.append((wx, wy))
                    else:
                        # Too bright, cut the line
                        if len(current_segment) > 1:
                            # Calculate approximate length
                            segment_len = 0
                            for i in range(len(current_segment) - 1):
                                dx = current_segment[i+1][0] - current_segment[i][0]
                                dy = current_segment[i+1][1] - current_segment[i][1]
                                segment_len += math.sqrt(dx*dx + dy*dy)
                            
                            # Filter by min length
                            if segment_len >= min_len:
                                # Apply smoothing if enabled
                                if smoothing > 0.0:
                                    path_data = smooth_path_segment(current_segment, smoothing=smoothing, method=smooth_method)
                                else:
                                    path_data = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in current_segment)
                                
                                if path_data:
                                    group.add(dwg.path(d=path_data))
                        current_segment = []
                except IndexError:
                    pass
            else:
                 if len(current_segment) > 1:
                    # Calculate approximate length
                    segment_len = 0
                    for i in range(len(current_segment) - 1):
                        dx = current_segment[i+1][0] - current_segment[i][0]
                        dy = current_segment[i+1][1] - current_segment[i][1]
                        segment_len += math.sqrt(dx*dx + dy*dy)
                    
                    # Filter by min length
                    if segment_len >= min_len:
                        # Apply smoothing if enabled
                        if smoothing > 0.0:
                            path_data = smooth_path_segment(current_segment, smoothing=smoothing, method=smooth_method)
                        else:
                            path_data = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in current_segment)
                        
                        if path_data:
                            group.add(dwg.path(d=path_data))
                 current_segment = []
            
            current_rx += sample_step
            
        # Finish line
        if len(current_segment) > 1:
            # Calculate approximate length
            segment_len = 0
            for i in range(len(current_segment) - 1):
                dx = current_segment[i+1][0] - current_segment[i][0]
                dy = current_segment[i+1][1] - current_segment[i][1]
                segment_len += math.sqrt(dx*dx + dy*dy)
            
            # Filter by min length
            if segment_len >= min_len:
                # Apply smoothing if enabled
                if smoothing > 0.0:
                    path_data = smooth_path_segment(current_segment, smoothing=smoothing, method=smooth_method)
                else:
                    path_data = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in current_segment)
                
                if path_data:
                    group.add(dwg.path(d=path_data))
            
        current_ry += y_step
        
    return group

def trace_edges(dwg, img_gray, width, height, threshold=50, stroke_width=1.0, min_len=10, algo='default', smoothing=0.0, smooth_method='bezier', border_margin=5, join_radius=0):
    """
    Finds edges and traces them with short strokes.
    Supports filtering by minimum segment length.
    Algorithms: 
        - 'default' (Pillow FIND_EDGES)
        - 'canny' (approximation)
        - 'sobel' (Sobel operator - https://github.com/ErykBrol/Sobel-Edge-Detector)
        - 'hed' (Holistically-Nested Edge Detection - https://github.com/s9xie/hed)
        - 'yolo' (YOLO11n segmentation - extracts edges from segmentation masks)
    
    Args:
        border_margin: Pixels to ignore from each border (prevents detecting image borders as edges)
        join_radius: Distance in pixels to join endpoints of nearby paths (0 disables joining)
    """
    edges = None
    
    if algo == 'canny':
        # Simple Canny-like approximation using Pillow (since no cv2)
        # 1. Blur to remove noise
        img_blur = img_gray.filter(ImageFilter.GaussianBlur(2))
        # 2. Find Edges
        edges = img_blur.filter(ImageFilter.FIND_EDGES)
        # 3. Thresholding (strong edges only)
        edges = edges.point(lambda p: 255 if p > threshold else 0)
    elif algo == 'sobel':
        # Sobel edge detection
        edges = sobel_edge_detection(img_gray, threshold=threshold)
        edges = ImageOps.autocontrast(edges)
    elif algo == 'hed':
        # Holistically-Nested Edge Detection
        edges = hed_edge_detection(img_gray)
        # Apply threshold
        edges = edges.point(lambda p: 255 if p > threshold else 0)
    elif algo == 'yolo':
        # YOLO11n segmentation - extract edges from segmentation masks
        # Convert threshold (0-255) to confidence (0.0-1.0) for YOLO
        # threshold=50 -> conf=0.196, threshold=128 -> conf=0.5, threshold=200 -> conf=0.784
        conf = max(0.001, min(1.0, threshold / 255.0))
        print(f"Using YOLO with confidence threshold: {conf:.3f} (from edge threshold: {threshold})")
        # Note: return_mask is handled at app.py level, not here
        edges = yolo_segmentation(img_gray, conf=conf, return_mask=False)
        # Apply threshold (YOLO already produces binary-like edges, but threshold can refine)
        edges = edges.point(lambda p: 255 if p > threshold else 0)
    else:
        # Default FIND_EDGES
        edges = img_gray.filter(ImageFilter.FIND_EDGES)
        edges = ImageOps.autocontrast(edges)
    
    group = dwg.g(stroke='black', stroke_width=stroke_width, fill='none')
    segments = []

    # Simple greedy tracer with min length filtering
    visited = set()
    pixels = edges.load()
    
    # Only trace if pixel value > 50 (or threshold for non-binary)
    min_val = 50
    if algo == 'canny':
        min_val = 128
    elif algo == 'sobel':
        min_val = threshold // 2  # Sobel produces gradient magnitudes
    elif algo == 'hed':
        min_val = threshold // 2  # HED produces probability maps
    elif algo == 'yolo':
        min_val = threshold // 2  # YOLO produces binary-like edges
        
    all_paths = []
    
    # Border margin to ignore edges at image borders (now configurable via parameter)
    # Scan step
    step = 2
    
    for y in range(0, height, step): 
        for x in range(0, width, step):
            # Skip pixels near borders
            if x < border_margin or x >= width - border_margin or \
               y < border_margin or y >= height - border_margin:
                continue
                
            if (x,y) in visited:
                continue
            
            val = pixels[x, y]
            if val > min_val:
                # Start a trace
                segment = []
                curr_x, curr_y = x, y
                
                # Walk for a bit
                # Increased max length for better continuity check
                for _ in range(200): 
                    if not (0 <= curr_x < width and 0 <= curr_y < height):
                        break
                    
                    visited.add((curr_x, curr_y))
                    wx, wy = apply_wobble(curr_x, curr_y, amount=0.5)
                    segment.append((wx, wy))
                    
                    # Find best neighbor
                    best_n = None
                    max_v = -1
                    
                    # 3x3 neighborhood
                    found_next = False
                    for dy in [-1, 0, 1]:
                        for dx in [-1, 0, 1]:
                            if dx == 0 and dy == 0: continue
                            nx, ny = curr_x + dx, curr_y + dy
                            
                            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                                n_val = pixels[nx, ny]
                                if n_val > min_val and n_val > max_v:
                                    max_v = n_val
                                    best_n = (nx, ny)
                                    found_next = True
                    
                    if found_next and best_n:
                        curr_x, curr_y = best_n
                    else:
                        break
                
                # Filter by length
                # Estimate length by number of points * step approx
                # Or just number of points for simplicity
                if len(segment) * 2 > min_len:
                    segments.append(segment)

    def _dist(p1, p2):
        dx = p1[0] - p2[0]
        dy = p1[1] - p2[1]
        return math.hypot(dx, dy)

    def join_segments(seg_list, radius):
        if radius <= 0 or len(seg_list) < 2:
            return seg_list
        joined = list(seg_list)
        changed = True
        while changed and len(joined) > 1:
            changed = False
            for i in range(len(joined)):
                if changed:
                    break
                for j in range(i + 1, len(joined)):
                    a = joined[i]
                    b = joined[j]

                    options = [
                        (_dist(a[-1], b[0]), 'a_end_b_start'),
                        (_dist(a[-1], b[-1]), 'a_end_b_end'),
                        (_dist(a[0], b[0]), 'a_start_b_start'),
                        (_dist(a[0], b[-1]), 'a_start_b_end'),
                    ]
                    best_dist, key = min(options, key=lambda x: x[0])
                    if best_dist <= radius:
                        if key == 'a_end_b_start':
                            merged = a + b
                        elif key == 'a_end_b_end':
                            merged = a + list(reversed(b))
                        elif key == 'a_start_b_start':
                            merged = list(reversed(b)) + a
                        else:  # a_start_b_end
                            merged = b + a
                        # Replace two segments with merged
                        joined.pop(j)
                        joined.pop(i)
                        joined.append(merged)
                        changed = True
                        break
        return joined

    segments = join_segments(segments, join_radius)

    for segment in segments:
        path_data = smooth_path_segment(segment, smoothing=smoothing, method=smooth_method)
        if path_data:
            group.add(dwg.path(d=path_data))

    return group

def main():
    pass # Main logic moved to app.py

if __name__ == "__main__":
    main()
