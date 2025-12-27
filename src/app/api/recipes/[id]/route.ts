import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const recipe = await prisma.recipe.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    // Parse JSON fields for response
    const nutritionData = recipe.nutrition ? JSON.parse(recipe.nutrition) : null;
    return NextResponse.json({
      ...recipe,
      ingredients: JSON.parse(recipe.ingredients),
      instructions: JSON.parse(recipe.instructions),
      nutrition: nutritionData ? {
        calories: nutritionData.calories,
        protein_g: nutritionData.protein_g,
        fat_g: nutritionData.fat_g,
        carbs_g: nutritionData.carbs_g,
      } : null,
      nutrition_ai_estimated: nutritionData?._ai_estimated || false,
      nutrition_servings_used: nutritionData?._servings_used || null,
    })
  } catch (error) {
    console.error("Error fetching recipe:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify recipe belongs to user
    const existingRecipe = await prisma.recipe.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existingRecipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    const { 
      recipe_name,
      author,
      description,
      link,
      servings, 
      prep_time_minutes, 
      cook_time_minutes, 
      ingredients, 
      instructions, 
      nutrition,
      image
    } = await request.json()

    // Extract AI estimation flags from nutrition object if present
    let nutritionToSave = nutrition;
    if (nutrition && typeof nutrition === 'object') {
      nutritionToSave = {
        calories: nutrition.calories,
        protein_g: nutrition.protein_g,
        fat_g: nutrition.fat_g,
        carbs_g: nutrition.carbs_g,
        _ai_estimated: nutrition._ai_estimated || false,
        _servings_used: nutrition._servings_used || null,
      };
    }

    // Ensure ingredients and instructions are arrays
    const ingredientsArray = Array.isArray(ingredients) ? ingredients : []
    const instructionsArray = Array.isArray(instructions) ? instructions : []

    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        recipe_name: recipe_name || undefined,
        author: author !== undefined ? (author || null) : undefined,
        description: description !== undefined ? (description || null) : undefined,
        link: link !== undefined ? (link || null) : undefined,
        servings: servings !== undefined ? servings : undefined,
        prep_time_minutes: prep_time_minutes !== undefined ? prep_time_minutes : undefined,
        cook_time_minutes: cook_time_minutes !== undefined ? cook_time_minutes : undefined,
        ingredients: ingredientsArray.length > 0 ? JSON.stringify(ingredientsArray) : undefined,
        instructions: instructionsArray.length > 0 ? JSON.stringify(instructionsArray) : undefined,
        nutrition: nutritionToSave ? JSON.stringify(nutritionToSave) : undefined,
        image: image !== undefined ? (image || null) : undefined,
      },
    })

    // Parse JSON fields for response
    const nutritionData = recipe.nutrition ? JSON.parse(recipe.nutrition) : null;
    return NextResponse.json({
      ...recipe,
      ingredients: JSON.parse(recipe.ingredients),
      instructions: JSON.parse(recipe.instructions),
      nutrition: nutritionData ? {
        calories: nutritionData.calories,
        protein_g: nutritionData.protein_g,
        fat_g: nutritionData.fat_g,
        carbs_g: nutritionData.carbs_g,
      } : null,
      nutrition_ai_estimated: nutritionData?._ai_estimated || false,
      nutrition_servings_used: nutritionData?._servings_used || null,
    }, { status: 200 })
  } catch (error) {
    console.error("Error updating recipe:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify recipe belongs to user
    const existingRecipe = await prisma.recipe.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existingRecipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    await prisma.recipe.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting recipe:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

