const statusTranslations: Record<string, string> = {
  enviado: 'Sent', sent: 'Sent',
  aprobado: 'Approved', approved: 'Approved',
  rechazado: 'Rejected', rejected: 'Rejected',
  convertido: 'Converted', converted: 'Converted',
  requerido: 'Required', required: 'Required',
  pendiente: 'Pending', pending: 'Pending',
  realizado: 'Completed', completado: 'Completed', completed: 'Completed',
  cerrado: 'Closed', closed: 'Closed',
  satisfactorio: 'Satisfactory', satisfactory: 'Satisfactory',
  insatisfactorio: 'Unsatisfactory', unsatisfactory: 'Unsatisfactory',
};

export function englishHealthStatus(value: string = ''): string {
  const trimmed = value.trim();
  return statusTranslations[trimmed.toLowerCase()] || trimmed;
}

export const estimateStatusOptions = ['Required', 'Sent', 'Approved', 'Rejected', 'Converted'];

export function englishChemical(value: string): string {
  return ({ ph: 'pH', cloro: 'Chlorine', estabilizador: 'Stabilizer' } as Record<string, string>)[value.trim().toLowerCase()] || value;
}
