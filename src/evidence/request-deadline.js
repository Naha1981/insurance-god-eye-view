export async function fetchWithDeadline(url, options = {}, timeoutMs = 20000, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The service did not respond within 20 seconds. No automatic retry was sent. If creating an account, it may have completed: try signing in before registering again.');
    throw error;
  } finally { clearTimeout(timer); }
}
