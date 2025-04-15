// Updated routes/progressRoutes.ts
import express, { Response, Router } from 'express';
import pool from '../config/db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router: Router = express.Router();

//apply authentication middleware to all progress routes
router.use(authenticateToken);

//get workout history for a user (with filtering options)
router.get('/history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.user_id;
    const { startDate, endDate, programId } = req.query;
    
    let query = `
      SELECT s.session_id, s.date, w.workout_id, w.workout_name, 
             p.program_id, p.program_name, 
             el.log_id, el.sets, el.reps, el.weight, el.completed,
             ex.exercise_id, ex.exercise_name
      FROM workout_session s
      JOIN workout w ON s.workout_id = w.workout_id
      JOIN program p ON w.program_id = p.program_id
      JOIN exercise_log el ON s.session_id = el.session_id
      JOIN exercise ex ON el.exercise_id = ex.exercise_id
      WHERE s.user_id = $1
    `;
    
    const queryParams: any[] = [user_id];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND s.date >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND s.date <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }
    
    if (programId) {
      query += ` AND p.program_id = $${paramIndex}`;
      queryParams.push(programId);
      paramIndex++;
    }
    
    query += ` ORDER BY s.date DESC, s.session_id, el.log_id`;
    
    const result = await pool.query(query, queryParams);
    
    //group results by session, workout and exercise for better organisation
    const historyData = result.rows.reduce((acc: any, row: any) => {
      //find or create session
      let session = acc.find((s: any) => s.session_id === row.session_id);
      if (!session) {
        session = {
          session_id: row.session_id,
          date: row.date,
          program_id: row.program_id,
          program_name: row.program_name,
          workout_id: row.workout_id,
          workout_name: row.workout_name,
          exercises: []
        };
        acc.push(session);
      }
      const parsedReps = parseFloat(row.reps);
      const parsedWeight = parseFloat(row.weight);
      //add exercise log
      session.exercises.push({
        log_id: row.log_id,
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        sets: row.sets,
        reps: row.reps,
        weight: row.weight,
        completed: row.completed,
        volume: row.sets * (isNaN(parsedReps) ? 0 : parsedReps) * (isNaN(parsedWeight) ? 0 : parsedWeight)
        
      });
      
      return acc;
    }, []);
    
    res.status(200).json(historyData);
  } catch (err) {
    console.error('Error fetching workout history:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

//get exercise progression over time
router.get('/progression/:exerciseName', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { exerciseName } = req.params;
    const user_id = req.user?.user_id;
    
    const result = await pool.query(`
      SELECT el.log_id, el.sets, el.reps, el.weight, el.completed,
             ex.exercise_name, s.date
      FROM exercise_log el
      JOIN exercise ex ON el.exercise_id = ex.exercise_id
      JOIN workout_session s ON el.session_id = s.session_id
      WHERE s.user_id = $1 AND ex.exercise_name = $2 AND el.completed = true
      ORDER BY s.date ASC
    `, [user_id, exerciseName]);
    
    //transform data for progression tracking
    const progressionData = result.rows.map((row: any) => ({
      date: row.date,
      log_id: row.log_id,
      sets: row.sets,
      reps: row.reps,
      weight: row.weight,
      volume: row.sets * row.reps * row.weight //calculate total volume
    }));
    
    res.status(200).json(progressionData);
  } catch (err) {
    console.error('Error fetching exercise progression:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

//get personal records query
router.get('/personal-records', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user_id = req.user?.user_id;
      
      //get the maximum weight lifted for each exercise
      const maxWeightResult = await pool.query(`
        WITH ranked_weights AS (
          SELECT 
            ex.exercise_name, 
            el.weight,
            s.date as record_date,
            ROW_NUMBER() OVER (PARTITION BY ex.exercise_name ORDER BY el.weight DESC) as rank
          FROM exercise_log el
          JOIN exercise ex ON el.exercise_id = ex.exercise_id
          JOIN workout_session s ON el.session_id = s.session_id
          WHERE s.user_id = $1 AND el.completed = true
        )
        SELECT exercise_name, weight as max_weight, record_date
        FROM ranked_weights
        WHERE rank = 1
        ORDER BY max_weight DESC
      `, [user_id]);
      
      //get the maximum volume (sets * reps * weight) for each exercise
      const maxVolumeResult = await pool.query(`
        WITH ranked_volumes AS (
          SELECT 
            ex.exercise_name, 
            (el.sets * el.reps * el.weight) as volume,
            s.date as record_date,
            ROW_NUMBER() OVER (PARTITION BY ex.exercise_name ORDER BY (el.sets * el.reps * el.weight) DESC) as rank
          FROM exercise_log el
          JOIN exercise ex ON el.exercise_id = ex.exercise_id
          JOIN workout_session s ON el.session_id = s.session_id
          WHERE s.user_id = $1 AND el.completed = true
        )
        SELECT exercise_name, volume as max_volume, record_date
        FROM ranked_volumes
        WHERE rank = 1
        ORDER BY max_volume DESC
      `, [user_id]);
      
      //combine results
      const personalRecords = {
        maxWeight: maxWeightResult.rows,
        maxVolume: maxVolumeResult.rows
      };
      
      res.status(200).json(personalRecords);
    } catch (err) {
      console.error('Error fetching personal records:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

//get workout frequency statistics
router.get('/frequency-stats', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.user_id;
    
    //get workout frequency by month
    const monthlyFrequency = await pool.query(`
      SELECT 
        DATE_TRUNC('month', s.date) as month,
        COUNT(DISTINCT s.date) as workout_days
      FROM workout_session s
      WHERE s.user_id = $1
      GROUP BY DATE_TRUNC('month', s.date)
      ORDER BY month
    `, [user_id]);
    
    //get most frequent exercises
    const frequentExercises = await pool.query(`
      SELECT ex.exercise_name, COUNT(*) as frequency
      FROM exercise_log el
      JOIN exercise ex ON el.exercise_id = ex.exercise_id
      JOIN workout_session s ON el.session_id = s.session_id
      WHERE s.user_id = $1 AND el.completed = true
      GROUP BY ex.exercise_name
      ORDER BY frequency DESC
      LIMIT 10
    `, [user_id]);
    
    const stats = {
      monthlyFrequency: monthlyFrequency.rows,
      frequentExercises: frequentExercises.rows
    };
    
    res.status(200).json(stats);
  } catch (err) {
    console.error('Error fetching frequency statistics:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;