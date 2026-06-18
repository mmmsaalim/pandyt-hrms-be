export type CanteenMealTypeConfig = {
  key: string;
  label: string;
  defaultCost: number;
  enabled: boolean;
};

export const DEFAULT_CANTEEN_MEAL_TYPES: CanteenMealTypeConfig[] = [
  { key: 'breakfast', label: 'Breakfast', defaultCost: 0, enabled: true },
  { key: 'lunch', label: 'Lunch', defaultCost: 150, enabled: true },
  { key: 'dinner', label: 'Dinner', defaultCost: 0, enabled: false },
  { key: 'morningTea', label: 'Morning Tea & Snacks', defaultCost: 30, enabled: true },
  { key: 'eveningTea', label: 'Evening Tea & Short Eats', defaultCost: 30, enabled: true },
];

export const DEFAULT_MEAL_COUNTS: Record<string, number> = {
  lunch: 1,
};

export type MealBreakdown = Record<string, { count: number; cost: number }>;
