const API_URL = import.meta.env.VITE_API_BASE_URL;

export async function checkBackend() {
  const response = await fetch(`${API_URL}/docs`);
  return response.ok;
}

export default API_URL;
