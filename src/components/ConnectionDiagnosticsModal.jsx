import React, { useState, useEffect } from 'react';
import { Activity, Clock, Users, AlertCircle, CheckCircle, RefreshCw, RefreshCcw, Monitor, Smartphone, Globe, ShieldCheck, KeyRound } from 'lucide-react';
import { resolveBackendUrl } from '../utils/network';
import { useSyncTimer } from '../hooks/useSyncTimer';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ConnectionDiagnostics');

const CLIENT_TYPE_LABELS = {
    desktop: 'Desktop Control Panel',
    web: 'Web Controller',
    mobile: 'Mobile Controller',
    output1: 'Output Display 1',
    output2: 'Output Display 2',
    stage: 'Stage Display'
};

const CLIENT_TYPE_ICONS = {
    desktop: Monitor,
    web: Globe,
    mobile: Smartphone,
    output1: Monitor,
    output2: Monitor,
    stage: Monitor
};

const ConnectionDiagnosticsModal = ({ darkMode }) => {
    logger.info('ConnectionDiagnosticsModal mounted');
    const [connectionStats, setConnectionStats] = useState(null);
    const [connectedClients, setConnectedClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    // #12 secret-rotation surface (localhost-only admin endpoints; desktop only).
    const [secretsStatus, setSecretsStatus] = useState(null);
    const [rotateBusy, setRotateBusy] = useState(false);
    const [rotateMessage, setRotateMessage] = useState(null);
    const [confirmRotate, setConfirmRotate] = useState(false);

    const secondsAgo = useSyncTimer(lastSyncTime);

    useEffect(() => {
        const updateSyncTime = () => {
            try {
                const stored = localStorage.getItem('lastSyncTime');
                if (stored) {
                    setLastSyncTime(parseInt(stored, 10));
                }
            } catch (err) {
                console.warn('Failed to read lastSyncTime:', err);
            }
        };

        updateSyncTime();

        const handleSyncCompleted = () => {
            updateSyncTime();
        };

        window.addEventListener('sync-completed', handleSyncCompleted);
        return () => window.removeEventListener('sync-completed', handleSyncCompleted);
    }, []);

    const getAuthToken = async () => {
        try {
            if (window.electronAPI) {
                try {
                    const stored = await window.electronAPI.tokenStore.get({
                        clientType: 'desktop',
                        deviceId: localStorage.getItem('lyric_display_device_id')
                    });
                    if (stored?.token) {
                        return stored.token;
                    }
                } catch (err) {
                    console.warn('Failed to get token from secure store:', err);
                }

                try {
                    const deviceId = localStorage.getItem('lyric_display_device_id') ||
                        `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                    const token = await window.electronAPI.getDesktopJWT({
                        deviceId,
                        sessionId
                    });

                    if (token) {
                        return token;
                    }
                } catch (err) {
                    console.warn('Failed to get desktop JWT:', err);
                }
            }

            const deviceId = localStorage.getItem('lyric_display_device_id');
            const clientType = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'web';
            const key = `lyric_display_token_${clientType}_${deviceId}`;
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
                return parsed.token;
            }
        } catch (err) {
            console.error('Failed to get auth token:', err);
        }
        return null;
    };

    const fetchDiagnostics = async () => {
        try {
            let managerStats = null;
            if (window.electronAPI) {
                managerStats = await window.electronAPI.getConnectionDiagnostics?.();
            }

            try {
                const token = await getAuthToken();
                if (token) {
                    const url = resolveBackendUrl('/api/connection/clients');

                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        setConnectedClients(data.clients || []);
                    } else {
                        const errorText = await response.text();
                        console.error('Failed to fetch connected clients:', response.status, errorText);
                    }
                } else {
                    console.warn('No auth token available for fetching clients');
                }
            } catch (err) {
                console.error('Failed to fetch connected clients:', err);
            }

            setConnectionStats(managerStats);
        } catch (error) {
            console.error('Failed to fetch diagnostics:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDiagnostics();

        const interval = setInterval(fetchDiagnostics, 2000);
        return () => clearInterval(interval);
    }, []);

    // #12: surface JWT-secret rotation age + rotate action (grace semantics:
    // existing tokens stay valid ~24h via the previous secret; restart
    // required). Localhost-only endpoint — desktop Electron only; remote
    // web/mobile clients never see this section. Never logs tokens/secrets.
    useEffect(() => {
        if (!window.electronAPI) return;
        let cancelled = false;
        const fetchSecretsStatus = async () => {
            try {
                const response = await fetch(resolveBackendUrl('/api/admin/secrets/status'));
                if (!response.ok) return;
                const status = await response.json();
                if (!cancelled && status?.exists) setSecretsStatus(status);
            } catch {
                // Backend unreachable or not localhost — section stays hidden.
            }
        };
        fetchSecretsStatus();
        return () => { cancelled = true; };
    }, []);

    const handleRotateSecret = async () => {
        if (!confirmRotate) {
            setConfirmRotate(true);
            return;
        }
        setConfirmRotate(false);
        setRotateBusy(true);
        setRotateMessage(null);
        try {
            const response = await fetch(resolveBackendUrl('/api/admin/secrets/rotate'), {
                method: 'POST',
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload?.success) {
                setRotateMessage({
                    ok: true,
                    text: `Secret rotated${payload.lastRotated ? ` (${new Date(payload.lastRotated).toLocaleString()})` : ''}. Restart the server to take effect. Existing tokens stay valid during the ~24h grace period.`,
                });
                setSecretsStatus((prev) => prev ? {
                    ...prev,
                    lastRotated: payload.lastRotated || new Date().toISOString(),
                    daysSinceRotation: 0,
                    needsRotation: false,
                    hasGraceSecret: true,
                } : prev);
            } else {
                setRotateMessage({ ok: false, text: payload?.error || 'Rotation failed.' });
            }
        } catch (err) {
            setRotateMessage({ ok: false, text: 'Rotation request failed.' });
        } finally {
            setRotateBusy(false);
        }
    };

    const formatDuration = (ms) => {
        if (!Number.isFinite(ms) || ms <= 0) return "0s";
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes > 0) {
            return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
        }
        return `${seconds}s`;
    };

    const formatRelativeTime = (timestamp) => {
        if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
        const delta = Date.now() - timestamp;
        if (delta < 0) return "just now";
        const seconds = Math.round(delta / 1000);
        if (seconds < 45) return `${seconds}s ago`;
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 48) return `${hours}h ago`;
        const days = Math.round(hours / 24);
        if (days < 14) return `${days}d ago`;
        const weeks = Math.round(days / 7);
        if (weeks < 8) return `${weeks}w ago`;
        return new Date(timestamp).toLocaleString();
    };

    if (loading && !connectionStats && connectedClients.length === 0) {
        return (
            <div className={`flex items-center justify-center py-8 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                <span>Loading diagnostics...</span>
            </div>
        );
    }

    const isHealthy = !connectionStats?.globalBackoffActive;
    const actualClientCount = connectedClients.length;

    return (
        <div className="space-y-6">
            {/* Status Overview Card */}
            <div className={`rounded-lg p-4 ${isHealthy
                ? (darkMode ? 'bg-green-900/20 border border-green-700/30' : 'bg-green-50 border border-green-200')
                : (darkMode ? 'bg-yellow-900/20 border border-yellow-700/30' : 'bg-yellow-50 border border-yellow-200')
                }`}>
                <div className="flex items-start gap-3">
                    {isHealthy ? (
                        <CheckCircle className={`w-6 h-6 flex-shrink-0 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                    ) : (
                        <AlertCircle className={`w-6 h-6 flex-shrink-0 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                    )}
                    <div className="flex-1">
                        <h3 className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {isHealthy ? 'Connection Healthy' : 'Temporary Cooldown Active'}
                        </h3>
                        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {isHealthy
                                ? 'All systems ready. Connections will retry immediately if needed.'
                                : `Auto-retry will resume in approximately ${formatDuration(connectionStats?.globalBackoffRemainingMs || 0)}`
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <Activity className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                        <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Active Clients
                        </span>
                    </div>
                    <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {actualClientCount}
                    </p>
                </div>

                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                        <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Session Failures
                        </span>
                    </div>
                    <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {connectionStats?.globalFailures || 0}
                    </p>
                </div>

                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <RefreshCcw className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                        <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Last Synced
                        </span>
                    </div>
                    <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {lastSyncTime ? `${secondsAgo}s` : 'Never'}
                    </p>
                    {lastSyncTime && (
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                            ago
                        </p>
                    )}
                </div>
            </div>

            {/* Last Failure Info */}
            {connectionStats?.lastFailureTime && (
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                        <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Most Recent Issue
                        </span>
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {formatRelativeTime(connectionStats.lastFailureTime)}
                    </p>
                </div>
            )}

            {/* #12 Secret rotation (desktop localhost only) */}
            {secretsStatus && (
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className={`w-5 h-5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                        <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Secret Rotation
                        </span>
                        {secretsStatus.needsRotation ? (
                            <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'bg-red-950/70 text-red-300 border border-red-800/60' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                                <AlertCircle className="w-3 h-3" /> Rotation overdue
                            </span>
                        ) : (typeof secretsStatus.daysSinceRotation === 'number' && secretsStatus.daysSinceRotation >= 150) ? (
                            <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                <Clock className="w-3 h-3" /> Due soon
                            </span>
                        ) : (
                            <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                                <CheckCircle className="w-3 h-3" /> Current
                            </span>
                        )}
                    </div>
                    <div className={`space-y-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <p className="flex items-center gap-1.5">
                            <KeyRound className="w-3 h-3" />
                            {typeof secretsStatus.daysSinceRotation === 'number'
                                ? `JWT secret last rotated ${secretsStatus.daysSinceRotation}d ago${secretsStatus.lastRotated ? ` (${new Date(secretsStatus.lastRotated).toLocaleDateString()})` : ''}`
                                : 'JWT secret rotation age unknown'}
                        </p>
                        {secretsStatus.hasGraceSecret && (
                            <p>Previous secret in grace period — existing tokens stay valid for ~24h.</p>
                        )}
                        <p>Rotate every 6–12 months. Server restart required after rotation.</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <button
                            onClick={handleRotateSecret}
                            disabled={rotateBusy}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${confirmRotate
                                ? (darkMode ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-red-600 hover:bg-red-500 text-white')
                                : (darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')
                                }`}
                            title="Rotate the JWT signing secret"
                        >
                            <RefreshCw className={`w-4 h-4 ${rotateBusy ? 'animate-spin' : ''}`} />
                            {rotateBusy ? 'Rotating…' : confirmRotate ? 'Confirm rotation' : 'Rotate secret'}
                        </button>
                        {confirmRotate && !rotateBusy && (
                            <button
                                onClick={() => setConfirmRotate(false)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                    {rotateMessage && (
                        <p className={`mt-2 text-xs flex items-start gap-1.5 ${rotateMessage.ok
                            ? (darkMode ? 'text-emerald-300' : 'text-emerald-700')
                            : (darkMode ? 'text-red-300' : 'text-red-700')
                            }`}>
                            {rotateMessage.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />}
                            {rotateMessage.text}
                        </p>
                    )}
                </div>
            )}

            {/* Connected Clients */}
            <div>
                <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <Users className="w-4 h-4" />
                    Connected Clients ({actualClientCount})
                </h4>

                {connectedClients.length > 0 ? (
                    <div className="space-y-3">
                        {connectedClients.map((client) => {
                            const Icon = CLIENT_TYPE_ICONS[client.type] || Monitor;
                            const label = CLIENT_TYPE_LABELS[client.type] || client.type;
                            const connectedTime = formatRelativeTime(client.connectedAt);

                            return (
                                <div
                                    key={client.id}
                                    className={`rounded-lg p-3 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Icon className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                            <span className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                                {label}
                                            </span>
                                        </div>
                                        <span className={`text-xs font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                                            Connected
                                        </span>
                                    </div>

                                    <div className={`space-y-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {connectedTime && (
                                            <p className="flex items-center gap-1.5">
                                                <Clock className="w-3 h-3" />
                                                Connected {connectedTime}
                                            </p>
                                        )}
                                        <p className="flex items-center gap-1.5">
                                            <Activity className="w-3 h-3" />
                                            Session: {client.sessionId.substring(0, 16)}...
                                        </p>
                                        {client.socketCount > 1 && (
                                            <p className="flex items-center gap-1.5">
                                                <Activity className="w-3 h-3" />
                                                {client.socketCount} active connections
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className={`text-center py-6 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No clients currently connected</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConnectionDiagnosticsModal;