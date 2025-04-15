// routes/aiRoutes.ts
import express, { Response, Router } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { generateWorkoutPlan, generateMealPlan, WorkoutPlanRequest, MealPlanRequest } from '../services/aiService';
import pool from '../config/db';
import { jsonrepair } from 'jsonrepair';


const router: Router = express.Router();

//apply auth middleware
router.use(authenticateToken);

function extractCleanJson(response: string): string {
    //get whats inside ```json ... ``` or fallback to full string
    const match = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const rawJson = match ? match[1] : response;
  
    //remove jsstyle comments using regex
    const noComments = rawJson.replace(/^\s*\/\/.*$/gm, '');
  
    return noComments.trim();
  }
  

  

//generate workout plan route
router.post('/workout-plan', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.user_id;
    const planRequest: WorkoutPlanRequest = req.body;
    
    if (!planRequest.height || !planRequest.weight || !planRequest.age || !planRequest.gender || 
        !planRequest.fitnessLevel || !planRequest.fitnessGoals || !planRequest.workoutFrequency) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }
    
    //generate the workout plan
    const planResponse = await generateWorkoutPlan(planRequest);
    
    try {
      //parse response to check valid json
      const cleanedResponse = extractCleanJson(planResponse);
      const fixedJson = jsonrepair(cleanedResponse);
      const planData = JSON.parse(fixedJson);

      console.log("Raw AI Response:", planResponse);

      
      //start
      await pool.query('BEGIN');
      
      //save the program
      const programResult = await pool.query(
        'INSERT INTO program (user_id, program_name, date) VALUES ($1, $2, $3) RETURNING *',
        [user_id, planData.title || 'Custom Workout Program', new Date()]
      );
      
      const program_id = programResult.rows[0].program_id;
      
      //save workouts
      for (const workout of planData.workouts) {
        const workoutResult = await pool.query(
          'INSERT INTO workout (program_id, workout_name) VALUES ($1, $2) RETURNING *',
          [program_id, workout.name || `Workout ${workout.day || ''}`]
        );
        
        const workout_id = workoutResult.rows[0].workout_id;
        
        for (const exercise of workout.exercises) {
          const sets = exercise.sets || 3;
          const reps = typeof exercise.reps === 'string' ? exercise.reps : String(exercise.reps || '');
          
          //try to extract recommendedWeight from notes
          let weight = '';
          if (typeof exercise.weight === 'string') {
            weight = exercise.weight;
          } else if (typeof exercise.notes === 'string') {
            const match = exercise.notes.match(/recommendedWeight:\s*([^\n]+)/i);
            weight = match ? match[1].trim() : '';
          } else {
            weight = String(exercise.weight || '');
          }
        
          await pool.query(
            'INSERT INTO exercise (workout_id, exercise_name, sets, reps, weight) VALUES ($1, $2, $3, $4, $5)',
            [
              workout_id,
              exercise.name || 'Unnamed Exercise',
              sets,
              reps,
              weight
            ]
          );
        }
      }        
      
      //commit
      await pool.query('COMMIT');
      
      //return success and program ID
      res.status(201).json({
        message: 'Workout plan generated and saved successfully',
        program_id,
        program_name: planData.title,
        description: planData.description
      });
    } catch (jsonError) {
      //ff the response is nott valid json, roll and return raw response
      if (pool) await pool.query('ROLLBACK');
      console.error('Error parsing AI response:', jsonError);
      res.status(200).json({ 
        message: 'Workout plan generated but not saved (invalid format)',
        rawResponse: planResponse
      }); //this is usually a token issue 
    }
  } catch (err) {
    console.error('Error generating workout plan:', err);
    //rollback if there was a transaction
    try {
      if (pool) await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error rolling back transaction:', rollbackErr);
    }
    res.status(500).json({ 
      error: 'Server error while generating workout plan',
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

//generate a meal plan route
router.post('/meal-plan', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.user_id;
    const planRequest: MealPlanRequest = req.body;
    
    if (!planRequest.height || !planRequest.weight || !planRequest.age || !planRequest.gender || 
        !planRequest.fitnessGoals || !planRequest.mealsPerDay) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }
    
    //generate the meal plan
    const planResponse = await generateMealPlan(planRequest);
    // console.log("Raw AI Response:", planResponse);

    
    try {
      //parse response to ensure valid json
      const cleanedResponse = extractCleanJson(planResponse);
      const planData = JSON.parse(cleanedResponse);

      // console.log("First day meals:", JSON.stringify(planData.days?.[0]?.meals, null, 2));
      // console.log("First meal ingredients:", JSON.stringify(planData.days?.[0]?.meals?.[0]?.ingredients, null, 2));
      
      //start
      await pool.query('BEGIN');
      
      //save meal plan
      const mealPlanResult = await pool.query(
        'INSERT INTO mealplan (user_id, meal_plan_name, date) VALUES ($1, $2, $3) RETURNING *',
        [user_id, planData.title || 'Custom Meal Plan', new Date()]
      );
      
      const meal_plan_id = mealPlanResult.rows[0].meal_plan_id;
      
      //save each days meals 
      if (planData.days && Array.isArray(planData.days)) {
        for (const day of planData.days) {
          if (day.meals && Array.isArray(day.meals)) {
            for (const meal of day.meals) {
              //calculate total calories for the meal
              const calories = meal.nutritionalInfo?.calories || 0;
              
              //insert meal
              const mealResult = await pool.query(
                'INSERT INTO meal (meal_plan_id, meal_type, total_calories) VALUES ($1, $2, $3) RETURNING *',
                [meal_plan_id, meal.type || 'meal', calories]
              );
              
              const meal_id = mealResult.rows[0].meal_id;
              
              //save each food item
              if (meal.ingredients && Array.isArray(meal.ingredients)) {
                for (const ingredient of meal.ingredients) {
                  //get nutritional info from the AI response
                  let calories = 0;
                  let proteins = 0;
                  let carbs = 0;
                  let fats = 0;

                  //look for nutrition info in the correct location
                  if (ingredient.nutrition) {
                    calories = ingredient.nutrition.calories || 0;
                    proteins = ingredient.nutrition.protein || 0;
                    carbs = ingredient.nutrition.carbs || 0;
                    fats = ingredient.nutrition.fats || 0;
                  }

                  //insert food with nutritional info
                  await pool.query(
                    'INSERT INTO food (meal_id, food_name, calories, proteins, carbohydrates, fats) VALUES ($1, $2, $3, $4, $5, $6)',
                    [
                      meal_id,
                      ingredient.name || 'Unnamed Ingredient',
                      calories,
                      proteins,
                      carbs,
                      fats
                    ]
                  );
                }
              }
            }
          }
        }
      }
      
      //commit the transaction
      await pool.query('COMMIT');
      
      //return success and meal plan ID
      res.status(201).json({
        message: 'Meal plan generated and saved successfully',
        meal_plan_id,
        meal_plan_name: planData.title,
        description: planData.description
      });
    } catch (jsonError) {
      //if the response is not valid json, rollback and return the raw response
      if (pool) await pool.query('ROLLBACK');
      console.error('Error parsing AI response:', jsonError);
      res.status(200).json({ 
        message: 'Meal plan generated but not saved (invalid format)',
        rawResponse: planResponse
      });
    }
  } catch (err) {
    console.error('Error generating meal plan:', err);
    //rollback if there was a transaction
    try {
      if (pool) await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error rolling back transaction:', rollbackErr);
    }
    res.status(500).json({ 
      error: 'Server error while generating meal plan',
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

export default router;