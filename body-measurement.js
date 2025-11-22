// Body Measurement System for PoseAI
class BodyMeasurement {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.poseDetector = null;
        this.cameraStream = null;
        this.isDetecting = false;
        
        // Measurement constants (similar to Python script)
        this.KNOWN_HAND_WIDTH = 8.0; // cm - average hand width
        this.FOCAL_LENGTH = 500;
        this.scaleCmPerPixel = null;
        this.isCalibrated = false;
        
        // Measurement data
        this.currentMeasurements = {
            chest: null,
            leftBicep: null,
            rightBicep: null
        };
        
        this.measurementHistory = [];
        this.calibrationFrames = [];
        
        this.init();
    }

    async init() {
        this.canvas = document.getElementById('pose-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.video = document.getElementById('video-element');
        
        // Initialize pose detection
        await this.initializePoseDetection();
        
        // Load saved measurements
        this.loadMeasurementHistory();
    }

    async initializePoseDetection() {
        try {
            const detectorConfig = {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
                enableSmoothing: true,
            };
            
            this.poseDetector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                detectorConfig
            );
            
            this.updateStatus('AI model loaded', 'ready');
        } catch (error) {
            console.error('Error loading pose detection:', error);
            this.updateStatus('AI model loading failed', 'error');
        }
    }

    updateStatus(message, status = 'ready') {
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        
        statusIndicator.className = `status-indicator status-${status}`;
        statusText.textContent = message;
    }

    updateCalibrationStatus(status) {
        document.getElementById('calibration-status').textContent = status;
    }

    updateScaleValue(value) {
        document.getElementById('scale-value').textContent = value;
    }

    async startCamera() {
        try {
            // Get camera stream
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: 640, 
                    height: 480,
                    facingMode: 'user'
                } 
            });
            
            this.cameraStream = stream;
            this.video.srcObject = stream;
            this.video.play();
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => resolve();
            });
            
            this.isDetecting = true;
            this.detectPose();
            
            // Update UI
            document.getElementById('start-camera-btn').disabled = true;
            document.getElementById('calibrate-btn').disabled = false;
            document.getElementById('stop-camera-btn').disabled = false;
            
            this.updateStatus('Camera started', 'ready');
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('Camera access denied', 'error');
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        this.isDetecting = false;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update UI
        document.getElementById('start-camera-btn').disabled = false;
        document.getElementById('calibrate-btn').disabled = true;
        document.getElementById('measure-btn').disabled = true;
        document.getElementById('stop-camera-btn').disabled = true;
        
        this.updateStatus('Camera stopped', 'ready');
    }

    async detectPose() {
        if (!this.isDetecting || !this.poseDetector || !this.video) return;
        
        const poses = await this.poseDetector.estimatePoses(this.video);
        
        // Clear canvas and draw video
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(this.video, -this.canvas.width, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        if (poses.length > 0) {
            this.drawPose(poses[0]);
            
            if (this.isCalibrating) {
                this.calibrateWithHand(poses[0]);
            } else if (this.isCalibrated) {
                this.measurementsWithPose(poses[0]);
            }
        }
        
        // Continue detection
        requestAnimationFrame(() => this.detectPose());
    }

    drawPose(pose) {
        const keypoints = pose.keypoints;
        
        // Draw keypoints
        keypoints.forEach(keypoint => {
            if (keypoint.score > 0.3) {
                this.ctx.beginPath();
                this.ctx.arc(keypoint.x, keypoint.y, 5, 0, 2 * Math.PI);
                this.ctx.fillStyle = '#10b981';
                this.ctx.fill();
                this.ctx.strokeStyle = '#065f46';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
        });
        
        // Draw skeleton
        this.drawSkeleton(keypoints);
    }

    drawSkeleton(keypoints) {
        const connections = [
            [5, 7], [7, 9],   // Left arm
            [6, 8], [8, 10],  // Right arm
            [5, 6],           // Shoulders
            [5, 11], [6, 12], // Shoulders to hips
            [11, 12],         // Hips
            [11, 13], [13, 15], // Left leg
            [12, 14], [14, 16]  // Right leg
        ];
        
        connections.forEach(([start, end]) => {
            const startPoint = keypoints[start];
            const endPoint = keypoints[end];
            
            if (startPoint.score > 0.3 && endPoint.score > 0.3) {
                this.ctx.beginPath();
                this.ctx.moveTo(startPoint.x, startPoint.y);
                this.ctx.lineTo(endPoint.x, endPoint.y);
                this.ctx.strokeStyle = '#10b981';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
        });
    }

    async calibrateWithHand(pose) {
        // Look for hand keypoints (MoveNet doesn't have hand tracking, so we'll use a different approach)
        // For calibration, we'll detect when both arms are visible and extended
        const leftShoulder = pose.keypoints[5];
        const rightShoulder = pose.keypoints[6];
        const leftElbow = pose.keypoints[7];
        const rightElbow = pose.keypoints[8];
        const leftWrist = pose.keypoints[9];
        const rightWrist = pose.keypoints[10];
        
        if (leftShoulder.score > 0.5 && rightShoulder.score > 0.5 && 
            leftWrist.score > 0.5 && rightWrist.score > 0.5) {
            
            // Calculate shoulder width as reference (approximately 40cm for average adult)
            const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
            
            if (shoulderWidth > 0) {
                // Use shoulder width as calibration reference
                this.scaleCmPerPixel = 40.0 / shoulderWidth; // Average shoulder width ~40cm
                
                // Collect multiple calibration frames for accuracy
                this.calibrationFrames.push(this.scaleCmPerPixel);
                
                if (this.calibrationFrames.length >= 10) {
                    // Average the calibration values
                    this.scaleCmPerPixel = this.calibrationFrames.reduce((a, b) => a + b) / this.calibrationFrames.length;
                    this.isCalibrated = true;
                    this.isCalibrating = false;
                    
                    this.updateCalibrationStatus('Calibrated');
                    this.updateScaleValue(`${this.scaleCmPerPixel.toFixed(4)} cm/px`);
                    this.updateStatus('Calibration complete', 'ready');
                    
                    // Enable measure button
                    document.getElementById('measure-btn').disabled = false;
                    document.getElementById('calibrate-btn').disabled = true;
                    
                    // Hide calibration overlay
                    document.getElementById('calibration-overlay').classList.add('hidden');
                    
                    this.calibrationFrames = [];
                }
            }
        }
    }

    measurementsWithPose(pose) {
        const keypoints = pose.keypoints;
        
        // Get key points for measurements
        const leftShoulder = keypoints[5];
        const rightShoulder = keypoints[6];
        const leftElbow = keypoints[7];
        const rightElbow = keypoints[8];
        
        if (leftShoulder.score > 0.5 && rightShoulder.score > 0.5) {
            // Calculate chest width (shoulder width)
            const chestWidth = Math.abs(rightShoulder.x - leftShoulder.x);
            this.currentMeasurements.chest = chestWidth * this.scaleCmPerPixel;
            
            // Draw measurement line for chest
            this.drawMeasurementLine(leftShoulder, rightShoulder, '#3b82f6');
        }
        
        if (leftShoulder.score > 0.5 && leftElbow.score > 0.5) {
            // Calculate left bicep length
            const leftBicepLength = Math.sqrt(
                Math.pow(leftElbow.x - leftShoulder.x, 2) + 
                Math.pow(leftElbow.y - leftShoulder.y, 2)
            );
            this.currentMeasurements.leftBicep = leftBicepLength * this.scaleCmPerPixel;
            
            // Draw measurement line for left bicep
            this.drawMeasurementLine(leftShoulder, leftElbow, '#10b981');
        }
        
        if (rightShoulder.score > 0.5 && rightElbow.score > 0.5) {
            // Calculate right bicep length
            const rightBicepLength = Math.sqrt(
                Math.pow(rightElbow.x - rightShoulder.x, 2) + 
                Math.pow(rightElbow.y - rightShoulder.y, 2)
            );
            this.currentMeasurements.rightBicep = rightBicepLength * this.scaleCmPerPixel;
            
            // Draw measurement line for right bicep
            this.drawMeasurementLine(rightShoulder, rightElbow, '#8b5cf6');
        }
    }

    drawMeasurementLine(point1, point2, color) {
        this.ctx.beginPath();
        this.ctx.moveTo(point1.x, point1.y);
        this.ctx.lineTo(point2.x, point2.y);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Draw endpoints
        [point1, point2].forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
            this.ctx.fillStyle = color;
            this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
    }

    async startCalibration() {
        if (!this.isDetecting) {
            this.updateStatus('Please start camera first', 'error');
            return;
        }
        
        this.isCalibrating = true;
        this.calibrationFrames = [];
        
        // Show calibration overlay
        document.getElementById('calibration-overlay').classList.remove('hidden');
        this.updateCalibrationStatus('Calibrating...');
        this.updateStatus('Stand with arms extended for calibration', 'calibrating');
    }

    takeMeasurement() {
        if (!this.isCalibrated) {
            this.updateStatus('Please calibrate first', 'error');
            return;
        }
        
        this.updateStatus('Taking measurements...', 'measuring');
        
        // Update display with current measurements
        if (this.currentMeasurements.chest) {
            document.getElementById('chest-measurement').textContent = 
                `${this.currentMeasurements.chest.toFixed(1)} cm`;
        }
        
        if (this.currentMeasurements.leftBicep) {
            document.getElementById('left-bicep-measurement').textContent = 
                `${this.currentMeasurements.leftBicep.toFixed(1)} cm`;
        }
        
        if (this.currentMeasurements.rightBicep) {
            document.getElementById('right-bicep-measurement').textContent = 
                `${this.currentMeasurements.rightBicep.toFixed(1)} cm`;
        }
        
        this.updateStatus('Measurements complete', 'ready');
        
        // Add to history
        this.addToHistory();
    }

    addToHistory() {
        const measurement = {
            timestamp: new Date().toISOString(),
            chest: this.currentMeasurements.chest,
            leftBicep: this.currentMeasurements.leftBicep,
            rightBicep: this.currentMeasurements.rightBicep
        };
        
        this.measurementHistory.unshift(measurement);
        
        // Keep only last 10 measurements
        if (this.measurementHistory.length > 10) {
            this.measurementHistory.pop();
        }
        
        this.updateHistoryDisplay();
        this.saveMeasurementHistory();
    }

    updateHistoryDisplay() {
        const historyContainer = document.getElementById('measurement-history');
        
        if (this.measurementHistory.length === 0) {
            historyContainer.innerHTML = '<p class="text-gray-400 text-sm">No measurements yet</p>';
            return;
        }
        
        historyContainer.innerHTML = this.measurementHistory.map((measurement, index) => {
            const date = new Date(measurement.timestamp);
            const timeString = date.toLocaleTimeString();
            
            return `
                <div class="glassmorphism p-3 rounded-lg">
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-300">${timeString}</span>
                        <div class="text-sm">
                            <span class="text-blue-400">C: ${measurement.chest?.toFixed(1) || '--'}cm</span>
                            <span class="text-green-400 ml-2">L: ${measurement.leftBicep?.toFixed(1) || '--'}cm</span>
                            <span class="text-purple-400 ml-2">R: ${measurement.rightBicep?.toFixed(1) || '--'}cm</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    saveMeasurementHistory() {
        localStorage.setItem('poseai_measurements', JSON.stringify(this.measurementHistory));
    }

    loadMeasurementHistory() {
        const saved = localStorage.getItem('poseai_measurements');
        if (saved) {
            try {
                this.measurementHistory = JSON.parse(saved);
                this.updateHistoryDisplay();
            } catch (error) {
                console.error('Error loading measurement history:', error);
            }
        }
    }

    async saveMeasurementsToServer() {
        if (!this.currentMeasurements.chest && !this.currentMeasurements.leftBicep && !this.currentMeasurements.rightBicep) {
            this.updateStatus('No measurements to save', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('poseai_token');
            if (!token) {
                this.updateStatus('Please login to save measurements', 'error');
                return;
            }
            
            const measurementData = {
                chest: this.currentMeasurements.chest,
                leftBicep: this.currentMeasurements.leftBicep,
                rightBicep: this.currentMeasurements.rightBicep,
                scaleCmPerPixel: this.scaleCmPerPixel,
                timestamp: new Date().toISOString()
            };
            
            const response = await fetch('/api/measurements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(measurementData)
            });
            
            if (response.ok) {
                this.updateStatus('Measurements saved successfully', 'ready');
                this.showNotification('Measurements saved to your profile!', 'success');
            } else {
                throw new Error('Failed to save measurements');
            }
            
        } catch (error) {
            console.error('Error saving measurements:', error);
            this.updateStatus('Failed to save measurements', 'error');
            this.showNotification('Failed to save measurements', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 ${
            type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' :
            type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
        } text-white`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize measurement system
let bodyMeasurement;

document.addEventListener('DOMContentLoaded', () => {
    bodyMeasurement = new BodyMeasurement();
});

// Global functions for HTML onclick handlers
function startMeasurementCamera() {
    if (bodyMeasurement) {
        bodyMeasurement.startCamera();
    }
}

function stopMeasurementCamera() {
    if (bodyMeasurement) {
        bodyMeasurement.stopCamera();
    }
}

function calibrateMeasurement() {
    if (bodyMeasurement) {
        bodyMeasurement.startCalibration();
    }
}

function takeMeasurement() {
    if (bodyMeasurement) {
        bodyMeasurement.takeMeasurement();
    }
}

function saveMeasurements() {
    if (bodyMeasurement) {
        bodyMeasurement.saveMeasurementsToServer();
    }
}
