export interface PaybackResult { years: number | "never"; cumulative: number; schedule: number[]; }

export function calculatePayback(totalCost: number, expectedSalary: number, growthRate = 0.05): PaybackResult {
  if (totalCost <= 0) return { years: 0, cumulative: 0, schedule: [] };
  const effectiveGrowthRate = Math.max(0, Math.min(growthRate, 0.5));
  if (expectedSalary <= 0) return { years: "never", cumulative: 0, schedule: [] };
  let cumulative = 0;
  let currentSalary = expectedSalary;
  const schedule: number[] = [];
  for (let year = 1; year <= 40; year += 1) {
    cumulative += currentSalary;
    schedule.push(cumulative);
    if (cumulative >= totalCost) return { years: year, cumulative, schedule };
    currentSalary *= 1 + effectiveGrowthRate;
  }
  return { years: "never", cumulative, schedule };
}
