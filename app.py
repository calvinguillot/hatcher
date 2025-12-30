import os
import time
from flask import Flask, render_template, request, send_from_directory, jsonify
from PIL import Image, ImageEnhance
import svgwrite
import stylize  # Import your existing module
import traceback
import numpy as np

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['OUTPUT_FOLDER'] = 'static/output'

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        filename = f"{int(time.time())}_{file.filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'filename': filename, 'url': f"/static/uploads/{filename}"})

@app.route('/process', methods=['POST'])
def process_image():
    try:
        data = request.json
        filename = data.get('filename')
        
        # Parameters
        scale = float(data.get('scale', 0.5))
        brightness = float(data.get('brightness', 1.0))
        contrast = float(data.get('contrast', 1.0))
        
        # General settings
        hatch_stroke = float(data.get('hatch_stroke', 0.5))
        hatch_spacing = float(data.get('hatch_spacing', 5.0))
        hatch_enabled = data.get('hatch_enabled', True)
        hatch_min_len = float(data.get('hatch_min_len', 0.0))
        hatch_smoothing = float(data.get('hatch_smoothing', 0.0))
        hatch_smooth_method = data.get('hatch_smooth_method', 'bezier')
        hatch_join_ends = float(data.get('hatch_join_ends', 0.0))
        
        # Edge settings
        edge_enabled = data.get('edge_enabled', True)
        edge_thresh = int(data.get('edge_thresh', 50))
        edge_stroke = float(data.get('edge_stroke', 1.0))
        edge_min_len = int(data.get('edge_min_len', 10))
        edge_algo = data.get('edge_algo', 'default')
        edge_smoothing = float(data.get('edge_smoothing', 0.0))
        edge_smooth_method = data.get('edge_smooth_method', 'bezier')
        edge_border_margin = int(data.get('edge_border_margin', 5))
        edge_join_radius = float(data.get('edge_join_radius', 5.0))
        yolo_show_preview = data.get('yolo_show_preview', False)
        
        hatch1_thresh = int(data.get('hatch1_thresh', 200))
        hatch2_thresh = int(data.get('hatch2_thresh', 140))
        hatch3_thresh = int(data.get('hatch3_thresh', 80))
        
        hatch1_angle = int(data.get('hatch1_angle', 45))
        hatch2_angle = int(data.get('hatch2_angle', 135))
        hatch3_angle = int(data.get('hatch3_angle', 90))
        
        hatch1_angle_randomness = float(data.get('hatch1_angle_randomness', 0.0))
        hatch2_angle_randomness = float(data.get('hatch2_angle_randomness', 0.0))
        hatch3_angle_randomness = float(data.get('hatch3_angle_randomness', 0.0))
        
        hatch1_overshoot = float(data.get('hatch1_overshoot', 0.0))
        hatch2_overshoot = float(data.get('hatch2_overshoot', 0.0))
        hatch3_overshoot = float(data.get('hatch3_overshoot', 0.0))
        
        # Individual spacing for each layer (fallback to global hatch_spacing for backward compatibility)
        hatch1_spacing = float(data.get('hatch1_spacing', data.get('hatch_spacing', 5.0)))
        hatch2_spacing = float(data.get('hatch2_spacing', data.get('hatch_spacing', 5.0)))
        hatch3_spacing = float(data.get('hatch3_spacing', data.get('hatch_spacing', 5.0)))
        
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        output_filename = f"processed_{filename.rsplit('.', 1)[0]}.svg"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
        
        # Load and process image
        try:
            original_img = Image.open(input_path)
        except Exception as e:
            return jsonify({'error': f"Failed to load image: {str(e)}"}), 500

        # Resize if needed
        if scale != 1.0:
            w = int(original_img.width * scale)
            h = int(original_img.height * scale)
            original_img = original_img.resize((w, h), Image.Resampling.LANCZOS)
        
        # Apply brightness adjustment
        if brightness != 1.0:
            enhancer = ImageEnhance.Brightness(original_img)
            original_img = enhancer.enhance(brightness)
        
        # Apply contrast adjustment
        if contrast != 1.0:
            enhancer = ImageEnhance.Contrast(original_img)
            original_img = enhancer.enhance(contrast)
        
        width, height = original_img.size
        gray_img = original_img.convert("L")
        
        # Generate YOLO segmentation preview if requested
        segmentation_preview_b64 = None
        if edge_enabled and edge_algo == 'yolo' and yolo_show_preview:
            try:
                import base64
                from io import BytesIO
                # Convert threshold to confidence
                conf = max(0.001, min(1.0, edge_thresh / 255.0))
                # Get segmentation mask
                edges, mask = stylize.yolo_segmentation(gray_img, conf=conf, return_mask=True)
                # Create colored preview: convert mask to RGBA with colored overlay
                # Use a semi-transparent color overlay on the original image
                mask_rgba = Image.new('RGBA', (width, height), (0, 0, 0, 0))
                # Color the mask areas (e.g., green with 50% opacity)
                mask_array = np.array(mask)
                colored_mask = np.zeros((height, width, 4), dtype=np.uint8)
                colored_mask[mask_array > 0] = [0, 255, 0, 128]  # Green with 50% opacity
                mask_rgba = Image.fromarray(colored_mask, mode='RGBA')
                
                # Convert to base64
                buffer = BytesIO()
                mask_rgba.save(buffer, format='PNG')
                segmentation_preview_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                print("YOLO segmentation preview generated")
            except Exception as e:
                print(f"Error generating YOLO preview: {e}")
                import traceback
                traceback.print_exc()
        
        # Create SVG
        dwg = svgwrite.Drawing(output_path, size=(width, height), profile='tiny')
        dwg.viewbox(0, 0, width, height)
        
        # 1. Edge Layer
        edge_layer = None
        if edge_enabled:
            print("Tracing edges...")
            edge_layer = stylize.trace_edges(dwg, gray_img, width, height, 
                                           threshold=edge_thresh, 
                                           stroke_width=edge_stroke,
                                           min_len=edge_min_len,
                                           algo=edge_algo,
                                           smoothing=edge_smoothing,
                                           smooth_method=edge_smooth_method,
                                           border_margin=edge_border_margin,
                                           join_radius=edge_join_radius)
            edge_layer['id'] = 'layer-edges'
        
        # 2. Hatching Layers
        if hatch_enabled:
            print("Generating hatching layers...")
            
            # Hatching Group
            hatching_group = dwg.g(id='layer-hatching')
            
            # Layer 1
            hatch1 = stylize.generate_hatch_lines(dwg, gray_img, width, height, 
                                        angle_deg=hatch1_angle, spacing=hatch1_spacing, threshold=hatch1_thresh, 
                                        stroke_width=hatch_stroke, min_len=hatch_min_len, 
                                        smoothing=hatch_smoothing, smooth_method=hatch_smooth_method,
                                        join_ends_radius=hatch_join_ends,
                                        angle_randomness=hatch1_angle_randomness, overshoot=hatch1_overshoot)
            hatching_group.add(hatch1)
            
            # Layer 2
            hatch2 = stylize.generate_hatch_lines(dwg, gray_img, width, height, 
                                        angle_deg=hatch2_angle, spacing=hatch2_spacing, threshold=hatch2_thresh, 
                                        stroke_width=hatch_stroke, min_len=hatch_min_len, 
                                        smoothing=hatch_smoothing, smooth_method=hatch_smooth_method,
                                        join_ends_radius=hatch_join_ends,
                                        angle_randomness=hatch2_angle_randomness, overshoot=hatch2_overshoot)
            hatching_group.add(hatch2)
            
            # Layer 3
            hatch3 = stylize.generate_hatch_lines(dwg, gray_img, width, height, 
                                        angle_deg=hatch3_angle, spacing=hatch3_spacing, threshold=hatch3_thresh, 
                                        stroke_width=hatch_stroke, min_len=hatch_min_len, 
                                        smoothing=hatch_smoothing, smooth_method=hatch_smooth_method,
                                        join_ends_radius=hatch_join_ends,
                                        angle_randomness=hatch3_angle_randomness, overshoot=hatch3_overshoot)
            hatching_group.add(hatch3)
            
            dwg.add(hatching_group)
        
        # Add edges on top (if enabled)
        if edge_layer is not None:
            dwg.add(edge_layer)
        
        dwg.save()
        
        response_data = {
            'success': True,
            'url': f"/static/output/{output_filename}",
            'download_name': output_filename
        }
        
        # Add segmentation preview if available
        if segmentation_preview_b64:
            response_data['segmentation_preview'] = segmentation_preview_b64
        
        return jsonify(response_data)
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)

