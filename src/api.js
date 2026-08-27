const API_URL = "http://127.0.0.1:8000";

export async function checkBackend() {
  const response = await fetch(`${API_URL}/docs`);
  return response.ok;
}

export default API_URL;
