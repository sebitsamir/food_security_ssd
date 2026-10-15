export type PredictionRecord = {
  id: string;
  modelVersion: string;
  at: string; // ISO timestamp
  time: string; // human label for tables and PDFs
  county: string;
  countyPcode: string;
  state: string;
  year: number;
  month: number;
  population: number;
  phase: number;
  pct: number;
  production: number;
  gap: number;
  p1: number;
  p2: number;
  warnings: string[];
};
