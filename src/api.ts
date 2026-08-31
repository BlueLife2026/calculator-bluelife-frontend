// ponytail: una constante, no un cliente HTTP. Envolver fetch cuando haya auth o
// manejo de errores comun. El fallback mantiene el comportamiento de dev de siempre.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
