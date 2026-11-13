// Ids de trazo generados en el cliente: cortos (18 caracteres hex) y únicos en la práctica.
// No usa crypto.randomUUID porque exige contexto seguro (falla en http por IP de red local).

export function createStrokeId(): string {
  const bytes = new Uint8Array(9);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
