// PoseAI Frontend Application with Pushup Calculator Integration
class PoseAI {
    constructor() {
        this.apiBase = 'http://localhost:5000/api';
        this.token = localStorage.getItem('poseai_token');
        this.user = null;
        this.workoutSession = null;
        this.poseDetector = null;
        
        // Payment System
        this.currentPlan = null;
        this.currentPaymentMethod = null;
        this.transactionId = null;
        this.qrCodeInstance = null;
        
        // Pushup Calculator Integration
        this.currentExercise = 'pushups';
        this.reps = 0;
        this.elbowAngle = 999;
        this.backAngle = 0;
        this.upPosition = false;
        this.downPosition = false;
        this.highlightBack = false;
        this.backWarningGiven = false;
        this.p5Instance = null;
        this.video = null;
        this.cameraStream = null;
        this.workoutTimer = null;
        this.workoutSeconds = 0;
        this.voiceFeedbackEnabled = true;
        
        // Skeleton edges for visualization
        this.edges = {
            '5,7': 'm',
            '7,9': 'm',
            '6,8': 'c',
            '8,10': 'c',
            '5,6': 'y',
            '5,11': 'm',
            '6,12': 'c',
            '11,12': 'y',
            '11,13': 'm',
            '13,15': 'm',
            '12,14': 'c',
            '14,16': 'c'
        };
        
        this.init();
    }

    async init() {
        // Initialize UI components
        this.setupNavigation();
        this.setupAuth();
        this.setupWorkout();
        this.setupProfile();
        
        // Check authentication status
        if (this.token) {
            await this.loadUserProfile();
        }
        
        // Check subscription status
        this.checkSubscriptionOnLoad();
        
        // Initialize particles and animations
        this.generateParticles();
        this.setupAnimations();
    }

