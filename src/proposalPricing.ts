export type ProposalCostWaterBody = {
  description: string;
  type: string;
  frequency: string;
  baseMonthlyCost: number;
};

export type ProposalLineAllocation = ProposalCostWaterBody & {
  serviceCents: number;
  fuelCents: number;
  grossCents: number;
  discountCents: number;
  monthlyCents: number;
};

function dollarsToCents(value: number) {
  return Math.round(Math.max(0, value) * 100);
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

/**
 * Splits fuel evenly, applies the discount to every body, and reconciles
 * whole-dollar rounding so the visible rows equal the calculator total.
 */
export function allocateProposalCosts(
  waterBodies: ProposalCostWaterBody[],
  monthlyTransportationCost: number,
  discountPercentage: number,
  totalMonthlyInvestment: number,
): ProposalLineAllocation[] {
  if (waterBodies.length === 0) return [];

  const fuelTotalCents = dollarsToCents(monthlyTransportationCost);
  const equalFuelCents = Math.floor(fuelTotalCents / waterBodies.length);
  const fuelRemainderCents = fuelTotalCents % waterBodies.length;
  const discountMultiplier = 1 - clampPercentage(discountPercentage) / 100;

  const draft = waterBodies.map((body, index) => {
    const serviceCents = dollarsToCents(body.baseMonthlyCost);
    const fuelCents = equalFuelCents + (index < fuelRemainderCents ? 1 : 0);
    const grossCents = serviceCents + fuelCents;
    const exactMonthlyCents = grossCents * discountMultiplier;

    return {
      ...body,
      serviceCents,
      fuelCents,
      grossCents,
      exactMonthlyCents,
      monthlyCents: Math.floor(exactMonthlyCents / 100) * 100,
    };
  });

  const targetTotalCents = Math.round(Math.max(0, totalMonthlyInvestment)) * 100;
  let centsToReconcile =
    targetTotalCents - draft.reduce((sum, line) => sum + line.monthlyCents, 0);
  const reconciliationOrder = draft
    .map((line, index) => ({
      index,
      fraction:
        line.exactMonthlyCents / 100 - Math.floor(line.exactMonthlyCents / 100),
    }))
    .sort((left, right) =>
      centsToReconcile >= 0
        ? right.fraction - left.fraction || left.index - right.index
        : left.fraction - right.fraction || right.index - left.index,
    );

  let cursor = 0;
  while (centsToReconcile !== 0 && reconciliationOrder.length > 0) {
    const line = draft[reconciliationOrder[cursor % reconciliationOrder.length].index];
    if (centsToReconcile > 0) {
      line.monthlyCents += 100;
      centsToReconcile -= 100;
    } else if (line.monthlyCents >= 100) {
      line.monthlyCents -= 100;
      centsToReconcile += 100;
    }
    cursor += 1;
  }

  return draft.map((line) => {
    const { exactMonthlyCents, ...allocation } = line;
    void exactMonthlyCents;
    return {
      ...allocation,
      discountCents: allocation.grossCents - allocation.monthlyCents,
    };
  });
}
