export const proposalServiceOptions = [
  'Chemical Testing & Balancing',
  'Skimming',
  'Brushing',
  'Vacuuming',
  'Filter Service',
  'Basket Emptying',
  'Equipment Inspection',
  'Chemical Supply',
  'Digital Service Report',
  'Quick Emergency Response',
  'Spa / Hot Tub Service',
  'Compliance Documentation',
] as const;

export type ProposalService = (typeof proposalServiceOptions)[number];
