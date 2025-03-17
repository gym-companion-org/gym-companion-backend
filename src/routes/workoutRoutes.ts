// routes/workoutRoutes.ts
import express, { Request, Response, Router } from 'express';
import pool from '../config/db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router: Router = express.Router();

// Apply authentication middleware to all workout routes
router.use(authenticateToken);

// 1. Create a new program
router.post('/programs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { program_name } = req.body;
    const user_id = req.user?.user_id;
    
    if (!program_name) {
      res.status(400).json({ error: 'Program name is required' });
      return;
    }

    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const result = await pool.query(
      'INSERT INTO program (user_id, program_name, date) VALUES ($1, $2, $3) RETURNING *',
      [user_id, program_name, currentDate]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating program:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Get all programs for a user
router.get('/programs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.user_id;
    
    const result = await pool.query(
      'SELECT * FROM program WHERE user_id = $1 ORDER BY date DESC',
      [user_id]
    );
    
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching programs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Get a specific program by ID
router.get('/programs/:programId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId } = req.params;
    const user_id = req.user?.user_id;
    
    // Check if program exists and belongs to the user
    const programResult = await pool.query(
      'SELECT * FROM program WHERE program_id = $1 AND user_id = $2',
      [programId, user_id]
    );
    
    if (programResult.rows.length === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    
    // Get all workouts for this program
    const workoutsResult = await pool.query(
      'SELECT * FROM workout WHERE program_id = $1',
      [programId]
    );
    
    // Return program with its workouts
    res.status(200).json({
      program: programResult.rows[0],
      workouts: workoutsResult.rows
    });
  } catch (err) {
    console.error('Error fetching program:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Add a workout to a program
router.post('/programs/:programId/workouts', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId } = req.params;
    const { workout_name } = req.body;
    const user_id = req.user?.user_id;
    
    if (!workout_name) {
      res.status(400).json({ error: 'Workout name is required' });
      return;
    }
    
    // Verify program belongs to user
    const programResult = await pool.query(
      'SELECT * FROM program WHERE program_id = $1 AND user_id = $2',
      [programId, user_id]
    );
    
    if (programResult.rows.length === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    
    // Add workout
    const result = await pool.query(
      'INSERT INTO workout (program_id, workout_name) VALUES ($1, $2) RETURNING *',
      [programId, workout_name]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating workout:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Get all workouts for a program
router.get('/programs/:programId/workouts', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify program belongs to user
    const programResult = await pool.query(
      'SELECT * FROM program WHERE program_id = $1 AND user_id = $2',
      [programId, user_id]
    );
    
    if (programResult.rows.length === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    
    // Get all workouts for this program
    const workoutsResult = await pool.query(
      'SELECT * FROM workout WHERE program_id = $1',
      [programId]
    );
    
    res.status(200).json(workoutsResult.rows);
  } catch (err) {
    console.error('Error fetching workouts:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 6. Get a specific workout with exercises
router.get('/programs/:programId/workouts/:workoutId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify workout belongs to user's program
    const workoutCheck = await pool.query(
      `SELECT w.* FROM workout w
       JOIN program p ON w.program_id = p.program_id
       WHERE w.workout_id = $1 AND p.program_id = $2 AND p.user_id = $3`,
      [workoutId, programId, user_id]
    );
    
    if (workoutCheck.rows.length === 0) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    
    // Get exercises for this workout
    const exercisesResult = await pool.query(
      'SELECT * FROM exercise WHERE workout_id = $1',
      [workoutId]
    );
    
    res.status(200).json({
      workout: workoutCheck.rows[0],
      exercises: exercisesResult.rows
    });
  } catch (err) {
    console.error('Error fetching workout:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. Add an exercise to a workout
router.post('/programs/:programId/workouts/:workoutId/exercises', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId } = req.params;
    const { exercise_name, sets, reps, weight } = req.body;
    const user_id = req.user?.user_id;
    
    if (!exercise_name) {
      res.status(400).json({ error: 'Exercise name is required' });
      return;
    }
    
    // Verify workout belongs to user's program
    const workoutCheck = await pool.query(
      `SELECT w.* FROM workout w
       JOIN program p ON w.program_id = p.program_id
       WHERE w.workout_id = $1 AND p.program_id = $2 AND p.user_id = $3`,
      [workoutId, programId, user_id]
    );
    
    if (workoutCheck.rows.length === 0) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    
    // Add exercise
    const result = await pool.query(
      'INSERT INTO exercise (workout_id, exercise_name, sets, reps, weight) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [workoutId, exercise_name, sets || 0, reps || 0, weight || 0]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating exercise:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 8. Get all exercises for a workout
router.get('/programs/:programId/workouts/:workoutId/exercises', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify workout belongs to user's program
    const workoutCheck = await pool.query(
      `SELECT w.* FROM workout w
       JOIN program p ON w.program_id = p.program_id
       WHERE w.workout_id = $1 AND p.program_id = $2 AND p.user_id = $3`,
      [workoutId, programId, user_id]
    );
    
    if (workoutCheck.rows.length === 0) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    
    // Get exercises for this workout
    const exercisesResult = await pool.query(
      'SELECT * FROM exercise WHERE workout_id = $1',
      [workoutId]
    );
    
    res.status(200).json(exercisesResult.rows);
  } catch (err) {
    console.error('Error fetching exercises:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 9. Get a specific exercise
router.get('/programs/:programId/workouts/:workoutId/exercises/:exerciseId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId, exerciseId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify exercise belongs to user through workout and program
    const exerciseCheck = await pool.query(
      `SELECT e.* FROM exercise e
       JOIN workout w ON e.workout_id = w.workout_id
       JOIN program p ON w.program_id = p.program_id
       WHERE e.exercise_id = $1 AND w.workout_id = $2 AND p.program_id = $3 AND p.user_id = $4`,
      [exerciseId, workoutId, programId, user_id]
    );
    
    if (exerciseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }
    
    res.status(200).json(exerciseCheck.rows[0]);
  } catch (err) {
    console.error('Error fetching exercise:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 10. Update an exercise (for tracking progress)
router.put('/programs/:programId/workouts/:workoutId/exercises/:exerciseId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId, exerciseId } = req.params;
    const { sets, reps, weight } = req.body;
    const user_id = req.user?.user_id;
    
    // Verify exercise belongs to user through workout and program
    const exerciseCheck = await pool.query(
      `SELECT e.* FROM exercise e
       JOIN workout w ON e.workout_id = w.workout_id
       JOIN program p ON w.program_id = p.program_id
       WHERE e.exercise_id = $1 AND w.workout_id = $2 AND p.program_id = $3 AND p.user_id = $4`,
      [exerciseId, workoutId, programId, user_id]
    );
    
    if (exerciseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }
    
    // Update exercise
    const updateFields = [];
    const values = [];
    let queryIndex = 1;
    
    if (sets !== undefined) {
      updateFields.push(`sets = $${queryIndex}`);
      values.push(sets);
      queryIndex++;
    }
    
    if (reps !== undefined) {
      updateFields.push(`reps = $${queryIndex}`);
      values.push(reps);
      queryIndex++;
    }
    
    if (weight !== undefined) {
      updateFields.push(`weight = $${queryIndex}`);
      values.push(weight);
      queryIndex++;
    }
    
    if (updateFields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    
    values.push(exerciseId);
    
    const result = await pool.query(
      `UPDATE exercise SET ${updateFields.join(', ')} WHERE exercise_id = $${queryIndex} RETURNING *`,
      values
    );
    
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error updating exercise:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 11. Delete an exercise
router.delete('/programs/:programId/workouts/:workoutId/exercises/:exerciseId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId, exerciseId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify exercise belongs to user through workout and program
    const exerciseCheck = await pool.query(
      `SELECT e.* FROM exercise e
       JOIN workout w ON e.workout_id = w.workout_id
       JOIN program p ON w.program_id = p.program_id
       WHERE e.exercise_id = $1 AND w.workout_id = $2 AND p.program_id = $3 AND p.user_id = $4`,
      [exerciseId, workoutId, programId, user_id]
    );
    
    if (exerciseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }
    
    // Delete exercise
    await pool.query(
      'DELETE FROM exercise WHERE exercise_id = $1',
      [exerciseId]
    );
    
    res.status(200).json({ message: 'Exercise deleted successfully' });
  } catch (err) {
    console.error('Error deleting exercise:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 12. Delete a workout and all its exercises
router.delete('/programs/:programId/workouts/:workoutId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId, workoutId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify workout belongs to user's program
    const workoutCheck = await pool.query(
      `SELECT w.* FROM workout w
       JOIN program p ON w.program_id = p.program_id
       WHERE w.workout_id = $1 AND p.program_id = $2 AND p.user_id = $3`,
      [workoutId, programId, user_id]
    );
    
    if (workoutCheck.rows.length === 0) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    
    // Delete all exercises in this workout first
    await pool.query(
      'DELETE FROM exercise WHERE workout_id = $1',
      [workoutId]
    );
    
    // Delete workout
    await pool.query(
      'DELETE FROM workout WHERE workout_id = $1',
      [workoutId]
    );
    
    res.status(200).json({ message: 'Workout and all its exercises deleted successfully' });
  } catch (err) {
    console.error('Error deleting workout:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 13. Delete a program and all its workouts and exercises
router.delete('/programs/:programId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { programId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify program belongs to user
    const programResult = await pool.query(
      'SELECT * FROM program WHERE program_id = $1 AND user_id = $2',
      [programId, user_id]
    );
    
    if (programResult.rows.length === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    
    // Start a transaction for cascading deletion
    await pool.query('BEGIN');
    
    try {
      // Get all workouts for this program
      const workoutsResult = await pool.query(
        'SELECT workout_id FROM workout WHERE program_id = $1',
        [programId]
      );
      
      // Delete all exercises in all workouts
      for (const workout of workoutsResult.rows) {
        await pool.query(
          'DELETE FROM exercise WHERE workout_id = $1',
          [workout.workout_id]
        );
      }
      
      // Delete all workouts in this program
      await pool.query(
        'DELETE FROM workout WHERE program_id = $1',
        [programId]
      );
      
      // Delete the program
      await pool.query(
        'DELETE FROM program WHERE program_id = $1',
        [programId]
      );
      
      // Commit the transaction
      await pool.query('COMMIT');
      
      res.status(200).json({ message: 'Program and all its workouts and exercises deleted successfully' });
    } catch (err) {
      // Rollback the transaction if any errors occur
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error deleting program:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;