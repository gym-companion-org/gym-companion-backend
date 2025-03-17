// routes/mealPlanRoutes.ts
import express, { Request, Response, Router } from 'express';
import pool from '../config/db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router: Router = express.Router();

// Apply authentication middleware to all meal plan routes
router.use(authenticateToken);

// 1. Create a new meal plan
router.post('/mealplans', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { meal_plan_name } = req.body;
    const user_id = req.user?.user_id;
    
    if (!meal_plan_name) {
      res.status(400).json({ error: 'Meal plan name is required' });
      return;
    }
    
    const result = await pool.query(
      'INSERT INTO mealplan (user_id, meal_plan_name) VALUES ($1, $2) RETURNING *',
      [user_id, meal_plan_name]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating meal plan:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Get all meal plans for a user
router.get('/mealplans', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.user_id;
    
    const result = await pool.query(
      'SELECT * FROM mealplan WHERE user_id = $1 ORDER BY date DESC',
      [user_id]
    );
    
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching meal plans:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Get a specific meal plan by ID
router.get('/mealplans/:planId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId } = req.params;
    const user_id = req.user?.user_id;
    
    // Check if meal plan exists and belongs to the user
    const planResult = await pool.query(
      'SELECT * FROM mealplan WHERE meal_plan_id = $1 AND user_id = $2',
      [planId, user_id]
    );
    
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Meal plan not found' });
      return;
    }
    
    // Get all meals for this plan
    const mealsResult = await pool.query(
      'SELECT * FROM meal WHERE meal_plan_id = $1',
      [planId]
    );
    
    // Return meal plan with its meals
    res.status(200).json({
      plan: planResult.rows[0],
      meals: mealsResult.rows
    });
  } catch (err) {
    console.error('Error fetching meal plan:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Add a meal to a plan
router.post('/mealplans/:planId/meals', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId } = req.params;
    const { meal_type, total_calories } = req.body;
    const user_id = req.user?.user_id;
    
    if (!meal_type) {
      res.status(400).json({ error: 'Meal type is required' });
      return;
    }
    
    // Verify meal plan belongs to user
    const planResult = await pool.query(
      'SELECT * FROM mealplan WHERE meal_plan_id = $1 AND user_id = $2',
      [planId, user_id]
    );
    
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Meal plan not found' });
      return;
    }
    
    // Add meal
    const result = await pool.query(
      'INSERT INTO meal (meal_plan_id, meal_type, total_calories) VALUES ($1, $2, $3) RETURNING *',
      [planId, meal_type, total_calories || 0]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating meal:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Get all meals for a plan
router.get('/mealplans/:planId/meals', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify meal plan belongs to user
    const planResult = await pool.query(
      'SELECT * FROM mealplan WHERE meal_plan_id = $1 AND user_id = $2',
      [planId, user_id]
    );
    
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Meal plan not found' });
      return;
    }
    
    // Get all meals for this plan
    const mealsResult = await pool.query(
      'SELECT * FROM meal WHERE meal_plan_id = $1',
      [planId]
    );
    
    res.status(200).json(mealsResult.rows);
  } catch (err) {
    console.error('Error fetching meals:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 6. Get a specific meal with foods
router.get('/mealplans/:planId/meals/:mealId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, mealId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify meal belongs to user's plan
    const mealCheck = await pool.query(
      `SELECT m.* FROM meal m
       JOIN mealplan p ON m.meal_plan_id = p.meal_plan_id
       WHERE m.meal_id = $1 AND p.meal_plan_id = $2 AND p.user_id = $3`,
      [mealId, planId, user_id]
    );
    
    if (mealCheck.rows.length === 0) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }
    
    // Get foods for this meal
    const foodsResult = await pool.query(
      'SELECT * FROM food WHERE meal_id = $1',
      [mealId]
    );
    
    res.status(200).json({
      meal: mealCheck.rows[0],
      foods: foodsResult.rows
    });
  } catch (err) {
    console.error('Error fetching meal:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. Add a food to a meal
router.post('/mealplans/:planId/meals/:mealId/foods', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, mealId } = req.params;
    const { food_name, calories, proteins, carbohydrates, fats } = req.body;
    const user_id = req.user?.user_id;
    
    if (!food_name) {
      res.status(400).json({ error: 'Food name is required' });
      return;
    }
    
    // Verify meal belongs to user's plan
    const mealCheck = await pool.query(
      `SELECT m.* FROM meal m
       JOIN mealplan p ON m.meal_plan_id = p.meal_plan_id
       WHERE m.meal_id = $1 AND p.meal_plan_id = $2 AND p.user_id = $3`,
      [mealId, planId, user_id]
    );
    
    if (mealCheck.rows.length === 0) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }
    
    // Start a transaction
    await pool.query('BEGIN');
    
    try {
      // Add food
      const result = await pool.query(
        'INSERT INTO food (meal_id, food_name, calories, proteins, carbohydrates, fats) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [mealId, food_name, calories || 0, proteins || 0, carbohydrates || 0, fats || 0]
      );
      
      // Update meal's total calories
      await pool.query(
        'UPDATE meal SET total_calories = total_calories + $1 WHERE meal_id = $2',
        [calories || 0, mealId]
      );
      
      // Commit transaction
      await pool.query('COMMIT');
      
      res.status(201).json(result.rows[0]);
    } catch (err) {
      // Rollback in case of error
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error creating food:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 8. Get all foods for a meal
router.get('/mealplans/:planId/meals/:mealId/foods', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, mealId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify meal belongs to user's plan
    const mealCheck = await pool.query(
      `SELECT m.* FROM meal m
       JOIN mealplan p ON m.meal_plan_id = p.meal_plan_id
       WHERE m.meal_id = $1 AND p.meal_plan_id = $2 AND p.user_id = $3`,
      [mealId, planId, user_id]
    );
    
    if (mealCheck.rows.length === 0) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }
    
    // Get foods for this meal
    const foodsResult = await pool.query(
      'SELECT * FROM food WHERE meal_id = $1',
      [mealId]
    );
    
    res.status(200).json(foodsResult.rows);
  } catch (err) {
    console.error('Error fetching foods:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 9. Get a specific food
router.get('/mealplans/:planId/meals/:mealId/foods/:foodId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, mealId, foodId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify food belongs to user through meal and plan
    const foodCheck = await pool.query(
      `SELECT f.* FROM food f
       JOIN meal m ON f.meal_id = m.meal_id
       JOIN mealplan p ON m.meal_plan_id = p.meal_plan_id
       WHERE f.food_id = $1 AND m.meal_id = $2 AND p.meal_plan_id = $3 AND p.user_id = $4`,
      [foodId, mealId, planId, user_id]
    );
    
    if (foodCheck.rows.length === 0) {
      res.status(404).json({ error: 'Food not found' });
      return;
    }
    
    res.status(200).json(foodCheck.rows[0]);
  } catch (err) {
    console.error('Error fetching food:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 10. Update a food
router.put('/mealplans/:planId/meals/:mealId/foods/:foodId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, mealId, foodId } = req.params;
    const { food_name, calories, proteins, carbohydrates, fats } = req.body;
    const user_id = req.user?.user_id;
    
    // Verify food belongs to user through meal and plan
    const foodCheck = await pool.query(
      `SELECT f.* FROM food f
       JOIN meal m ON f.meal_id = m.meal_id
       JOIN mealplan p ON m.meal_plan_id = p.meal_plan_id
       WHERE f.food_id = $1 AND m.meal_id = $2 AND p.meal_plan_id = $3 AND p.user_id = $4`,
      [foodId, mealId, planId, user_id]
    );
    
    if (foodCheck.rows.length === 0) {
      res.status(404).json({ error: 'Food not found' });
      return;
    }
    
    // Store old calories for updating meal totals
    const oldCalories = foodCheck.rows[0].calories;
    
    // Start a transaction
    await pool.query('BEGIN');
    
    try {
      // Update food
      const updateFields = [];
      const values = [];
      let queryIndex = 1;
      
      if (food_name !== undefined) {
        updateFields.push(`food_name = $${queryIndex}`);
        values.push(food_name);
        queryIndex++;
      }
      
      if (calories !== undefined) {
        updateFields.push(`calories = $${queryIndex}`);
        values.push(calories);
        queryIndex++;
      }
      
      if (proteins !== undefined) {
        updateFields.push(`proteins = $${queryIndex}`);
        values.push(proteins);
        queryIndex++;
      }
      
      if (carbohydrates !== undefined) {
        updateFields.push(`carbohydrates = $${queryIndex}`);
        values.push(carbohydrates);
        queryIndex++;
      }
      
      if (fats !== undefined) {
        updateFields.push(`fats = $${queryIndex}`);
        values.push(fats);
        queryIndex++;
      }
      
      if (updateFields.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }
      
      values.push(foodId);
      
      const result = await pool.query(
        `UPDATE food SET ${updateFields.join(', ')} WHERE food_id = $${queryIndex} RETURNING *`,
        values
      );
      
      const updatedFood = result.rows[0];
      
      // Update meal's total calories if calories changed
      if (calories !== undefined) {
        await pool.query(
          'UPDATE meal SET total_calories = total_calories - $1 + $2 WHERE meal_id = $3',
          [oldCalories, calories, mealId]
        );
      }
      
      // Commit transaction
      await pool.query('COMMIT');
      
      res.status(200).json(updatedFood);
    } catch (err) {
      // Rollback in case of error
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error updating food:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 11. Delete a food
router.delete('/mealplans/:planId/meals/:mealId/foods/:foodId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, mealId, foodId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify food belongs to user through meal and plan
    const foodCheck = await pool.query(
      `SELECT f.* FROM food f
       JOIN meal m ON f.meal_id = m.meal_id
       JOIN mealplan p ON m.meal_plan_id = p.meal_plan_id
       WHERE f.food_id = $1 AND m.meal_id = $2 AND p.meal_plan_id = $3 AND p.user_id = $4`,
      [foodId, mealId, planId, user_id]
    );
    
    if (foodCheck.rows.length === 0) {
      res.status(404).json({ error: 'Food not found' });
      return;
    }
    
    // Store calories for updating meal totals
    const calories = foodCheck.rows[0].calories;
    
    // Start a transaction
    await pool.query('BEGIN');
    
    try {
      // Delete food
      await pool.query(
        'DELETE FROM food WHERE food_id = $1',
        [foodId]
      );
      
      // Update meal's total calories
      await pool.query(
        'UPDATE meal SET total_calories = total_calories - $1 WHERE meal_id = $2',
        [calories, mealId]
      );
      
      // Commit transaction
      await pool.query('COMMIT');
      
      res.status(200).json({ message: 'Food deleted successfully' });
    } catch (err) {
      // Rollback in case of error
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error deleting food:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 12. Delete a meal and all its foods
router.delete('/mealplans/:planId/meals/:mealId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, mealId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify meal belongs to user's plan
    const mealCheck = await pool.query(
      `SELECT m.* FROM meal m
       JOIN mealplan p ON m.meal_plan_id = p.meal_plan_id
       WHERE m.meal_id = $1 AND p.meal_plan_id = $2 AND p.user_id = $3`,
      [mealId, planId, user_id]
    );
    
    if (mealCheck.rows.length === 0) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }
    
    // No need for explicit deletion of foods due to ON DELETE CASCADE
    await pool.query(
      'DELETE FROM meal WHERE meal_id = $1',
      [mealId]
    );
    
    res.status(200).json({ message: 'Meal and all its foods deleted successfully' });
  } catch (err) {
    console.error('Error deleting meal:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 13. Delete a meal plan and all its meals and foods
router.delete('/mealplans/:planId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId } = req.params;
    const user_id = req.user?.user_id;
    
    // Verify meal plan belongs to user
    const planResult = await pool.query(
      'SELECT * FROM mealplan WHERE meal_plan_id = $1 AND user_id = $2',
      [planId, user_id]
    );
    
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Meal plan not found' });
      return;
    }
    
    // No need for explicit deletion of meals and foods due to ON DELETE CASCADE
    await pool.query(
      'DELETE FROM mealplan WHERE meal_plan_id = $1',
      [planId]
    );
    
    res.status(200).json({ message: 'Meal plan and all its meals and foods deleted successfully' });
  } catch (err) {
    console.error('Error deleting meal plan:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;