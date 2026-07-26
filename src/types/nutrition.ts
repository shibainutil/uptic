import { MaterialIcons } from '@expo/vector-icons';

export type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

// ── Nutrient colors/icons (matches Flutter NutrientColors) ─────────────────

export const NUTRIENT_COLORS = {
  calories: '#7C3AED',
  fat: '#60A5FA',
  carbs: '#3B82F6',
  fibre: '#2563EB',
  protein: '#1E40AF',
} as const;

export const NUTRIENT_ICONS: Record<keyof typeof NUTRIENT_COLORS, IconName> = {
  calories: 'local-fire-department',
  fat: 'water-drop',
  carbs: 'grain',
  fibre: 'eco',
  protein: 'set-meal',
};

export const NUTRIENT_LABELS: Record<keyof typeof NUTRIENT_COLORS, string> = {
  calories: 'Calories',
  fat: 'Fat',
  carbs: 'Carbs',
  fibre: 'Fibre',
  protein: 'Protein',
};

export const NUTRIENT_UNITS: Record<keyof typeof NUTRIENT_COLORS, string> = {
  calories: 'kcal',
  fat: 'g',
  carbs: 'g',
  fibre: 'g',
  protein: 'g',
};

// ── Ingredients ──────────────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  name: string;
  imageUrl?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fibrePer100g: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export function macrosForAmount(ingredient: Ingredient, amountInGrams: number): Macros {
  const factor = amountInGrams / 100;
  return {
    calories: ingredient.caloriesPer100g * factor,
    protein: ingredient.proteinPer100g * factor,
    carbs: ingredient.carbsPer100g * factor,
    fat: ingredient.fatPer100g * factor,
    fibre: ingredient.fibrePer100g * factor,
  };
}

export interface MealIngredient {
  ingredientId: string;
  ingredientName: string;
  imageUrl?: string;
  amountInGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export function mealIngredientFromIngredient(ingredient: Ingredient, amountInGrams: number): MealIngredient {
  const m = macrosForAmount(ingredient, amountInGrams);
  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    imageUrl: ingredient.imageUrl,
    amountInGrams,
    ...m,
  };
}

// ── Nutrition entries ────────────────────────────────────────────────────

export interface NutritionData {
  id: string;
  date: string; // ISO yyyy-mm-dd
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fibre?: number;
  goalMet: boolean;
  timestamp: string; // ISO datetime — earliest sitting, kept for back-compat
  mealSittings: string[]; // ISO datetimes
  ingredients: MealIngredient[];
  createdAt: string;
}

export function earliestSitting(entry: NutritionData): string {
  return entry.mealSittings.length ? entry.mealSittings.slice().sort()[0] : entry.timestamp;
}

export function entriesForDate(entries: NutritionData[], dateISO: string): NutritionData[] {
  return entries.filter((e) => e.date === dateISO);
}

export function sumMacros(entries: NutritionData[]): Macros {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories ?? 0),
      protein: acc.protein + (e.protein ?? 0),
      carbs: acc.carbs + (e.carbs ?? 0),
      fat: acc.fat + (e.fat ?? 0),
      fibre: acc.fibre + (e.fibre ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );
}

// ── Settings ─────────────────────────────────────────────────────────────

export interface NutritionSettings {
  dailyCalorieGoal: number;
  dailyCalorieMin?: number;
  dailyCalorieMax?: number;
  dailyProteinMin?: number;
  dailyProteinMax?: number;
  dailyCarbsMin?: number;
  dailyCarbsMax?: number;
  dailyFatMin?: number;
  dailyFatMax?: number;
  dailyFibreMin?: number;
  dailyFibreMax?: number;
  bonusGoalPercentage: number;
  cheatDaysPerWeek: number;
  fatBurnHours: number;
  dailyFastingGoalHours: number;
  bonusFastingGoalHours: number;
  preferredFastingStartTime?: string;
}

export const DEFAULT_NUTRITION_SETTINGS: NutritionSettings = {
  dailyCalorieGoal: 2000,
  bonusGoalPercentage: 120,
  cheatDaysPerWeek: 1,
  fatBurnHours: 12,
  dailyFastingGoalHours: 16,
  bonusFastingGoalHours: 18,
};

// ── Fasting ──────────────────────────────────────────────────────────────

export interface FastingSession {
  id: string;
  startTime: string; // ISO datetime
  endTime?: string;
  isActive: boolean;
}
