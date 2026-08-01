import { createLogger } from './logger.js';

const log = createLogger('ErrorClassification');

export function classifyError(error) {
    const message = error?.message?.toLowerCase() || '';

    // Authentication errors (Socket.IO specific)
    if (message.includes('auth') && (message.includes('token') || message.includes('required') || message.includes('invalid'))) {
        const result = {
            type: 'auth',
            title: 'Authentication error',
            message: 'Your session has expired or is invalid. Reconnecting...',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    // Connection refused (server not running)
    if (message.includes('econnrefused') || message.includes('connection refused')) {
        const result = {
            type: 'connection_refused',
            title: 'Server unavailable',
            message: 'Cannot reach the server. Make sure the application is running.',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    // Abort / timeout
    if (message.includes('aborted') || message.includes('aborterror') || message.includes('timed out') || message.includes('timeout')) {
        const result = {
            type: 'timeout',
            title: 'Connection timeout',
            message: 'The request took too long. Please try again.',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    // Network/connectivity errors
    if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
        const result = {
            type: 'network',
            title: 'Connection failed',
            message: 'Unable to reach the server. Please check your internet connection.',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    // HTTP errors
    if (message.includes('404') || message.includes('not found')) {
        const result = {
            type: 'not_found',
            title: 'Lyrics not found',
            message: 'This song may not be available from this provider. Try another result.',
            retryable: false,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    if (message.includes('503') || message.includes('service unavailable')) {
        const result = {
            type: 'service_unavailable',
            title: 'Service temporarily unavailable',
            message: 'The provider is currently experiencing issues. Please try again later.',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    if (message.includes('429') || message.includes('rate limit')) {
        const result = {
            type: 'rate_limit',
            title: 'Too many requests',
            message: 'Please wait a moment before searching again.',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    // Generic server error
    if (message.includes('500') || message.includes('server error')) {
        const result = {
            type: 'server_error',
            title: 'Server error',
            message: 'The provider encountered an error. Please try again later.',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    // Offline hint (used as fallback, not authoritative — navigator.onLine can be unreliable)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const result = {
            type: 'offline',
            title: 'No internet connection',
            message: 'Please check your network connection and try again.',
            retryable: true,
        };
        log.debug('Error classified', { type: result.type, message: error?.message });
        return result;
    }

    // Default
    const result = {
        type: 'unknown',
        title: 'Unable to complete request',
        message: error?.message || 'An unexpected error occurred.',
        retryable: true,
    };
    log.debug('Error classified', { type: result.type, message: error?.message });
    return result;
}