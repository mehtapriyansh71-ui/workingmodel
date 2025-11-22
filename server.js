const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/poseai', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// MongoDB Schemas
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    subscription: { 
        type: String, 
        enum: ['free', 'pro', 'pro-plus', 'ultra-pro'], 
        default: 'free' 
    },
    subscriptionExpiry: { type: Date },
    profile: {
        age: Number,
        weight: Number,
        height: Number,
        fitnessGoal: String,
        fitnessLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] }
    },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now }
});

const workoutSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    duration: { type: Number, required: true }, // in seconds
    exerciseType: { type: String, required: true },
    reps: { type: Number, default: 0 },
    calories: { type: Number, default: 0 },
    avgFormScore: { type: Number, default: 0 },
    poses: [{ // Store pose data for analysis
        timestamp: Number,
        keypoints: [{
            x: Number,
            y: Number,
            score: Number,
            name: String
        }]
    }],
    feedback: [String], // AI feedback messages
    completed: { type: Boolean, default: false },
    // Enhanced fields for pushup calculator integration
    formQuality: {
        backStraightness: { type: Number, default: 0 }, // 0-100 score
        elbowAngle: { type: Number, default: 0 }, // average elbow angle
        postureAlerts: { type: Number, default: 0 }, // count of posture corrections
        voiceFeedbackEnabled: { type: Boolean, default: true }
    },
    exerciseMetrics: {
        targetReps: { type: Number, default: 0 },
        maxConsecutiveReps: { type: Number, default: 0 },
        averageRepDuration: { type: Number, default: 0 }, // seconds per rep
        formTrend: { type: String, default: 'stable' } // improving, stable, declining
    }
});

const progressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    weight: Number,
    totalWorkouts: { type: Number, default: 0 },
    totalCalories: { type: Number, default: 0 },
    totalReps: { type: Number, default: 0 },
    avgFormScore: { type: Number, default: 0 },
    streak: { type: Number, default: 0 }, // consecutive days
    achievements: [String]
});

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    plan: { type: String, required: true },
    stripePaymentId: { type: String },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const bodyMeasurementSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    chest: { type: Number }, // cm
    leftBicep: { type: Number }, // cm
    rightBicep: { type: Number }, // cm
    scaleCmPerPixel: { type: Number }, // calibration scale
    measurementType: { 
        type: String, 
        enum: ['chest', 'bicep', 'full_body'], 
        default: 'full_body' 
    },
    confidence: { type: Number, default: 0 }, // AI confidence score
    metadata: {
        poseConfidence: { type: Number },
        calibrationFrames: { type: Number },
        deviceInfo: { type: String }
    },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Workout = mongoose.model('Workout', workoutSchema);
