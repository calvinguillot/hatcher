# Hatcher

**Hatcher** is a web-based application that converts images into SVG line art using advanced edge detection and hatching techniques. It's designed to create plotter-ready artwork from photographs or digital images.

## Features

- **Multiple Edge Detection Algorithms**
  - Standard gradient-based edge detection
  - Canny approximation (strong edges)
  - Sobel operator
  - HED (Holistically-Nested Edge Detection)
  - YOLO11n segmentation (object-based edge extraction)

- **Advanced Hatching System**
  - Multiple configurable hatching layers
  - Adjustable angle, spacing, and threshold per layer
  - Angle randomness and overshoot controls
  - Smoothing options (Bezier, Chaikin, Hermite, Sliding Average)

- **Image Processing**
  - Brightness and contrast adjustments
  - Image scaling and positioning on canvas
  - Multiple canvas presets (A4, A3, A2, A1, F-series sizes)
  - Custom canvas dimensions with DPI control

- **Interactive Web Interface**
  - Real-time preview of original, edges, hatching, and combined result
  - Synchronized zoom and pan across all views
  - Settings import/export functionality
  - Live parameter adjustment

## Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)

### Setup

1. Clone or download this repository

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   - **Windows (PowerShell):**
     ```powershell
     venv\Scripts\Activate.ps1
     ```
   - **Windows (Command Prompt):**
     ```cmd
     venv\Scripts\activate.bat
     ```
   - **Linux/Mac:**
     ```bash
     source venv/bin/activate
     ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Ensure the YOLO model is present:
   - The model file should be at `static/models/yolo11n-seg.pt`
   - If missing, it will be automatically downloaded on first use (requires internet connection)

## Usage

### Starting the Application

1. Activate your virtual environment (if not already active)

2. Run the Flask application:
   ```bash
   python app.py
   ```

3. Open your web browser and navigate to:
   ```
   http://localhost:5000
   ```

### Basic Workflow

1. **Load an Image**: Click "Load File" and select an image file
2. **Configure Canvas**: Set canvas dimensions and DPI, or choose a preset
3. **Adjust Image**: Position and scale the image on the canvas
4. **Configure Edges**: Enable/disable edge detection and adjust parameters
5. **Configure Hatching**: Add/remove hatching layers and adjust their properties
6. **Process**: Click "Redraw" to generate the SVG
7. **Download**: Click "Save SVG" to download the result

### Settings Management

- **Save Settings**: Export all current settings to a JSON file
- **Load Settings**: Import previously saved settings from a JSON file

## Project Structure

```
hatcher/
├── app.py                 # Flask web application
├── stylize.py             # Image processing and SVG generation
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── templates/
│   └── index.html        # Web interface
├── static/
│   ├── models/
│   │   ├── yolo11n-seg.pt        # YOLO segmentation model
│   │   └── canvas_presets.json   # Canvas size presets
│   ├── uploads/          # Uploaded images (created automatically)
│   └── output/           # Generated SVG files (created automatically)
└── venv/                 # Virtual environment (created during setup)
```

## Tips for Plotter/3D Printer Usage

### Gcode File Preparation

- Add `f6000` at the very first `G00` command of the Gcode file to set the feed rate

### Plotter/3D Printer Setup

1. **Home the plotter/3D printer first**
2. **Move 10mm up** from the home position before starting
3. This ensures proper clearance and prevents damage to the surface

### Converting SVG to Gcode

You'll need to use a tool to convert the generated SVG to Gcode. Popular options include:
- Inkscape with Gcode extensions
- Universal Gcode Sender
- Custom conversion scripts

## Configuration

### Canvas Presets

The application includes presets for:
- Standard paper sizes: A4, A3, A2, A1
- F-series sizes: F1 through F30

Custom presets can be added by editing `static/models/canvas_presets.json`.

### Edge Detection

- **Default**: Fast gradient-based detection, good for most images
- **Canny**: Strong edge detection, fewer false positives
- **Sobel**: Mathematical edge detection, good for technical drawings
- **HED**: Deep learning-based, requires PyTorch
- **YOLO**: Object segmentation, best for photos with distinct objects

### Hatching Layers

Each hatching layer can be configured with:
- **Threshold**: Brightness threshold (0-255, lower = darker areas)
- **Spacing**: Distance between lines in millimeters
- **Angle**: Line angle in degrees (0-180)
- **Angle Randomness**: Random variation in angle (0-10 degrees)
- **Overshoot**: Line extension factor (0 = none, 1 = twice as long)

## Dependencies

- **Flask**: Web framework
- **Pillow**: Image processing
- **svgwrite**: SVG generation
- **numpy**: Numerical operations
- **scipy**: Scientific computing (optional, for advanced edge detection)
- **ultralytics**: YOLO model support
- **torch/torchvision**: PyTorch (optional, for HED edge detection)

## Resources

- [How to Turn Your 3D Printer into a Plotter](https://urish.medium.com/how-to-turn-your-3d-printer-into-a-plotter-in-one-hour-d6fe14559f1a)

## Version

Current version: **v0.6.1**

## License

This project is provided as-is for personal and educational use.
