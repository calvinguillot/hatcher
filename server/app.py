import os
import time
from flask import Flask, render_template, request, send_from_directory, jsonify
from PIL import Image, ImageEnhance
import svgwrite
import stylize  # Import your existing module
import traceback

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
        
        # Edge settings
        edge_thresh = int(data.get('edge_thresh', 50))
        edge_stroke = float(data.get('edge_stroke', 1.0))
        edge_min_len = int(data.get('edge_min_len', 10))
        edge_algo = data.get('edge_algo', 'default')
        edge_smoothing = float(data.get('edge_smoothing', 0.0))
        edge_smooth_method = data.get('edge_smooth_method', 'bezier')
        edge_border_margin = int(data.get('edge_border_margin', 5))
        
        hatch1_thresh = int(data.get('hatch1_thresh', 200))
        hatch2_thresh = int(data.get('hatch2_thresh', 140))
        hatch3_thresh = int(data.get('hatch3_thresh', 80))
        
        hatch1_angle = int(data.get('hatch1_angle', 45))
        hatch2_angle = int(data.get('hatch2_angle', 135))
        hatch3_angle = int(data.get('hatch3_angle', 90))
        
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
        
        # Create SVG
        dwg = svgwrite.Drawing(output_path, size=(width, height), profile='tiny')
        dwg.viewbox(0, 0, width, height)
        
        # 1. Edge Layer
        print("Tracing edges...")
        edge_layer = stylize.trace_edges(dwg, gray_img, width, height, 
                                       threshold=edge_thresh, 
                                       stroke_width=edge_stroke,
                                       min_len=edge_min_len,
                                       algo=edge_algo,
                                       smoothing=edge_smoothing,
                                       smooth_method=edge_smooth_method,
                                       border_margin=edge_border_margin)
        edge_layer['id'] = 'layer-edges'
        
        # 2. Hatching Layers
        if hatch_enabled:
            print("Generating hatching layers...")
            
            # Hatching Group
            hatching_group = dwg.g(id='layer-hatching')
            
            # Layer 1
            hatch1 = stylize.generate_hatch_lines(dwg, gray_img, width, height, 
                                        angle_deg=hatch1_angle, spacing=hatch_spacing, threshold=hatch1_thresh, 
                                        stroke_width=hatch_stroke, min_len=hatch_min_len, 
                                        smoothing=hatch_smoothing, smooth_method=hatch_smooth_method)
            hatching_group.add(hatch1)
            
            # Layer 2
            hatch2 = stylize.generate_hatch_lines(dwg, gray_img, width, height, 
                                        angle_deg=hatch2_angle, spacing=hatch_spacing, threshold=hatch2_thresh, 
                                        stroke_width=hatch_stroke, min_len=hatch_min_len, 
                                        smoothing=hatch_smoothing, smooth_method=hatch_smooth_method)
            hatching_group.add(hatch2)
            
            # Layer 3
            # Layer 3 usually denser, maybe scale spacing? Or just use same spacing for simplicity/consistency as requested.
            # The prompt implies a single control for separation.
            # Previous code had spacing=5 for L1/L2 and spacing=4 for L3.
            # I will apply the multiplier or offset if needed, but for now strict user control is better.
            # Let's maybe make L3 slightly denser relative to the setting? 
            # Or just use the setting directly. "control the separion of the lines". Implies direct control.
            # I'll use the raw value.
            hatch3 = stylize.generate_hatch_lines(dwg, gray_img, width, height, 
                                        angle_deg=hatch3_angle, spacing=max(1, hatch_spacing * 0.8), threshold=hatch3_thresh, 
                                        stroke_width=hatch_stroke, min_len=hatch_min_len, 
                                        smoothing=hatch_smoothing, smooth_method=hatch_smooth_method)
            hatching_group.add(hatch3)
            
            dwg.add(hatching_group)
        
        # Add edges on top
        dwg.add(edge_layer)
        
        dwg.save()
        
        return jsonify({
            'success': True,
            'url': f"/static/output/{output_filename}",
            'download_name': output_filename
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)

