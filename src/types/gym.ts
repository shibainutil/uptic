export interface Exercise {
  id: string;
  name: string;
  category: string;
  description?: string;
  imageUri?: string;
  createdAt: string;
}

export interface ExerciseExecution {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  weight?: number;
  weightUnit?: 'kg' | 'lbs';
  notes?: string;
}

export interface TrainingModule {
  id: string;
  name: string;
  description?: string;
  executions: ExerciseExecution[];
  createdAt: string;
}

export interface TrainingCycle {
  id: string;
  name: string;
  description?: string;
  moduleIds: string[];
  createdAt: string;
}
