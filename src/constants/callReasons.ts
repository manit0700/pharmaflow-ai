export const CALL_REASONS = [
  { value: 'refill_reminder', label: 'Refill reminder' },
  { value: 'pickup_reminder', label: 'Pickup reminder' },
  { value: 'delivery_update', label: 'Delivery update' },
  { value: 'insurance_update', label: 'Insurance update' },
  { value: 'general_callback', label: 'General callback' },
] as const

export type CallReasonValue = (typeof CALL_REASONS)[number]['value']
