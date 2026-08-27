export interface Profile {
  id: string;
  name: string;
  created_at?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigned_to?: string;
  interval_days: number;
  next_due_date: string;
  is_completed: boolean;
  created_at?: string;
}