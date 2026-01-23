/**
 * Standardized API Client
 * 
 * Centralized fetch utility with:
 * - Automatic response parsing
 * - Standardized error handling
 * - Request abort support
 * - Type-safe responses
 */

/**
 * Standard API Response Format
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {string} message
 * @property {any} data
 * @property {string|null} error
 * @property {object|null} [meta]
 */

/**
 * API Client Configuration
 */
const API_CONFIG = {
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  timeout: 30000, // 30 seconds
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
};

/**
 * Active request controllers for aborting duplicate requests
 */
const activeRequests = new Map();

/**
 * Create a unique key for a request
 */
function getRequestKey(method, url, body) {
  const bodyStr = body ? JSON.stringify(body) : '';
  return `${method}:${url}:${bodyStr}`;
}

/**
 * Standardized API Client
 * 
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {object} [options.body] - Request body (will be JSON stringified)
 * @param {object} [options.headers] - Additional headers
 * @param {boolean} [options.abortDuplicate=true] - Abort duplicate requests
 * @param {number} [options.timeout] - Request timeout in ms
 * @returns {Promise<ApiResponse>}
 */
export async function apiClient(url, options = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
    abortDuplicate = true,
    timeout = API_CONFIG.timeout,
  } = options;

  // Build full URL
  const fullUrl = url.startsWith('http') ? url : `${API_CONFIG.baseURL}${url}`;

  // Create abort controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Check for duplicate requests
  const requestKey = getRequestKey(method, fullUrl, body);
  if (abortDuplicate && activeRequests.has(requestKey)) {
    // Abort previous request
    activeRequests.get(requestKey).abort();
  }
  activeRequests.set(requestKey, controller);

  try {
    // Prepare request options
    const fetchOptions = {
      method,
      headers: {
        ...API_CONFIG.defaultHeaders,
        ...headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    };

    // Add body for non-GET requests
    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    // Make request
    const response = await fetch(fullUrl, fetchOptions);

    // Clear timeout
    clearTimeout(timeoutId);
    activeRequests.delete(requestKey);

    // Parse response
    let responseData;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        // Not JSON, return as text
        responseData = {
          success: response.ok,
          message: response.ok ? 'Success' : text || 'Request failed',
          data: response.ok ? text : null,
          error: response.ok ? null : text || 'Request failed',
        };
      }
    }

    // Handle standard response format
    if (responseData && typeof responseData === 'object') {
      // If response already follows standard format, return as-is
      if ('success' in responseData) {
        return responseData;
      }

      // Legacy format conversion (for backward compatibility during migration)
      if (response.ok) {
        return {
          success: true,
          message: 'Success',
          data: responseData,
          error: null,
        };
      } else {
        return {
          success: false,
          message: responseData.error || responseData.message || 'Request failed',
          data: null,
          error: responseData.error || responseData.message || 'Request failed',
        };
      }
    }

    // Fallback for unexpected response format
    return {
      success: response.ok,
      message: response.ok ? 'Success' : 'Request failed',
      data: response.ok ? responseData : null,
      error: response.ok ? null : 'Request failed',
    };
  } catch (error) {
    // Clear timeout
    clearTimeout(timeoutId);
    activeRequests.delete(requestKey);

    // Handle abort errors
    if (error.name === 'AbortError') {
      return {
        success: false,
        message: 'Request timeout or cancelled',
        data: null,
        error: 'Request timeout or cancelled',
      };
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        message: 'Network error. Please check your connection.',
        data: null,
        error: 'Network error',
      };
    }

    // Generic error
    return {
      success: false,
      message: error.message || 'An unexpected error occurred',
      data: null,
      error: error.message || 'An unexpected error occurred',
    };
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: (url, options = {}) => apiClient(url, { ...options, method: 'GET' }),
  post: (url, body, options = {}) => apiClient(url, { ...options, method: 'POST', body }),
  put: (url, body, options = {}) => apiClient(url, { ...options, method: 'PUT', body }),
  patch: (url, body, options = {}) => apiClient(url, { ...options, method: 'PATCH', body }),
  delete: (url, options = {}) => apiClient(url, { ...options, method: 'DELETE' }),
};

/**
 * Helper to extract data from API response
 * Throws error if response is not successful
 * 
 * @param {ApiResponse} response - API response
 * @returns {any} Response data
 * @throws {Error} If response is not successful
 */
export function getData(response) {
  if (!response.success) {
    throw new Error(response.error || response.message || 'Request failed');
  }
  return response.data;
}

/**
 * Helper to check if response is successful
 * 
 * @param {ApiResponse} response - API response
 * @returns {boolean}
 */
export function isSuccess(response) {
  return response.success === true;
}

export default apiClient;
