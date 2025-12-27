'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function ManualRecipePage() {
  const [recipe, setRecipe] = useState({
    title: '',
    description: '',
    ingredients: '',
    instructions: '',
    prepTime: '',
    cookTime: '',
    servings: ''
  });
  const [recipePhoto, setRecipePhoto] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB for photos)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError('Photo is too large. Maximum size is 5MB.');
      return;
    }

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setRecipePhoto(result);
      };
      reader.onerror = () => {
        setError('Failed to read photo file');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Failed to process photo');
    }
  };

  const handleSaveRecipe = async () => {
    if (!recipe.title || !recipe.ingredients || !recipe.instructions) {
      setError('Please fill in at least title, ingredients, and instructions');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipe_name: recipe.title,
          description: recipe.description || null,
          ingredients: recipe.ingredients.split('\n').filter(line => line.trim()).map(line => {
            // Try to parse ingredient line into structured format
            const parts = line.trim().split(/\s+/);
            if (parts.length === 0) {
              return { quantity: '', unit: '', item: '', notes: '' };
            }
            // Simple parsing: assume first part might be quantity, second might be unit, rest is item
            if (parts.length === 1) {
              return { quantity: '', unit: '', item: parts[0], notes: '' };
            }
            if (parts.length === 2) {
              return { quantity: '', unit: '', item: parts.join(' '), notes: '' };
            }
            return {
              quantity: parts[0] || '',
              unit: parts[1] || '',
              item: parts.slice(2).join(' ') || '',
              notes: ''
            };
          }),
          instructions: recipe.instructions.split('\n').filter(line => line.trim()).map((line, index) => ({
            step_number: index + 1,
            text: line.trim()
          })),
          prep_time_minutes: recipe.prepTime ? parseInt(recipe.prepTime) : null,
          cook_time_minutes: recipe.cookTime ? parseInt(recipe.cookTime) : null,
          servings: recipe.servings ? parseInt(recipe.servings) : null,
          image: recipePhoto || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save recipe');
      }

      setSuccess(true);
      setRecipe({
        title: '',
        description: '',
        ingredients: '',
        instructions: '',
        prepTime: '',
        cookTime: '',
        servings: ''
      });
      setRecipePhoto(null);
      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
      
      setTimeout(() => {
        setSuccess(false);
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center">
              <Image src="/logo-pantrii.svg" alt="Pantrii" width={120} height={28} />
            </Link>
            <Link 
              href="/" 
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Add Recipe Manually
          </h1>
          <p className="text-gray-600 mb-6">
            Enter your recipe details below.
          </p>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipe Title *
                </label>
                <input
                  type="text"
                  value={recipe.title}
                  onChange={(e) => setRecipe({...recipe, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Enter recipe title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={recipe.description}
                  onChange={(e) => setRecipe({...recipe, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Brief description"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prep Time (minutes)
                </label>
                <input
                  type="number"
                  value={recipe.prepTime}
                  onChange={(e) => setRecipe({...recipe, prepTime: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="15"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cook Time (minutes)
                </label>
                <input
                  type="number"
                  value={recipe.cookTime}
                  onChange={(e) => setRecipe({...recipe, cookTime: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Servings
                </label>
                <input
                  type="number"
                  value={recipe.servings}
                  onChange={(e) => setRecipe({...recipe, servings: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="4"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ingredients *
              </label>
              <textarea
                value={recipe.ingredients}
                onChange={(e) => setRecipe({...recipe, ingredients: e.target.value})}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter ingredients, one per line..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instructions *
              </label>
              <textarea
                value={recipe.instructions}
                onChange={(e) => setRecipe({...recipe, instructions: e.target.value})}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter cooking instructions, one step per line..."
              />
            </div>

            {/* Recipe Photo Upload - Only show after required fields are filled */}
            {recipe.title && recipe.ingredients && recipe.instructions && (
              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipe Photo (Optional)
                </label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  disabled={isSaving}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-600 file:text-white
                    hover:file:bg-blue-700
                    disabled:opacity-50"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Upload a photo of your finished dish (JPEG, PNG - max 5MB)
                </div>
                {recipePhoto && (
                  <div className="mt-3">
                    <img
                      src={recipePhoto}
                      alt="Recipe preview"
                      className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      onClick={() => {
                        setRecipePhoto(null);
                        if (photoInputRef.current) {
                          photoInputRef.current.value = '';
                        }
                      }}
                      className="mt-2 text-sm text-red-600 hover:text-red-700"
                    >
                      Remove photo
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">
                  ✅ Recipe saved successfully!
                </p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={handleSaveRecipe}
                disabled={isSaving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Recipe'}
              </button>
              <Link
                href="/dashboard"
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}