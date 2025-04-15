// routes/sessionRoutes.ts
import express, { Response, Router } from 'express';
import pool from '../config/db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router: Router = express.Router();

//apply authentication middleware
router.use(authenticateToken);

//start a new workout session from a workout template
router.post('/start/:programId/:workoutId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId } = req.params;
    const user_id = req.user?.user_id;
    const { date, notes } = req.body;
    
    //check the program belongs to the user
    const programCheck = await pool.query(
      'SELECT * FROM program WHERE program_id = $1 AND user_id = $2',
      [programId, user_id]
    );
    
    if (programCheck.rows.length === 0) {
      res.status(404).json({ error: 'Program not found or unauthorized' });
      return;
    }
    
    //check the workout belongs to that program
    const workoutCheck = await pool.query(
      'SELECT * FROM workout WHERE workout_id = $1 AND program_id = $2',
      [workoutId, programId]
    );
    
    if (workoutCheck.rows.length === 0) {
      res.status(404).json({ error: 'Workout not found in this program' });
      return;
    }
    
    //create a new workout session
    const sessionDate = date ? new Date(date) : new Date();
    
    const sessionResult = await pool.query(
      'INSERT INTO workout_session (user_id, workout_id, date, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, workoutId, sessionDate, notes || '']
    );
    
    const session_id = sessionResult.rows[0].session_id;
    
    //get all exercises from the workout template
    const exercisesResult = await pool.query(
      'SELECT * FROM exercise WHERE workout_id = $1',
      [workoutId]
    );
    
    //create exercise logs for each exercise in the template
    for (const exercise of exercisesResult.rows) {
      await pool.query(
        'INSERT INTO exercise_log (session_id, exercise_id, sets, reps, weight, completed) VALUES ($1, $2, $3, $4, $5, $6)',
        [session_id, exercise.exercise_id, exercise.sets, exercise.reps, exercise.weight, false]
      );
    }
    
    //return the complete session with exercise logs
    const fullSessionResult = await pool.query(
      `SELECT s.*, w.workout_name, p.program_name,
         (SELECT json_agg(e)
          FROM (
            SELECT el.*, ex.exercise_name
            FROM exercise_log el
            JOIN exercise ex ON el.exercise_id = ex.exercise_id
            WHERE el.session_id = s.session_id
          ) e
         ) as exercises
       FROM workout_session s
       JOIN workout w ON s.workout_id = w.workout_id
       JOIN program p ON w.program_id = p.program_id
       WHERE s.session_id = $1`,
      [session_id]
    );
    
    res.status(201).json(fullSessionResult.rows[0]);
  } catch (err) {
    console.error('Error starting workout session:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

//update exercise log for a workout session
router.put('/log/:logId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { logId } = req.params;
    const user_id = req.user?.user_id;
    const { sets, reps, weight, completed } = req.body;
    
    //check exercise log belongs to user
    const logCheck = await pool.query(
      `SELECT el.* FROM exercise_log el
       JOIN workout_session s ON el.session_id = s.session_id
       WHERE el.log_id = $1 AND s.user_id = $2`,
      [logId, user_id]
    );
    
    if (logCheck.rows.length === 0) {
      res.status(404).json({ error: 'Exercise log not found or unauthorized' });
      return;
    }
    
    //update exercise log
    const updateFields = [];
    const values = [];
    let paramIndex = 1;
    
    if (sets !== undefined) {
      updateFields.push(`sets = $${paramIndex}`);
      values.push(sets);
      paramIndex++;
    }
    
    if (reps !== undefined) {
      updateFields.push(`reps = $${paramIndex}`);
      values.push(reps);
      paramIndex++;
    }
    
    if (weight !== undefined) {
      updateFields.push(`weight = $${paramIndex}`);
      values.push(weight);
      paramIndex++;
    }
    
    if (completed !== undefined) {
      updateFields.push(`completed = $${paramIndex}`);
      values.push(completed);
      paramIndex++;
    }
    
    if (updateFields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    
    values.push(logId);
    
    const result = await pool.query(
      `UPDATE exercise_log SET ${updateFields.join(', ')} WHERE log_id = $${paramIndex} RETURNING *`,
      values
    );
    
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error updating exercise log:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

//get all workout sessions for a user
router.get('/history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.user_id;
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT s.*, w.workout_name, p.program_name,
        (SELECT json_agg(e)
         FROM (
           SELECT el.*, ex.exercise_name
           FROM exercise_log el
           JOIN exercise ex ON el.exercise_id = ex.exercise_id
           WHERE el.session_id = s.session_id
         ) e
        ) as exercises
      FROM workout_session s
      JOIN workout w ON s.workout_id = w.workout_id
      JOIN program p ON w.program_id = p.program_id
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
    
    query += ` ORDER BY s.date DESC`;
    
    const result = await pool.query(query, queryParams);
    
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching workout sessions:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

//get a specific workout session with its exercise logs
router.get('/:sessionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const user_id = req.user?.user_id;
    
    const result = await pool.query(
      `SELECT s.*, w.workout_name, p.program_name,
        (SELECT json_agg(e)
         FROM (
           SELECT el.*, ex.exercise_name
           FROM exercise_log el
           JOIN exercise ex ON el.exercise_id = ex.exercise_id
           WHERE el.session_id = s.session_id
         ) e
        ) as exercises
      FROM workout_session s
      JOIN workout w ON s.workout_id = w.workout_id
      JOIN program p ON w.program_id = p.program_id
      WHERE s.session_id = $1 AND s.user_id = $2`,
      [sessionId, user_id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Workout session not found or unauthorized' });
      return;
    }
    
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching workout session:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;