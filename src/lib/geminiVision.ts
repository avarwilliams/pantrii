/**
 * Extract recipe data from images using Gemini 1.5 Flash with vision capabilities
 */

interface RecipeSchema {
  recipe_name: string;
  author: string | null;
  description: string | null;
  link: string | null;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  ingredients: Array<{
    quantity: string;
    unit: string;
    item: string;
    notes: string;
  }>;
  instructions: Array<{
    step_number: number;
    text: string;
  }>;
  nutrition: {
    calories: number | null;
    protein_g: number | null;
    fat_g: number | null;
    carbs_g: number | null;
  } | null;
  nutrition_ai_estimated?: boolean;
  nutrition_servings_used?: number | null;
}

/**
 * Convert image buffer to base64 for Gemini API
 */
function imageToBase64(buffer: Buffer, mimeType: string): string {
  return buffer.toString('base64');
}

/**
 * Extract recipe from image or PDF using Gemini 2.5 Flash
 * Supports: images (PNG, JPEG) and PDFs directly
 */
export async function extractRecipeFromImage(
  fileBuffer: Buffer,
  mimeType: string = 'image/png'
): Promise<RecipeSchema & { nutrition_ai_estimated?: boolean; nutrition_servings_used?: number | null }> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
  }

  const base64File = fileBuffer.toString('base64');

  const schemaPrompt = `Extract the recipe details from this ${mimeType.includes('pdf') ? 'PDF document' : 'image'}. Follow this JSON schema exactly. If a field is missing or cannot be determined, return null for that field.

Required JSON Schema:
{
  "recipe_name": "string",
  "author": "string" or null,
  "description": "string" or null,
  "link": "string" or null,
  "servings": integer or null,
  "prep_time_minutes": integer or null,
  "cook_time_minutes": integer or null,
  "ingredients": [
    {
      "quantity": "string",
      "unit": "string",
      "item": "string",
      "notes": "string"
    }
  ],
  "instructions": [
    {
      "step_number": integer,
      "text": "string"
    }
  ],
  "nutrition": {
    "calories": integer or null,
    "protein_g": integer or null,
    "fat_g": integer or null,
    "carbs_g": integer or null
  } or null
}

CRITICAL INSTRUCTIONS:
- Extract ALL ingredients with their quantities, units, and items. Each ingredient must have at least "item" field.
- Extract ALL instructions/directions/steps from the recipe. Instructions are REQUIRED - look for numbered steps, "Instructions:", "Directions:", "Method:", or any cooking steps.
- Each instruction must have a "step_number" (1, 2, 3, etc.) and "text" (the actual instruction text).
- If you see cooking steps, directions, or instructions in the image, you MUST include them in the instructions array.
- Extract the author name if present (e.g., "By John Smith", "Recipe by...", "Author:...").
- Extract the description if present (usually a brief introduction or summary of the recipe).
- Extract the recipe link/URL if present (e.g., "Source: https://...", "From: www.example.com").
- Extract nutrition information if explicitly provided in the recipe. If nutrition information is not visible in the document, set nutrition to null (it will be estimated separately based on ingredients).
- Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations
- Start your response with { and end with }
- If a field cannot be determined, use null (not empty string or 0)
- Do not include any text before or after the JSON object
- The instructions array is REQUIRED - if no instructions are found, return an empty array []`;

  try {
    // Use gemini-2.5-flash (recommended for speed/free tier, matches Python SDK)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: schemaPrompt,
                },
                {
                  inline_data: {
                    mime_type: mimeType, // Can be image/png, image/jpeg, or application/pdf
                    data: base64File,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8000, // Increased to prevent truncation of large recipes
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      
      // Handle quota/rate limit errors
      if (response.status === 429) {
        let errorMessage = 'API quota exceeded. ';
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMessage += errorData.error.message;
          }
          if (errorData.error?.details?.[0]?.retryDelay) {
            errorMessage += ` Please retry after ${errorData.error.details[0].retryDelay}.`;
          }
        } catch (e) {
          errorMessage += 'Please wait a moment and try again.';
        }
        throw new Error(errorMessage);
      }
      
      // Handle 404 (model not found)
      if (response.status === 404) {
        throw new Error(
          `Model not found. The model name might be incorrect. ` +
          `Please check available models or try a different model name. ` +
          `Error: ${errorText.substring(0, 200)}`
        );
      }
      
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      console.error('Invalid Gemini API response structure:', JSON.stringify(data, null, 2));
      throw new Error('Invalid response format from Gemini API');
    }
    
    const extractedText = data.candidates[0].content.parts[0].text;

    // Parse the JSON response
    let recipeData: RecipeSchema;
    try {
      // Remove any markdown code blocks if present
      let cleanedText = extractedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Check if response appears truncated (doesn't end with })
      if (!cleanedText.endsWith('}')) {
        console.warn('Response appears truncated, attempting to fix...');
        // Try to find the last complete object/array and close it
        const lastBrace = cleanedText.lastIndexOf('}');
        const lastBracket = cleanedText.lastIndexOf(']');
        const lastComplete = Math.max(lastBrace, lastBracket);
        
        if (lastComplete > cleanedText.length / 2) {
          // If we have at least half the response, try to close it
          cleanedText = cleanedText.substring(0, lastComplete + 1);
          // Try to close any open arrays/objects
          const openBraces = (cleanedText.match(/{/g) || []).length;
          const closeBraces = (cleanedText.match(/}/g) || []).length;
          const openBrackets = (cleanedText.match(/\[/g) || []).length;
          const closeBrackets = (cleanedText.match(/\]/g) || []).length;
          
          // Add missing closing brackets/braces
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            cleanedText += ']';
          }
          for (let i = 0; i < openBraces - closeBraces; i++) {
            cleanedText += '}';
          }
        }
      }
      
      recipeData = JSON.parse(cleanedText);
      
      // Debug: Log if instructions are missing
      if (!recipeData.instructions || recipeData.instructions.length === 0) {
        console.warn('⚠️ No instructions found in extracted recipe data. Full response:', JSON.stringify(recipeData, null, 2));
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response. Raw text length:', extractedText.length);
      console.error('First 1000 chars:', extractedText.substring(0, 1000));
      console.error('Last 500 chars:', extractedText.substring(Math.max(0, extractedText.length - 500)));
      throw new Error('Failed to parse recipe data from API response');
    }

    // Validate and normalize the response
    const normalizedRecipe = validateAndNormalizeRecipe(recipeData);
    
    // Parse serving range if present (e.g., "4-6" or "4 to 6")
    let servingsUsed: number | null = null;
    if (normalizedRecipe.servings === null) {
      servingsUsed = null;
    } else if (typeof normalizedRecipe.servings === 'number') {
      servingsUsed = normalizedRecipe.servings;
    } else {
      const servingsStr = String(normalizedRecipe.servings);
      const rangeMatch = servingsStr.match(/(\d+)\s*[-–—to]\s*(\d+)/i);
      if (rangeMatch) {
        // Use the average of the range, rounded
        const min = parseInt(rangeMatch[1]);
        const max = parseInt(rangeMatch[2]);
        servingsUsed = Math.round((min + max) / 2);
      } else {
        const singleMatch = servingsStr.match(/(\d+)/);
        if (singleMatch) {
          servingsUsed = parseInt(singleMatch[1]);
        }
      }
    }

    // Check which nutrition fields are missing and need estimation
    const existingNutrition = normalizedRecipe.nutrition;
    const missingFields: string[] = [];
    
    if (!existingNutrition) {
      missingFields.push('calories', 'protein_g', 'fat_g', 'carbs_g');
    } else {
      if (existingNutrition.calories === null) missingFields.push('calories');
      if (existingNutrition.protein_g === null) missingFields.push('protein_g');
      if (existingNutrition.fat_g === null) missingFields.push('fat_g');
      if (existingNutrition.carbs_g === null) missingFields.push('carbs_g');
    }

    // If any fields are missing, estimate only those fields
    if (missingFields.length > 0) {
      console.log(`Nutrition fields missing: ${missingFields.join(', ')}, estimating...`);
      try {
        const estimatedNutrition = await estimateNutritionFromIngredients(
          normalizedRecipe.ingredients,
          servingsUsed,
          missingFields
        );
        
        console.log('Estimated nutrition response:', estimatedNutrition);
        console.log('Missing fields requested:', missingFields);
        
        // Merge estimated nutrition with any existing partial data
        // Only use estimated values for fields that were missing
        normalizedRecipe.nutrition = {
          calories: existingNutrition?.calories ?? estimatedNutrition.calories,
          protein_g: existingNutrition?.protein_g ?? estimatedNutrition.protein_g,
          fat_g: existingNutrition?.fat_g ?? estimatedNutrition.fat_g,
          carbs_g: existingNutrition?.carbs_g ?? estimatedNutrition.carbs_g,
        };
        
        // Only set AI estimation flag if we actually got some estimated values
        const hasEstimatedValues = estimatedNutrition.calories !== null || 
                                   estimatedNutrition.protein_g !== null || 
                                   estimatedNutrition.fat_g !== null || 
                                   estimatedNutrition.carbs_g !== null;
        
        if (hasEstimatedValues) {
          normalizedRecipe.nutrition_ai_estimated = true;
          normalizedRecipe.nutrition_servings_used = estimatedNutrition.servings_used ?? servingsUsed;
        }
        console.log('Final merged nutrition:', normalizedRecipe.nutrition, 'for', servingsUsed, 'servings');
      } catch (estimateError) {
        console.error('Failed to estimate nutrition, keeping original:', estimateError);
        // Keep original nutrition (even if null) if estimation fails
        // Don't set AI estimation flag if estimation completely failed
      }
    }
    
    return normalizedRecipe;
  } catch (error) {
    console.error('Error extracting recipe from image:', error);
    throw error;
  }
}

