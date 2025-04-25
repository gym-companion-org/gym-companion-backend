import express from 'express';
import authRoutes from './routes/authRoutes';
import workoutRoutes from './routes/workoutRoutes';
import mealPlanRoutes from './routes/mealPlanRoutes';
import progressRoutes from './routes/progressRoutes';
import sessionRoutes from './routes/sessionRoutes';
import aiRoutes from './routes/aiRoutes';
import cors from 'cors'; // Add this import
import dotenv from 'dotenv';

dotenv.config();

const app = express();

//CORS middleware before other middleware
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/api/gym', workoutRoutes);
app.use('/api/food', mealPlanRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/ai', aiRoutes);

// TEMPORARY DEBUG ENDPOINT
app.get('/debug/config', (req, res) => {
  res.json({
    auth0Domain: process.env.AUTH0_DOMAIN,
    auth0Audience: process.env.AUTH0_AUDIENCE,
    nodeEnv: process.env.NODE_ENV,
    appPort: process.env.PORT || 5000
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
