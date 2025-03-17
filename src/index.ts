import express from 'express';
import authRoutes from './routes/authRoutes';
import workoutRoutes from './routes/workoutRoutes';
import mealPlanRoutes from './routes/mealPlanRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/api/gym', workoutRoutes);
app.use('/api/food', mealPlanRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