/**
 * Convert text to title case if it's in all caps or mostly uppercase
 */
function toTitleCase(text: string): string {
  if (!text) return text;
  
  // Check if text is all uppercase or mostly uppercase (more than 50% uppercase letters)
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return text;
  
  const uppercaseCount = letters.split('').filter(c => c === c.toUpperCase()).length;
  const isMostlyUppercase = uppercaseCount / letters.length > 0.5;
  
  // Only convert if it's mostly uppercase
  if (!isMostlyUppercase) return text;
  
  // Convert to title case: first letter of each word capitalized, rest lowercase
  return text
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Estimate nutrition information from ingredients using AI
 * Only estimates the fields specified in missingFields array
 */
async function estimateNutritionFromIngredients(
  ingredients: Array<{ quantity: string; unit: string; item: string; notes: string }>,
  servings: number | null,
  missingFields: string[] = ['calories', 'protein_g', 'fat_g', 'carbs_g']
): Promise<{ calories: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null; servings_used: number | null }> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
  }

  // Format ingredients list for the prompt
  const ingredientsList = ingredients
    .map(ing => {
      const parts = [];
      if (ing.quantity) parts.push(ing.quantity);
      if (ing.unit) parts.push(ing.unit);
      if (ing.item) parts.push(ing.item);
      if (ing.notes) parts.push(`(${ing.notes})`);
      return parts.join(' ');
    })
    .join('\n');

  // Parse serving range if it's a string or number
  let servingsNumber: number | null = null;
  let servingNote = '';
  
  if (servings === null) {
    servingNote = 'Assume this recipe serves 4 people for calculation purposes.';
    servingsNumber = 4;
  } else if (typeof servings === 'number') {
    servingsNumber = servings;
    servingNote = `This recipe serves ${servingsNumber} people.`;
  } else {
    const servingsStr = String(servings);
    const rangeMatch = servingsStr.match(/(\d+)\s*[-–—to]\s*(\d+)/i);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1]);
      const max = parseInt(rangeMatch[2]);
      servingsNumber = Math.round((min + max) / 2);
      servingNote = `This recipe serves ${min}-${max} people. Use ${servingsNumber} servings (the average) for calculations.`;
    } else {
      const singleMatch = servingsStr.match(/(\d+)/);
      if (singleMatch) {
        servingsNumber = parseInt(singleMatch[1]);
        servingNote = `This recipe serves ${servingsNumber} people.`;
      } else {
        servingNote = 'Assume this recipe serves 4 people for calculation purposes.';
        servingsNumber = 4;
      }
    }
  }

  // Build the JSON structure based on which fields need estimation
  const fieldsToEstimate = missingFields;
  const jsonStructure: string[] = [];
  const fieldDescriptions: string[] = [];
  
  if (fieldsToEstimate.includes('calories')) {
    jsonStructure.push('  "calories": number (calories PER SERVING)');
    fieldDescriptions.push('calories');
  }
  if (fieldsToEstimate.includes('protein_g')) {
    jsonStructure.push('  "protein_g": number (protein in grams PER SERVING)');
    fieldDescriptions.push('protein');
  }
  if (fieldsToEstimate.includes('fat_g')) {
    jsonStructure.push('  "fat_g": number (fat in grams PER SERVING)');
    fieldDescriptions.push('fat');
  }
  if (fieldsToEstimate.includes('carbs_g')) {
    jsonStructure.push('  "carbs_g": number (carbohydrates in grams PER SERVING)');
    fieldDescriptions.push('carbohydrates');
  }

  const fieldsNeeded = fieldDescriptions.join(', ');
  const jsonStructureStr = jsonStructure.length > 0 ? `{\n${jsonStructure.join(',\n')}\n}` : '{}';

  console.log('Building prompt for missing fields:', missingFields);
  console.log('JSON structure:', jsonStructureStr);

  const prompt = `Estimate the nutritional information PER SERVING for this recipe based on the ingredients list. Provide realistic estimates based on typical nutritional values for these ingredients.

Ingredients:
${ingredientsList}

${servingNote}

Return ONLY a JSON object with this exact structure (include ALL fields listed):
${jsonStructureStr}

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
1. You MUST return ALL ${missingFields.length} field(s) in the JSON response: ${missingFields.join(', ')}
2. Do NOT omit any fields - every field listed above must have a numeric value
3. Provide estimates PER SERVING (not for the entire recipe)
4. Use realistic values based on standard nutritional databases
5. Round to whole numbers (integers only, no decimals)
6. Return ONLY valid JSON - no markdown, no code blocks, no explanations
7. The JSON object must be complete and valid - include all ${missingFields.length} field(s)

Example format for ${missingFields.length} field(s):
${jsonStructureStr}

Remember: ALL fields must be included with numeric values.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000, // Increased to prevent truncation
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error for nutrition estimation:', errorText);
      
      // Handle rate limit/quota errors gracefully
      if (response.status === 429) {
        console.warn('Nutrition estimation quota exceeded - skipping estimation');
        // Return null values instead of throwing - recipe extraction can still succeed
        return {
          calories: null,
          protein_g: null,
          fat_g: null,
          carbs_g: null,
          servings_used: servingsNumber,
        };
      }
      
      throw new Error(`Failed to estimate nutrition: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      throw new Error('Invalid response format from Gemini API');
    }
    
    const extractedText = data.candidates[0].content.parts[0].text;
    
    console.log('Raw AI response length:', extractedText.length);
    console.log('Raw AI response:', extractedText);
    
    // Parse the JSON response
    try {
      let cleanedText = extractedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Check if response looks truncated
      const isTruncated = !cleanedText.endsWith('}') || (cleanedText.match(/}/g) || []).length < (cleanedText.match(/{/g) || []).length;
      if (isTruncated) {
        console.warn('Response appears truncated, attempting to fix...');
      }
      
      // Try to fix incomplete JSON by finding the last complete object
      // If JSON is truncated, try to extract what we can
      if (!cleanedText.endsWith('}')) {
        // Find the last complete property
        const lastCompleteProp = cleanedText.lastIndexOf(',');
        if (lastCompleteProp > 0) {
          // Try to close the JSON object
          cleanedText = cleanedText.substring(0, lastCompleteProp) + '}';
        } else if (cleanedText.includes('{')) {
          // If we have at least one property, try to close it
          const firstProp = cleanedText.indexOf(':');
          if (firstProp > 0) {
            // Extract the property name and try to create valid JSON
            const propName = cleanedText.substring(cleanedText.indexOf('{') + 1, firstProp).trim().replace(/"/g, '');
            const propValue = cleanedText.substring(firstProp + 1).trim();
            // Try to parse the value as a number
            const numValue = parseFloat(propValue);
            if (!isNaN(numValue)) {
              cleanedText = `{"${propName}": ${numValue}}`;
            }
          }
        }
      }
      
      const nutritionData = JSON.parse(cleanedText);
      
      console.log('Parsed nutrition data from AI:', nutritionData);
      console.log('Missing fields to extract:', missingFields);
      
      // Only return values for fields that were requested
      const result: { calories: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null; servings_used: number | null } = {
        calories: null,
        protein_g: null,
        fat_g: null,
        carbs_g: null,
        servings_used: servingsNumber,
      };
      
      if (missingFields.includes('calories')) {
        if (typeof nutritionData.calories === 'number') {
          result.calories = Math.round(nutritionData.calories);
        } else {
          console.warn('AI did not return calories value');
        }
      }
      if (missingFields.includes('protein_g')) {
        if (typeof nutritionData.protein_g === 'number') {
          result.protein_g = Math.round(nutritionData.protein_g);
        } else {
          console.warn('AI did not return protein_g value');
        }
      }
      if (missingFields.includes('fat_g')) {
        if (typeof nutritionData.fat_g === 'number') {
          result.fat_g = Math.round(nutritionData.fat_g);
        } else {
          console.warn('AI did not return fat_g value');
        }
      }
      if (missingFields.includes('carbs_g')) {
        if (typeof nutritionData.carbs_g === 'number') {
          result.carbs_g = Math.round(nutritionData.carbs_g);
        } else {
          console.warn('AI did not return carbs_g value');
        }
      }
      
      console.log('Final result after extraction:', result);
      
      // Verify all requested fields were extracted
      const missingInResult: string[] = [];
      missingFields.forEach(field => {
        if (field === 'calories' && result.calories === null) missingInResult.push(field);
        if (field === 'protein_g' && result.protein_g === null) missingInResult.push(field);
        if (field === 'fat_g' && result.fat_g === null) missingInResult.push(field);
        if (field === 'carbs_g' && result.carbs_g === null) missingInResult.push(field);
      });
      
      if (missingInResult.length > 0) {
        console.error(`ERROR: AI did not return values for: ${missingInResult.join(', ')}`);
        console.error('Full AI response:', extractedText);
        console.error('Parsed nutrition data:', nutritionData);
        console.error('Requested fields:', missingFields);
      }
      
      return result;
    } catch (parseError) {
      console.error('Failed to parse nutrition estimation response:', extractedText.substring(0, 500));
      console.error('Parse error:', parseError);
      
      // Try to extract partial data using regex as fallback
      try {
        const caloriesMatch = extractedText.match(/"calories"\s*:\s*(\d+)/);
        const proteinMatch = extractedText.match(/"protein_g"\s*:\s*(\d+)/);
        const fatMatch = extractedText.match(/"fat_g"\s*:\s*(\d+)/);
        const carbsMatch = extractedText.match(/"carbs_g"\s*:\s*(\d+)/);
        
        if (caloriesMatch || proteinMatch || fatMatch || carbsMatch) {
          console.log('Extracted partial nutrition data from incomplete response');
          const result: { calories: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null; servings_used: number | null } = {
            calories: null,
            protein_g: null,
            fat_g: null,
            carbs_g: null,
            servings_used: servingsNumber,
          };
          
          if (missingFields.includes('calories') && caloriesMatch) {
            result.calories = parseInt(caloriesMatch[1]);
          }
          if (missingFields.includes('protein_g') && proteinMatch) {
            result.protein_g = parseInt(proteinMatch[1]);
          }
          if (missingFields.includes('fat_g') && fatMatch) {
            result.fat_g = parseInt(fatMatch[1]);
          }
          if (missingFields.includes('carbs_g') && carbsMatch) {
            result.carbs_g = parseInt(carbsMatch[1]);
          }
          
          return result;
        }
      } catch (fallbackError) {
        console.error('Fallback extraction also failed:', fallbackError);
      }
      
      throw new Error('Failed to parse nutrition estimation data');
    }
  } catch (error) {
    console.error('Error estimating nutrition:', error);
    // Return null values if estimation fails
    return {
      calories: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      servings_used: servings,
    };
  }
}