    // API Methods
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Authentication Methods
    async register(email, password, name) {
        try {
            const data = await this.apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ email, password, name })
            });

            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('poseai_token', this.token);

            this.showNotification('Registration successful!', 'success');
            this.redirectToDashboard();
            
            return data;
        } catch (error) {
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    async login(email, password) {
        try {
            const data = await this.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('poseai_token', this.token);

            this.showNotification('Login successful!', 'success');
            this.redirectToDashboard();
            
            return data;
        } catch (error) {
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('poseai_token');
        this.showNotification('Logged out successfully', 'info');
        this.redirectToHome();
    }

    async loadUserProfile() {
        try {
            const user = await this.apiRequest('/user/profile');
            this.user = user;
            return user;
        } catch (error) {
            console.error('Failed to load user profile:', error);
            this.logout();
        }
    }

    async updateProfile(profileData) {
        try {
            await this.apiRequest('/user/profile', {
                method: 'PUT',
                body: JSON.stringify(profileData)
            });

            this.showNotification('Profile updated successfully!', 'success');
            await this.loadUserProfile();
        } catch (error) {
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    // Workout Methods
    async saveWorkout(workoutData) {
        try {
            const workout = await this.apiRequest('/workouts', {
                method: 'POST',
                body: JSON.stringify(workoutData)
            });

            this.showNotification('Workout saved successfully!', 'success');
            return workout;
        } catch (error) {
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    async getWorkouts(filters = {}) {
        try {
            const params = new URLSearchParams(filters);
            const data = await this.apiRequest(`/workouts?${params}`);
            return data;
        } catch (error) {
            console.error('Failed to load workouts:', error);
            throw error;
        }
    }

    async getWorkoutStats(period = 'week') {
        try {
            const stats = await this.apiRequest(`/workouts/stats?period=${period}`);
            return stats;
        } catch (error) {
            console.error('Failed to load workout stats:', error);
            throw error;
        }
    }

    async getProgress(period = 'month') {
        try {
            const progress = await this.apiRequest(`/progress?period=${period}`);
            return progress;
        } catch (error) {
            console.error('Failed to load progress:', error);
            throw error;
        }
    }

    // AI Analysis Methods
    async analyzePose(poses, exerciseType) {
        try {
            const analysis = await this.apiRequest('/ai/analyze', {
                method: 'POST',
                body: JSON.stringify({ poses, exerciseType })
            });

            return analysis;
        } catch (error) {
            console.error('AI analysis failed:', error);
            throw error;
        }
    }

    // Subscription Methods
    async getSubscriptionPlans() {
        try {
            const plans = await this.apiRequest('/subscriptions/plans');
            return plans;
        } catch (error) {
            console.error('Failed to load subscription plans:', error);
            throw error;
        }
    }

    async createPaymentIntent(planId) {
        try {
            const paymentIntent = await this.apiRequest('/subscriptions/create-payment-intent', {
                method: 'POST',
                body: JSON.stringify({ planId })
            });

            return paymentIntent;
        } catch (error) {
            console.error('Failed to create payment intent:', error);
            throw error;
        }
    }

    async confirmSubscription(planId, paymentIntentId) {
        try {
            const result = await this.apiRequest('/subscriptions/confirm', {
                method: 'POST',
                body: JSON.stringify({ planId, paymentIntentId })
            });

            this.showNotification('Subscription activated successfully!', 'success');
            await this.loadUserProfile();
            return result;
        } catch (error) {
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    // Pushup Calculator Integration Methods
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
            
            this.updateAIFeedback('AI model loaded successfully!');
        } catch (error) {
            console.error('Error loading pose detection:', error);
            this.updateAIFeedback('AI model loading failed. Demo mode active.');
        }
    }

    async startCamera() {
        try {
            // Initialize p5.js if not already done
            if (!this.p5Instance) {
                await this.initializeP5();
            }

            // Get camera stream
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            
            this.cameraStream = stream;
            
            // Start pose detection
            if (this.poseDetector) {
                this.detectPose();
            }
            
            // Start workout session
            this.startWorkoutSession();
            
            // Update UI
            document.getElementById('start-camera-btn').disabled = true;
            document.getElementById('stop-camera-btn').disabled = false;
            
            this.updateAIFeedback('Camera started! Position yourself in frame and begin exercising.');
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateAIFeedback('Camera access denied. Please allow camera permissions.');
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        if (this.workoutTimer) {
            clearInterval(this.workoutTimer);
            this.workoutTimer = null;
        }

        // Update UI
        document.getElementById('start-camera-btn').disabled = false;
        document.getElementById('stop-camera-btn').disabled = true;
    }

    async initializeP5() {
        return new Promise((resolve) => {
            // p5.js sketch for pushup calculator
            const sketch = (p) => {
                let video;
                let poses = [];

                p.setup = async () => {
                    const canvas = p.createCanvas(640, 480);
                    canvas.parent('p5-container');
                    
                    video = p.createCapture(p.VIDEO);
                    video.size(640, 480);
                    video.hide();
                    
                    this.video = video;
                    
                    // Initialize pose detection
                    await this.initializePoseDetection();
                    
                    resolve();
                };

                p.draw = () => {
                    p.background(220);
                    p.translate(p.width, 0);
                    p.scale(-1, 1);
                    
                    if (video && video.loadedmetadata) {
                        p.image(video, 0, 0, video.width, video.height);
                    }

                    // Draw keypoints and skeleton
                    this.drawKeypoints(p, poses);
                    this.drawSkeleton(p, poses);

                    // Write text
                    p.fill(255);
                    p.strokeWeight(2);
                    p.stroke(51);
                    p.translate(p.width, 0);
                    p.scale(-1, 1);
                    p.textSize(40);

                    if (poses && poses.length > 0) {
                        let exerciseString = `${this.currentExercise.charAt(0).toUpperCase() + this.currentExercise.slice(1)} completed: ${this.reps}`;
                        p.text(exerciseString, 100, 90);
                    } else {
                        p.text('Loading, please wait...', 100, 90);
                    }
                };

                // Store poses for external access
                p.updatePoses = (newPoses) => {
                    poses = newPoses;
                };
            };

            this.p5Instance = new p5(sketch);
        });
    }

    async detectPose() {
        if (!this.poseDetector || !this.cameraStream || !this.video) return;
        
        const poses = await this.poseDetector.estimatePoses(this.video.elt);
        
        // Update p5.js poses
        if (this.p5Instance && this.p5Instance.updatePoses) {
            this.p5Instance.updatePoses(poses);
        }
        
        if (poses.length > 0) {
            // Store pose data for workout
            if (this.workoutSession) {
                this.workoutSession.poses.push({
                    timestamp: Date.now(),
                    keypoints: poses[0].keypoints
                });
            }
            
            // Analyze pose and provide feedback
            await this.analyzeAndProvideFeedback(poses[0]);
        }
        
        // Continue detection
        requestAnimationFrame(() => this.detectPose());
    }

    drawKeypoints(p, poses) {
        let count = 0;
        if (poses && poses.length > 0) {
            for (let kp of poses[0].keypoints) {
                const { x, y, score } = kp;
                if (score > 0.3) {
                    count = count + 1;
                    p.fill(255);
                    p.stroke(0);
                    p.strokeWeight(4);
                    p.circle(x, y, 16);
                }
            }
            
            if (count == 17) {
                // Update angles for pushup detection
                this.updateArmAngle(poses[0]);
                this.updateBackAngle(poses[0]);
                this.checkPushupPositions();
            }
        }
    }

    drawSkeleton(p, poses) {
        const confidence_threshold = 0.5;

        if (poses && poses.length > 0) {
            for (const [key, value] of Object.entries(this.edges)) {
                const p_idx = key.split(",");
                const p1 = p_idx[0];
                const p2 = p_idx[1];

                const y1 = poses[0].keypoints[p1].y;
                const x1 = poses[0].keypoints[p1].x;
                const c1 = poses[0].keypoints[p1].score;
                const y2 = poses[0].keypoints[p2].y;
                const x2 = poses[0].keypoints[p2].x;
                const c2 = poses[0].keypoints[p2].score;

                if ((c1 > confidence_threshold) && (c2 > confidence_threshold)) {
                    if ((this.highlightBack == true) && ((p_idx[1] == 11) || ((p_idx[0] == 6) && (p_idx[1] == 12)) || (p_idx[1] == 13) || (p_idx[0] == 12))) {
                        p.strokeWeight(3);
                        p.stroke(255, 0, 0);
                        p.line(x1, y1, x2, y2);
                    } else {
                        p.strokeWeight(2);
                        p.stroke('rgb(0, 255, 0)');
                        p.line(x1, y1, x2, y2);
                    }
                }
            }
        }
    }

    updateArmAngle(pose) {
        const leftWrist = pose.keypoints[9];
        const leftShoulder = pose.keypoints[5];
        const leftElbow = pose.keypoints[7];

        const angle = (
            Math.atan2(
                leftWrist.y - leftElbow.y,
                leftWrist.x - leftElbow.x
            ) - Math.atan2(
                leftShoulder.y - leftElbow.y,
                leftShoulder.x - leftElbow.x
            )
        ) * (180 / Math.PI);

        if (leftWrist.score > 0.3 && leftElbow.score > 0.3 && leftShoulder.score > 0.3) {
            this.elbowAngle = angle;
        }
    }

    updateBackAngle(pose) {
        const leftShoulder = pose.keypoints[5];
        const leftHip = pose.keypoints[11];
        const leftKnee = pose.keypoints[13];

        const angle = (
            Math.atan2(
                leftKnee.y - leftHip.y,
                leftKnee.x - leftHip.x
            ) - Math.atan2(
                leftShoulder.y - leftHip.y,
                leftShoulder.x - leftHip.x
            )
        ) * (180 / Math.PI);
        
        const backAngle = angle % 180;
        if (leftKnee.score > 0.3 && leftHip.score > 0.3 && leftShoulder.score > 0.3) {
            this.backAngle = backAngle;
        }

        if ((this.backAngle < 20) || (this.backAngle > 160)) {
            this.highlightBack = false;
            this.updateFormFeedback('Good posture!', 'good');
        } else {
            this.highlightBack = true;
            this.updateFormFeedback('Keep your back straight', 'warning');
            if (this.backWarningGiven != true && this.voiceFeedbackEnabled) {
                this.speak('Keep your back straight');
                this.backWarningGiven = true;
            }
        }
    }

    checkPushupPositions() {
        // Check if in up position
        if (this.elbowAngle > 170 && this.elbowAngle < 200) {
            if (this.downPosition == true) {
                this.reps++;
                document.getElementById('rep-count').textContent = this.reps;
                if (this.voiceFeedbackEnabled) {
                    this.speak(this.reps.toString());
                }
                this.updateAIFeedback(`Great form! Rep ${this.reps} completed.`);
            }
            this.upPosition = true;
            this.downPosition = false;
        }

        // Check if in down position
        const elbowAboveNose = this.getCurrentPose() && this.getCurrentPose().keypoints[0].y > this.getCurrentPose().keypoints[7].y;
        
        if ((this.highlightBack == false) && elbowAboveNose && ((Math.abs(this.elbowAngle) > 70) && (Math.abs(this.elbowAngle) < 100))) {
            if (this.upPosition == true && this.voiceFeedbackEnabled) {
                this.speak('Up');
            }
            this.downPosition = true;
            this.upPosition = false;
        }
    }

    getCurrentPose() {
        // Return the most recent pose from workout session
        if (this.workoutSession && this.workoutSession.poses.length > 0) {
            return { keypoints: this.workoutSession.poses[this.workoutSession.poses.length - 1].keypoints };
        }
        return null;
    }

    speak(text) {
        if ('speechSynthesis' in window && this.voiceFeedbackEnabled) {
            const msg = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(msg);
        }
    }

    startWorkoutSession() {
        this.workoutSession = {
            startTime: Date.now(),
            reps: 0,
            calories: 0,
            exerciseType: this.currentExercise,
            poses: [],
            feedback: []
        };
        
        this.workoutSeconds = 0;
        this.workoutTimer = setInterval(() => {
            this.workoutSeconds++;
            const minutes = Math.floor(this.workoutSeconds / 60);
            const seconds = this.workoutSeconds % 60;
            document.getElementById('workout-time').textContent = 
                `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Update calories (simplified)
            const calories = Math.round(this.workoutSeconds * 0.1);
            document.getElementById('calories').textContent = calories;
            this.workoutSession.calories = calories;
        }, 1000);
    }

    resetWorkout() {
        this.reps = 0;
        this.elbowAngle = 999;
        this.backAngle = 0;
        this.upPosition = false;
        this.downPosition = false;
        this.highlightBack = false;
        this.backWarningGiven = false;
        
        document.getElementById('rep-count').textContent = '0';
        document.getElementById('form-score').textContent = '--';
        document.getElementById('calories').textContent = '0';
        document.getElementById('workout-time').textContent = '0:00';
        
        this.updateAIFeedback('Workout reset. Ready to start!');
        this.updateFormFeedback('', '');
    }

    selectExercise(exerciseType) {
        this.currentExercise = exerciseType;
        
        // Update UI
        document.querySelectorAll('.exercise-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-exercise="${exerciseType}"]`).classList.add('active');
        
        // Update current exercise display
        const exerciseNames = {
            'pushups': 'Push-ups',
            'squats': 'Squats',
            'jumping-jacks': 'Jumping Jacks',
            'plank': 'Plank'
        };
        document.getElementById('current-exercise').textContent = exerciseNames[exerciseType];
        
        // Reset workout for new exercise
        this.resetWorkout();
    }

    // Payment System Methods
    async initiatePayment(planId) {
        try {
            // Load payment modal HTML
            await this.loadPaymentModal();
            
            // Set current plan
            this.currentPlan = this.getPlanDetails(planId);
            this.populatePlanDetails();
            
            // Show payment modal
            this.showPaymentModal();
            this.goToPaymentStep(1);
            
        } catch (error) {
            console.error('Failed to initiate payment:', error);
            this.showNotification('Failed to start payment process', 'error');
        }
    }

    getPlanDetails(planId) {
        const plans = {
            'pro': {
                id: 'pro',
                name: 'PRO',
                price: 199,
                description: 'Full posture correction and AI features',
                features: [
                    'Full posture correction',
                    'All AI workout modes',
                    'No ads',
                    'Basic analytics'
                ]
            },
            'pro-plus': {
                id: 'pro-plus',
                name: 'PRO+',
                price: 299,
                description: 'Advanced analytics and community features',
                features: [
                    'Everything in PRO',
                    'Advanced analytics',
                    'Smart workout planner',
                    'Community mode unlocked'
                ]
            },
            'ultra-pro': {
                id: 'ultra-pro',
                name: 'ULTRA PRO',
                price: 399,
                description: 'Ultimate AI fitness experience',
                features: [
                    'Everything in PRO+',
                    'Unlimited AI feedback',
                    'Exclusive workout packs',
                    'Priority feature access',
                    'Early access to new models'
                ]
            }
        };
        
        return plans[planId] || plans['pro'];
    }

    async loadPaymentModal() {
        const container = document.getElementById('payment-modal-container');
        if (container.innerHTML.trim()) return; // Already loaded
        
        try {
            const response = await fetch('components/payment-modal.html');
            const html = await response.text();
            container.innerHTML = html;
        } catch (error) {
            console.error('Failed to load payment modal:', error);
        }
    }

    populatePlanDetails() {
        if (!this.currentPlan) return;
        
        document.getElementById('selected-plan-name').textContent = this.currentPlan.name;
        document.getElementById('selected-plan-price').textContent = `₹${this.currentPlan.price}`;
        document.getElementById('selected-plan-description').textContent = this.currentPlan.description;
        
        const featuresContainer = document.getElementById('selected-plan-features');
        featuresContainer.innerHTML = this.currentPlan.features.map(feature => 
            `<div class="flex items-center">
                <i class="fas fa-check text-green-400 mr-2"></i>
                <span>${feature}</span>
            </div>`
        ).join('');
    }

    showPaymentModal() {
        document.getElementById('payment-modal').classList.remove('hidden');
    }

    closePaymentModal() {
        document.getElementById('payment-modal').classList.add('hidden');
        this.resetPaymentFlow();
    }

    proceedToQRCode() {
        this.goToPaymentStep(2);
    }

    selectPaymentMethod(method) {
        this.currentPaymentMethod = method;
        this.goToPaymentStep(3);
        this.generateQRCode();
    }

    changePaymentMethod() {
        this.goToPaymentStep(2);
    }

    generateQRCode() {
        if (!this.currentPlan || !this.currentPaymentMethod) return;
        
        // Generate transaction ID
        this.transactionId = this.generateTransactionId();
        
        // Update payment details
        document.getElementById('transaction-id').textContent = this.transactionId;
        document.getElementById('payment-amount').textContent = `₹${this.currentPlan.price}`;
        document.getElementById('payment-plan').textContent = this.currentPlan.name;
        
        // Update payment method display
        const methodNames = {
            'phonepe': 'PhonePe',
            'gpay': 'Google Pay',
            'paytm': 'Paytm',
            'amazonpay': 'Amazon Pay',
            'upi': 'UPI App'
        };
        document.getElementById('selected-payment-method-name').textContent = methodNames[this.currentPaymentMethod];
        document.getElementById('payment-method-display').textContent = methodNames[this.currentPaymentMethod];
        
        // Generate UPI payment string
        const upiString = `upi://pay?pa=poseai@upi&pn=PoseAI&am=${this.currentPlan.price}&cu=INR&tn=${this.currentPlan.name}_SUBSCRIPTION&tr=${this.transactionId}`;
        
        // Generate QR code
        this.generateQRCodeImage(upiString);
        
        // Show payment app logo
        this.showPaymentAppLogo();
    }

    generateTransactionId() {
        return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
    }

    generateQRCodeImage(text) {
        const container = document.getElementById('qr-code-container');
        container.innerHTML = ''; // Clear existing content
        
        // Create QR code
        const qrContainer = document.createElement('div');
        qrContainer.className = 'w-64 h-64 bg-white rounded-lg p-4';
        
        const qrCode = new QRCode(qrContainer, {
            text: text,
            width: 224,
            height: 224,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        
        container.appendChild(qrContainer);
    }

    showPaymentAppLogo() {
        const logoContainer = document.getElementById('payment-app-logo');
        const logos = {
            'phonepe': '<i class="fas fa-mobile-alt text-purple-600 text-2xl"></i>',
            'gpay': '<span class="text-blue-500 font-bold text-2xl">G</span>',
            'paytm': '<span class="text-blue-500 font-bold text-2xl">P</span>',
            'amazonpay': '<span class="text-orange-500 font-bold text-2xl">A</span>',
            'upi': '<i class="fas fa-university text-green-500 text-2xl"></i>'
        };
        
        logoContainer.innerHTML = logos[this.currentPaymentMethod];
        logoContainer.classList.remove('hidden');
    }

    async simulatePayment() {
        // Show processing state
        this.goToPaymentStep(4);
        document.getElementById('payment-processing').classList.remove('hidden');
        document.getElementById('payment-success').classList.add('hidden');
        document.getElementById('payment-details').classList.add('hidden');
        document.getElementById('payment-complete-actions').classList.add('hidden');
        
        // Simulate payment processing delay
        await this.delay(2000);
        
        // Random success/failure (95% success rate)
        const isSuccess = Math.random() > 0.05;
        
        if (isSuccess) {
            this.processPaymentSuccess();
        } else {
            this.processPaymentFailure();
        }
    }

    async processPaymentSuccess() {
        // Show success state
        document.getElementById('payment-processing').classList.add('hidden');
        document.getElementById('payment-success').classList.remove('hidden');
        
        // Update payment details
        document.getElementById('confirmed-transaction-id').textContent = this.transactionId;
        document.getElementById('confirmed-amount').textContent = `₹${this.currentPlan.price}`;
        document.getElementById('confirmed-plan').textContent = this.currentPlan.name;
        
        // Calculate expiry date (30 days from now)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        document.getElementById('subscription-expiry').textContent = expiryDate.toLocaleDateString();
        
        // Show details and actions
        document.getElementById('payment-details').classList.remove('hidden');
        
        await this.delay(1000);
        document.getElementById('payment-complete-actions').classList.remove('hidden');
        
        // Store subscription in localStorage
        this.storeSubscription();
        
        // Show success notification
        this.showNotification('Payment successful! Welcome to Premium!', 'success');
    }

    processPaymentFailure() {
        document.getElementById('payment-processing').classList.add('hidden');
        
        // Show error message
        const errorHtml = `
            <div class="text-center">
                <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500 flex items-center justify-center">
                    <i class="fas fa-times text-white text-2xl"></i>
                </div>
                <h4 class="text-xl font-semibold mb-2">Payment Failed</h4>
                <p class="text-gray-300 mb-4">Unable to process payment. Please try again.</p>
                <button onclick="window.poseai.retryPayment()" class="px-6 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition">
                    Try Again
                </button>
            </div>
        `;
        
        document.getElementById('payment-processing').innerHTML = errorHtml;
    }

    retryPayment() {
        this.goToPaymentStep(3);
    }

    storeSubscription() {
        const subscription = {
            plan: this.currentPlan.id,
            planName: this.currentPlan.name,
            price: this.currentPlan.price,
            transactionId: this.transactionId,
            paymentMethod: this.currentPaymentMethod,
            activatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true
        };
        
        localStorage.setItem('poseai_subscription', JSON.stringify(subscription));
        
        // Update user object
        if (this.user) {
            this.user.subscription = this.currentPlan.id;
            this.user.subscriptionDetails = subscription;
        }
    }

    goToPaymentStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.payment-step').forEach(step => {
            step.classList.add('hidden');
        });
        
        // Show current step
        document.getElementById(`payment-step-${stepNumber}`).classList.remove('hidden');
        
        // Update step indicators
        for (let i = 1; i <= 4; i++) {
            const indicator = document.getElementById(`step${i}-indicator`);
            if (i <= stepNumber) {
                indicator.className = 'w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 flex items-center justify-center text-white font-semibold';
            } else {
                indicator.className = 'w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold';
            }
        }
    }

    resetPaymentFlow() {
        this.currentPlan = null;
        this.currentPaymentMethod = null;
        this.transactionId = null;
        
        // Reset to step 1
        this.goToPaymentStep(1);
    }

    goToPremiumDashboard() {
        this.closePaymentModal();
        this.showPremiumDashboard();
    }

    showPremiumDashboard() {
        document.getElementById('premium-dashboard').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    closePremiumDashboard() {
        document.getElementById('premium-dashboard').classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    startPremiumWorkout() {
        this.closePremiumDashboard();
        this.closeWelcomeModal();
        startDemo(); // Start the demo workout
    }

    showWelcomeModal() {
        document.getElementById('premium-welcome-modal').classList.remove('hidden');
    }

    closeWelcomeModal() {
        document.getElementById('premium-welcome-modal').classList.add('hidden');
    }

    checkSubscriptionStatus() {
        const subscription = localStorage.getItem('poseai_subscription');
        if (!subscription) return false;
        
        try {
            const sub = JSON.parse(subscription);
            const expiryDate = new Date(sub.expiresAt);
            const now = new Date();
            
            return sub.isActive && expiryDate > now;
        } catch (error) {
            console.error('Error parsing subscription:', error);
            return false;
        }
    }

    getSubscriptionDetails() {
        const subscription = localStorage.getItem('poseai_subscription');
        if (!subscription) return null;
        
        try {
            return JSON.parse(subscription);
        } catch (error) {
            console.error('Error parsing subscription:', error);
            return null;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    checkSubscriptionOnLoad() {
        const subscription = this.getSubscriptionDetails();
        if (subscription && subscription.isActive) {
            // Show welcome modal for existing subscribers
            setTimeout(() => {
                this.showWelcomeModal();
            }, 2000);
        }
    }

    // UI Setup Methods
    setupNavigation() {
        // Mobile menu toggle
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }

        // Auth buttons
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const logoutBtn = document.getElementById('logout-btn');

        if (loginBtn) loginBtn.addEventListener('click', () => this.showLoginModal());
        if (registerBtn) registerBtn.addEventListener('click', () => this.showRegisterModal());
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
    }

    setupAuth() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                
                try {
                    await this.login(email, password);
                    this.closeModal('login-modal');
                } catch (error) {
                    // Error already shown in login method
                }
            });
        }

        // Register form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('register-name').value;
                const email = document.getElementById('register-email').value;
                const password = document.getElementById('register-password').value;
                
                try {
                    await this.register(email, password, name);
                    this.closeModal('register-modal');
                } catch (error) {
                    // Error already shown in register method
                }
            });
        }
    }

    setupWorkout() {
        // Voice feedback toggle
        const voiceFeedbackToggle = document.getElementById('voice-feedback');
        if (voiceFeedbackToggle) {
            voiceFeedbackToggle.addEventListener('change', (e) => {
                this.voiceFeedbackEnabled = e.target.checked;
            });
        }
    }

    setupProfile() {
        // Profile form
        const profileForm = document.getElementById('profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveProfileFromForm();
            });
        }

        // Load profile data if user is logged in
        if (this.user && document.getElementById('profile-section')) {
            this.displayUserProfile();
        }
    }

    // UI Helper Methods
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

    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    showLoginModal() {
        this.showModal('login-modal');
    }

    showRegisterModal() {
        this.showModal('register-modal');
    }

    scrollToSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    }

    updateAIFeedback(message) {
        const feedbackDiv = document.getElementById('ai-feedback');
        if (feedbackDiv) {
            feedbackDiv.innerHTML = `<p class="text-green-400"><i class="fas fa-check-circle mr-2"></i>${message}</p>`;
        }
    }

    updateFormFeedback(message, type) {
        const feedbackDiv = document.getElementById('form-feedback');
        if (feedbackDiv) {
            if (message) {
                feedbackDiv.textContent = message;
                feedbackDiv.className = `form-feedback ${type}`;
                feedbackDiv.classList.remove('hidden');
            } else {
                feedbackDiv.classList.add('hidden');
            }
        }
    }

    generateParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;
        
        const particleCount = 20;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.width = Math.random() * 20 + 10 + 'px';
            particle.style.height = particle.style.width;
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 20 + 's';
            particle.style.animationDuration = (Math.random() * 20 + 20) + 's';
            particlesContainer.appendChild(particle);
        }
    }

    setupAnimations() {
        // Initialize AOS
        if (typeof AOS !== 'undefined') {
            AOS.init({
                duration: 1000,
                once: true
            });
        }

        // Parallax scrolling
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const parallax = document.querySelector('.hero-gradient');
            if (parallax) {
                parallax.style.transform = `translateY(${scrolled * 0.5}px)`;
            }
        });
    }

    animateCounters() {
        const counters = document.querySelectorAll('.counter');
        
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target'));
            const increment = target / 100;
            let current = 0;
            
            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    counter.textContent = Math.ceil(current);
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.textContent = target;
                }
            };
            
            updateCounter();
        });
    }

    // Navigation Methods
    redirectToDashboard() {
        if (window.location.pathname === '/') {
            this.scrollToSection('dashboard');
        } else {
            window.location.href = '/dashboard.html';
        }
    }

    redirectToHome() {
        window.location.href = '/';
    }

    toggleMobileMenu() {
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu) {
            mobileMenu.classList.toggle('hidden');
        }
    }

    // Form Methods
    async saveWorkoutFromForm() {
        const exerciseType = document.getElementById('exercise-type').value;
        const duration = parseInt(document.getElementById('duration').value);
        const reps = parseInt(document.getElementById('reps').value);
        const calories = parseInt(document.getElementById('calories').value);
        const formScore = parseInt(document.getElementById('form-score').value);

        const workoutData = {
            exerciseType,
            duration,
            reps,
            calories,
            avgFormScore: formScore,
            completed: true
        };

        try {
            await this.saveWorkout(workoutData);
            document.getElementById('workout-form').reset();
        } catch (error) {
            // Error already shown
        }
    }

    async saveProfileFromForm() {
        const name = document.getElementById('profile-name').value;
        const age = parseInt(document.getElementById('profile-age').value);
        const weight = parseFloat(document.getElementById('profile-weight').value);
        const height = parseFloat(document.getElementById('profile-height').value);
        const fitnessGoal = document.getElementById('fitness-goal').value;
        const fitnessLevel = document.getElementById('fitness-level').value;

        const profileData = {
            name,
            profile: {
                age,
                weight,
                height,
                fitnessGoal,
                fitnessLevel
            }
        };

        try {
            await this.updateProfile(profileData);
        } catch (error) {
            // Error already shown
        }
    }

    displayUserProfile() {
        if (!this.user) return;

        document.getElementById('profile-name').value = this.user.name || '';
        document.getElementById('profile-email').value = this.user.email || '';
        
        if (this.user.profile) {
            document.getElementById('profile-age').value = this.user.profile.age || '';
            document.getElementById('profile-weight').value = this.user.profile.weight || '';
            document.getElementById('profile-height').value = this.user.profile.height || '';
            document.getElementById('fitness-goal').value = this.user.profile.fitnessGoal || '';
            document.getElementById('fitness-level').value = this.user.profile.fitnessLevel || '';
        }

        // Display subscription status
        const subscriptionBadge = document.getElementById('subscription-badge');
        if (subscriptionBadge) {
            subscriptionBadge.textContent = this.user.subscription?.toUpperCase() || 'FREE';
            subscriptionBadge.className = `px-3 py-1 rounded-full text-sm font-bold ${
                this.user.subscription === 'free' ? 'bg-gray-500' :
                this.user.subscription === 'pro' ? 'bg-blue-500' :
                this.user.subscription === 'pro-plus' ? 'bg-yellow-500' :
                'bg-purple-500'
            } text-white`;
        }
    }

    // Dashboard Methods
    async loadDashboardData() {
        if (!this.token) return;

        try {
            const [workouts, stats, progress] = await Promise.all([
                this.getWorkouts({ limit: 5 }),
                this.getWorkoutStats('week'),
                this.getProgress('week')
            ]);

            this.displayDashboardStats(stats);
            this.displayRecentWorkouts(workouts.workouts);
            this.displayProgressChart(progress);
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    }

    displayDashboardStats(stats) {
        document.getElementById('total-workouts').textContent = stats.totalWorkouts || 0;
        document.getElementById('total-duration').textContent = this.formatDuration(stats.totalDuration || 0);
        document.getElementById('total-reps').textContent = stats.totalReps || 0;
        document.getElementById('avg-form-score').textContent = Math.round(stats.avgFormScore || 0) + '%';
    }

    displayRecentWorkouts(workouts) {
        const container = document.getElementById('recent-workouts');
        if (!container) return;

        container.innerHTML = workouts.map(workout => `
            <div class="glassmorphism p-4 mb-3">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-semibold">${workout.exerciseType}</h4>
                        <p class="text-sm text-gray-300">${new Date(workout.date).toLocaleDateString()}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm">${workout.reps} reps</p>
                        <p class="text-sm">${this.formatDuration(workout.duration)}</p>
                    </div>
                </div>
            </div>
        `).join('');
    }

    displayProgressChart(progress) {
        // Simple progress display (could integrate with Chart.js)
        const container = document.getElementById('progress-chart');
        if (!container) return;

        const totalProgress = progress.reduce((sum, p) => sum + p.totalWorkouts, 0);
        const avgCalories = progress.reduce((sum, p) => sum + p.totalCalories, 0) / progress.length;

        container.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div class="text-center">
                    <p class="text-2xl font-bold gradient-text">${totalProgress}</p>
                    <p class="text-sm text-gray-300">Total Workouts</p>
                </div>
                <div class="text-center">
                    <p class="text-2xl font-bold gradient-text">${Math.round(avgCalories)}</p>
                    <p class="text-sm text-gray-300">Avg Calories</p>
                </div>
            </div>
        `;
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    async analyzeAndProvideFeedback(pose) {
        try {
            // Calculate form score based on pose analysis
            const formScore = this.calculateFormScore(pose);
            document.getElementById('form-score').textContent = Math.round(formScore) + '%';
            
            // Update feedback based on exercise type
            this.updateExerciseFeedback(pose);
            
        } catch (error) {
            console.error('Analysis error:', error);
        }
    }

    calculateFormScore(pose) {
        // Simple form scoring based on keypoint confidence and angles
        const keypoints = pose.keypoints;
        const avgConfidence = keypoints.reduce((sum, kp) => sum + kp.score, 0) / keypoints.length;
        
        let formScore = avgConfidence * 100;
        
        // Adjust based on exercise-specific metrics
        if (this.currentExercise === 'pushups') {
            if (this.highlightBack) {
                formScore -= 20; // Penalize bad back posture
            }
            if (this.elbowAngle > 160 && this.elbowAngle < 200) {
                formScore += 10; // Bonus for good up position
            }
        }
        
        return Math.max(0, Math.min(100, formScore));
    }

    updateExerciseFeedback(pose) {
        const feedback = [];
        
        switch (this.currentExercise) {
            case 'pushups':
                if (this.highlightBack) {
                    feedback.push('Keep your back straight');
                }
                if (this.elbowAngle > 160 && this.elbowAngle < 200) {
                    feedback.push('Good up position');
                }
                break;
            case 'squats':
                // Add squat-specific feedback
                feedback.push('Maintain good squat form');
                break;
            case 'jumping-jacks':
                feedback.push('Keep jumping rhythm');
                break;
            case 'plank':
                feedback.push('Hold that plank position');
                break;
        }
        
        if (feedback.length > 0) {
            this.updateAIFeedback(feedback.join('. '));
        }
    }
}

// Initialize PoseAI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.poseai = new PoseAI();
});

// Global functions for HTML onclick handlers
function startDemo() {
    document.getElementById('demo-modal').classList.remove('hidden');
}

function closeDemo() {
    document.getElementById('demo-modal').classList.add('hidden');
    if (window.poseai) {
        window.poseai.stopCamera();
    }
}

function selectExercise(exerciseType) {
    if (window.poseai) {
        window.poseai.selectExercise(exerciseType);
    }
}

async function startCamera() {
    if (window.poseai) {
        await window.poseai.startCamera();
    }
}

function stopCamera() {
    if (window.poseai) {
        window.poseai.stopCamera();
    }
}

function resetWorkout() {
    if (window.poseai) {
        window.poseai.resetWorkout();
    }
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function watchPreview() {
    // Placeholder for preview video
    alert('Preview video coming soon! Try the live demo instead.');
}

// Export for global access
window.PoseAI = PoseAI;
