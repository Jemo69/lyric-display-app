export function classifyError(error) {
    const message = error?.message?.toLowerCase() || '';

    // Authentication errors (Socket.IO specific)
    if (message.includes('auth') && (message.includes('token') || message.includes('required') || message.includes('invalid'))) {
        return {
            type: 'auth',
            title: 'Authentication error',
            message: 'Your session has expired or is invalid. Reconnecting...',
            retryable: true,
        };
    }

    // Connection refused (server not running)
    if (message.includes('econnrefused') || message.includes('connection refused')) {
        return {
            type: 'connection_refused',
            title: 'Server unavailable',
            message: 'Cannot reach the server. Make sure the application is running.',
            retryable: true,
        };
    }

    // Abort / timeout
    if (message.includes('aborted') || message.includes('aborterror') || message.includes('timed out') || message.includes('timeout')) {
        return {
            type: 'timeout',
            title: 'Connection timeout',
            message: 'The request took too long. Please try again.',
            retryable: true,
        };
    }

    // Network/connectivity errors
    if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
        return {
            type: 'network',
            title: 'Connection failed',
            message: 'Unable to reach the server. Please check your internet connection.',
            retryable: true,
        };
    }

    // HTTP errors
    if (message.includes('404') || message.includes('not found')) {
        return {
            type: 'not_found',
            title: 'Lyrics not found',
            message: 'This song may not be available from this provider. Try another result.',
            retryable: false,
        };
    }

    if (message.includes('503') || message.includes('service unavailable')) {
        return {
            type: 'service_unavailable',
            title: 'Service temporarily unavailable',
            message: 'The provider is currently experiencing issues. Please try again later.',
            retryable: true,
        };
    }

    if (message.includes('429') || message.includes('rate limit')) {
        return {
            type: 'rate_limit',
            title: 'Too many requests',
            message: 'Please wait a moment before searching again.',
            retryable: true,
        };
    }

    // Generic server error
    if (message.includes('500') || message.includes('server error')) {
        return {
            type: 'server_error',
            title: 'Server error',
            message: 'The provider encountered an error. Please try again later.',
            retryable: true,
        };
    }

    // Offline hint (used as fallback, not authoritative — navigator.onLine can be unreliable)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return {
            type: 'offline',
            title: 'No internet connection',
            message: 'Please check your network connection and try again.',
            retryable: true,
        };
    }

    // Default
    return {
        type: 'unknown',
        title: 'Unable to complete request',
        message: error?.message || 'An unexpected error occurred.',
        retryable: true,
    };
}