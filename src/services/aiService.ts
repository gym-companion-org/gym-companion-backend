// services/aiService.ts
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface WorkoutPlanRequest {
  height: number;
  weight: number;
  age: number;
  gender: string;
  fitnessLevel: string; // beginner, intermediate, advanced
  fitnessGoals: string[]; // e.g. ["weight loss", "muscle gain", "endurance"]
  workoutFrequency: number; // days per week
  preferredExercises?: string[];
  healthConditions?: string[];
  equipment?: string[]; // available equipment
}

export interface MealPlanRequest {
  height: number;
  weight: number;
  age: number;
  gender: string;
  fitnessGoals: string[];
  dietaryPreferences?: string[]; // e.g. ["vegetarian", "vegan", "keto"]
  allergies?: string[];
  mealsPerDay: number;
  calorieTarget?: number;
}

export async function generateWorkoutPlan(request: WorkoutPlanRequest): Promise<string> {
  const prompt = `
    Create a personalized workout program based on the following information:
    
    User Information:
    - Height: ${request.height} cm
    - Weight: ${request.weight} kg
    - Age: ${request.age}
    - Gender: ${request.gender}
    - Fitness Level: ${request.fitnessLevel}
    - Fitness Goals: ${request.fitnessGoals.join(', ')}
    - Workout Frequency: ${request.workoutFrequency} days per week
    ${request.preferredExercises ? '- Preferred Exercises: ' + request.preferredExercises.join(', ') : ''}
    ${request.healthConditions ? '- Health Conditions: ' + request.healthConditions.join(', ') : ''}
    ${request.equipment ? '- Available Equipment: ' + request.equipment.join(', ') : ''}
    
    Create a detailed workout program that includes:
    1. A weekly schedule
    2. For each workout (day), include:
       - Specific exercises
       - Number of sets and repetitions
       - Include a "recommendedWeight" number field for each exercise.
 
    
    **IMPORTANT OUTPUT RULES**
    - Return only **valid JSON**
    - Do **not** include markdown (e.g., \`\`\`json or \`\`\`)
    - Do **not** include comments (like // this is ...)
    - Do **not** include explanations outside of the JSON
    - The JSON must exactly match this structure:
    {
      "title": "Program title",
      "description": "Brief program description",
      "workoutFrequency": number,
      "workouts": [
        {
          "name": "Workout name",
          "day": "Day of week",
          "exercises": [
            {
              "name": "Exercise name",
              "sets": number,
              "reps": number or "rep range (e.g., 8-12)",
              "weight": "recommended weight"
            }
          ],
        }
      ],
    }
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14",
      messages: [
        {
          role: "system",
          content: "You are a certified personal trainer specialized in creating personalized workout plans."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 20000,
    });

    return response.choices[0].message.content || "";
  } catch (error) {
    console.error('Error generating workout plan:', error);
    throw new Error('Failed to generate workout plan');
  }
}

export async function generateMealPlan(request: MealPlanRequest): Promise<string> {
  const prompt = `
    Create a personalized meal plan based on the following information:
    
    User Information:
    - Height: ${request.height} cm
    - Weight: ${request.weight} kg
    - Age: ${request.age}
    - Gender: ${request.gender}
    - Fitness Goals: ${request.fitnessGoals.join(", ")}
    - Meals Per Day: ${request.mealsPerDay}
    ${request.dietaryPreferences ? "- Dietary Preferences: " + request.dietaryPreferences.join(", ") : ""}
    ${request.allergies ? "- Allergies: " + request.allergies.join(", ") : ""}
    ${request.calorieTarget ? "- Daily Calorie Target: " + request.calorieTarget : ""}
    
    Create a detailed 3-day meal plan that includes:
    1. For each day, provide all meals (${request.mealsPerDay} per day)
    2. For each meal, include:
       - Name of the meal
       - Type (breakfast/lunch/dinner/snack)
       - Ingredients with quantities
       - Total meal macronutrient breakdown (protein, carbs, fats)
       - Total meal calorie count
    
    VERY IMPORTANT: For EACH ingredient, you MUST include its individual nutritional information in a "nutrition" object with these properties: calories, protein, carbs, fats.
    
    IMPORTANT OUTPUT RULES
    - Return only valid JSON
    - Do not include markdown (e.g., \`\`\`json or \`\`\`)
    - Do not include comments (like // this is ...)
    - Do not include explanations outside of the JSON
    
    Format the response in JSON with the structure:
    {
      "title": "Meal plan title",
      "description": "Brief meal plan description",
      "dailyCalories": number,
      "days": [
        {
          "day": "Day of week",
          "meals": [
            {
              "name": "Meal name",
              "type": "breakfast/lunch/dinner/snack",
              "totalCalories": "(food calories added up total)",
              "ingredients": [
                {
                  "name": "Ingredient name",
                  "quantity": "amount with unit",
                  "nutrition": {
                    "calories": number,
                    "protein": number,
                    "carbs": number,
                    "fats": number
                  }
                }
              ],
            }
          ],
          "totalNutrition": {
            "calories": number,
            "protein": number,
            "carbs": number,
            "fats": number
          }
        }
      ],
    }
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14",
      messages: [
        {
          role: "system",
          content: "You are a certified nutritionist specialized in creating personalized meal plans. ALWAYS include nutrition information for EACH ingredient. Return only valid JSON without markdown formatting."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 20000,
    });

    return response.choices[0].message.content || "";
  } catch (error) {
    console.error('Error generating meal plan:', error);
    throw new Error('Failed to generate meal plan');
  }
}