const Progress = mongoose.model('Progress', progressSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const BodyMeasurement = mongoose.model('BodyMeasurement', bodyMeasurementSchema);

// JWT Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'poseai-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// File upload for workout images/videos
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed'));
        }
    }
});

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = new User({
            email,
            password: hashedPassword,
            name
        });

        await user.save();

        // Create JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'poseai-secret-key',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                subscription: user.subscription
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Create JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'poseai-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                subscription: user.subscription,
                subscriptionExpiry: user.subscriptionExpiry
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// User Profile Routes
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { name, profile } = req.body;
        const user = await User.findById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (name) user.name = name;
        if (profile) user.profile = { ...user.profile, ...profile };

        await user.save();
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Workout Routes
app.post('/api/workouts', authenticateToken, async (req, res) => {
    try {
        const workoutData = {
            ...req.body,
            userId: req.user.userId,
            date: new Date()
        };

        const workout = new Workout(workoutData);
        await workout.save();

        // Update progress
        await updateProgress(req.user.userId, workout);

        res.status(201).json({
            message: 'Workout saved successfully',
            workout
        });
    } catch (error) {
        console.error('Workout save error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/workouts', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, startDate, endDate } = req.query;
        const skip = (page - 1) * limit;

        let query = { userId: req.user.userId };
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const workouts = await Workout.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Workout.countDocuments(query);

        res.json({
            workouts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Workouts fetch error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/workouts/stats', authenticateToken, async (req, res) => {
    try {
        const { period = 'week' } = req.query;
        let startDate = new Date();

        switch (period) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
        }

        const stats = await Workout.aggregate([
            {
                $match: {
                    userId: mongoose.Types.ObjectId(req.user.userId),
                    date: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalWorkouts: { $sum: 1 },
                    totalDuration: { $sum: '$duration' },
                    totalReps: { $sum: '$reps' },
                    totalCalories: { $sum: '$calories' },
                    avgFormScore: { $avg: '$avgFormScore' }
                }
            }
        ]);

        const result = stats[0] || {
            totalWorkouts: 0,
            totalDuration: 0,
            totalReps: 0,
            totalCalories: 0,
            avgFormScore: 0
        };

        res.json(result);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Progress Routes
app.get('/api/progress', authenticateToken, async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        let startDate = new Date();

        switch (period) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
        }

        const progress = await Progress.find({
            userId: req.user.userId,
            date: { $gte: startDate }
        }).sort({ date: 1 });

        res.json(progress);
    } catch (error) {
        console.error('Progress error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// AI Analysis Routes
app.post('/api/ai/analyze', authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const { poses, exerciseType } = req.body;
        
        // Simulate AI analysis (in real implementation, this would use TensorFlow.js)
        const analysis = {
            formScore: Math.random() * 100,
            feedback: generateFeedback(exerciseType, JSON.parse(poses)),
            suggestions: generateSuggestions(exerciseType),
            corrected: false
        };

        res.json(analysis);
    } catch (error) {
        console.error('AI analysis error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Subscription Routes
app.get('/api/subscriptions/plans', (req, res) => {
    const plans = [
        {
            id: 'pro',
            name: 'PRO',
            price: 19900, // in paise (₹199)
            currency: 'INR',
            duration: 'month',
            features: [
                'Full posture correction',
                'All AI workout modes',
                'No ads',
                'Basic analytics'
            ]
        },
        {
            id: 'pro-plus',
            name: 'PRO+',
            price: 29900, // in paise (₹299)
            currency: 'INR',
            duration: 'month',
            features: [
                'Everything in PRO',
                'Advanced analytics',
                'Smart workout planner',
                'Community mode unlocked'
            ]
        },
        {
            id: 'ultra-pro',
            name: 'ULTRA PRO',
            price: 39900, // in paise (₹399)
            currency: 'INR',
            duration: 'month',
            features: [
                'Everything in PRO+',
                'Unlimited AI feedback',
                'Exclusive workout packs',
                'Priority feature access',
                'Early access to new models'
            ]
        }
    ];

    res.json(plans);
});

app.post('/api/subscriptions/create-payment-intent', authenticateToken, async (req, res) => {
    try {
        const { planId } = req.body;
        
        // This would integrate with Stripe in production
        // For now, return a mock payment intent
        const paymentIntent = {
            clientSecret: 'pi_mock_' + uuidv4(),
            amount: getPlanPrice(planId),
            currency: 'inr'
        };

        res.json(paymentIntent);
    } catch (error) {
        console.error('Payment intent error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/subscriptions/confirm', authenticateToken, async (req, res) => {
    try {
        const { planId, paymentIntentId } = req.body;
        
        // Update user subscription
        const user = await User.findById(req.user.userId);
        const subscriptionExpiry = new Date();
        subscriptionExpiry.setMonth(subscriptionExpiry.getMonth() + 1);

        user.subscription = planId;
        user.subscriptionExpiry = subscriptionExpiry;
        await user.save();

        // Record payment
        const payment = new Payment({
            userId: req.user.userId,
            amount: getPlanPrice(planId),
            plan: planId,
            stripePaymentId: paymentIntentId,
            status: 'completed'
        });
        await payment.save();

        res.json({
            message: 'Subscription activated successfully',
            subscription: planId,
            expiryDate: subscriptionExpiry
        });
    } catch (error) {
        console.error('Subscription confirmation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Body Measurement Routes
app.post('/api/measurements', authenticateToken, async (req, res) => {
    try {
        const { chest, leftBicep, rightBicep, scaleCmPerPixel, measurementType = 'full_body', metadata = {} } = req.body;
        
        // Validate measurement data
        if (!chest && !leftBicep && !rightBicep) {
            return res.status(400).json({ error: 'At least one measurement is required' });
        }
        
        const measurementData = {
            userId: req.user.userId,
            chest,
            leftBicep,
            rightBicep,
            scaleCmPerPixel,
            measurementType,
            confidence: metadata.poseConfidence || 0,
            metadata: {
                poseConfidence: metadata.poseConfidence || 0,
                calibrationFrames: metadata.calibrationFrames || 0,
                deviceInfo: metadata.deviceInfo || 'web'
            },
            timestamp: new Date()
        };
        
        const measurement = new BodyMeasurement(measurementData);
        await measurement.save();
        
        res.status(201).json({
            message: 'Measurements saved successfully',
            measurement
        });
    } catch (error) {
        console.error('Measurement save error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/measurements', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, startDate, endDate, measurementType } = req.query;
        const skip = (page - 1) * limit;

        let query = { userId: req.user.userId };
        
        if (startDate && endDate) {
            query.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        if (measurementType) {
            query.measurementType = measurementType;
        }

        const measurements = await BodyMeasurement.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await BodyMeasurement.countDocuments(query);

        res.json({
            measurements,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Measurements fetch error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/measurements/stats', authenticateToken, async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        let startDate = new Date();

        switch (period) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
        }

        const stats = await BodyMeasurement.aggregate([
            {
                $match: {
                    userId: mongoose.Types.ObjectId(req.user.userId),
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    avgChest: { $avg: '$chest' },
                    avgLeftBicep: { $avg: '$leftBicep' },
                    avgRightBicep: { $avg: '$rightBicep' },
                    maxChest: { $max: '$chest' },
                    maxLeftBicep: { $max: '$leftBicep' },
                    maxRightBicep: { $max: '$rightBicep' },
                    minChest: { $min: '$chest' },
                    minLeftBicep: { $min: '$leftBicep' },
                    minRightBicep: { $min: '$rightBicep' },
                    totalMeasurements: { $sum: 1 },
                    avgConfidence: { $avg: '$confidence' }
                }
            }
        ]);

        const result = stats[0] || {
            avgChest: 0,
            avgLeftBicep: 0,
            avgRightBicep: 0,
            maxChest: 0,
            maxLeftBicep: 0,
            maxRightBicep: 0,
            minChest: 0,
            minLeftBicep: 0,
            minRightBicep: 0,
            totalMeasurements: 0,
            avgConfidence: 0
        };

        res.json(result);
    } catch (error) {
        console.error('Measurement stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/measurements/latest', authenticateToken, async (req, res) => {
    try {
        const latestMeasurement = await BodyMeasurement.findOne({
            userId: req.user.userId
        }).sort({ timestamp: -1 });

        if (!latestMeasurement) {
            return res.status(404).json({ error: 'No measurements found' });
        }

        res.json(latestMeasurement);
    } catch (error) {
        console.error('Latest measurement error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/measurements/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const measurement = await BodyMeasurement.findOne({
            _id: id,
            userId: req.user.userId
        });

        if (!measurement) {
            return res.status(404).json({ error: 'Measurement not found' });
        }

        await BodyMeasurement.deleteOne({ _id: id });

        res.json({ message: 'Measurement deleted successfully' });
    } catch (error) {
        console.error('Measurement delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper Functions
async function updateProgress(userId, workout) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let progress = await Progress.findOne({
        userId,
        date: { $gte: today }
    });

    if (!progress) {
        progress = new Progress({
            userId,
            date: new Date()
        });
    }

    progress.totalWorkouts += 1;
    progress.totalCalories += workout.calories || 0;
    progress.totalReps += workout.reps || 0;
    progress.avgFormScore = (progress.avgFormScore + workout.avgFormScore) / 2;

    await progress.save();
}

function generateFeedback(exerciseType, poses) {
    const feedback = [];
    
    // Simulate feedback generation based on exercise type
    if (exerciseType === 'squats') {
        feedback.push('Keep your back straight');
        feedback.push('Go deeper for better form');
    } else if (exerciseType === 'pushups') {
        feedback.push('Maintain proper alignment');
        feedback.push('Full range of motion');
    }

    return feedback;
}

function generateSuggestions(exerciseType) {
    const suggestions = [
        'Focus on breathing',
        'Maintain steady pace',
        'Rest between sets if needed'
    ];

    return suggestions;
}

function getPlanPrice(planId) {
    const prices = {
        'pro': 19900,
        'pro-plus': 29900,
        'ultra-pro': 39900
    };

    return prices[planId] || 19900;
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 PoseAI Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
});

module.exports = app;
