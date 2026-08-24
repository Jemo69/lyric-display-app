/// Network constants shared by discovery, socket, and API layers.
library;

class AppConfig {
  static const int defaultPort = 4000;
  static const String mdnsService = '_lyricdisplay._tcp';
  static const String healthPath = '/api/health';

  /// Subnet sweep tuning — sized for flaky church Wi-Fi.
  static const Duration sweepConnectTimeout = Duration(milliseconds: 400);
  static const Duration sweepReceiveTimeout = Duration(milliseconds: 600);
  static const int sweepBatchSize = 20;
  static const Duration discoveryTimeout = Duration(seconds: 4);
  static const Duration mdnsLookupTimeout = Duration(seconds: 1);

  static const Duration heartbeatInterval = Duration(seconds: 30);

  static const int maxQueuedSocketEvents = 100;
}