/**
 * Validate and normalize recipe data to match schema
 */
function validateAndNormalizeRecipe(data: any): RecipeSchema {
  const rawRecipeName = data.recipe_name || 'Untitled Recipe';
  const rawAuthor = data.author ? String(data.author).trim() : null;
  return {
    recipe_name: toTitleCase(rawRecipeName),
    author: rawAuthor ? toTitleCase(rawAuthor) : null,
    description: data.description ? String(data.description).trim() : null,
    link: data.link ? String(data.link).trim() : null,
    servings: typeof data.servings === 'number' ? data.servings : null,
    prep_time_minutes: typeof data.prep_time_minutes === 'number' ? data.prep_time_minutes : null,
    cook_time_minutes: typeof data.cook_time_minutes === 'number' ? data.cook_time_minutes : null,
    ingredients: Array.isArray(data.ingredients)
      ? data.ingredients.map((ing: any) => ({
          quantity: String(ing.quantity || ''),
          unit: String(ing.unit || ''),
          item: String(ing.item || ''),
          notes: String(ing.notes || ''),
        }))
      : [],
    instructions: Array.isArray(data.instructions)
      ? data.instructions
          .map((inst: any, index: number) => ({
            step_number: typeof inst.step_number === 'number' ? inst.step_number : index + 1,
            text: String(inst.text || inst || ''), // Handle both object and string formats
          }))
          .filter((inst: any) => inst.text && inst.text.trim().length > 0) // Only keep non-empty instructions
      : [],
    nutrition: data.nutrition
      ? {
          calories: typeof data.nutrition.calories === 'number' ? data.nutrition.calories : null,
          protein_g: typeof data.nutrition.protein_g === 'number' ? data.nutrition.protein_g : null,
          fat_g: typeof data.nutrition.fat_g === 'number' ? data.nutrition.fat_g : null,
          carbs_g: typeof data.nutrition.carbs_g === 'number' ? data.nutrition.carbs_g : null,
        }
      : null,
  };
}

