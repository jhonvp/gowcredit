// Must be imported before anything else (ADR 0009). dd-trace patches modules on load.
// With DD_TRACE_ENABLED=false (local default) this is a no-op apart from log injection.
import tracer from 'dd-trace';

tracer.init({
  logInjection: true,
  runtimeMetrics: process.env.DD_TRACE_ENABLED === 'true',
  service: process.env.DD_SERVICE ?? 'gowcredit-api',
  env: process.env.DD_ENV ?? 'local',
  version: process.env.DD_VERSION ?? 'dev',
});

export default tracer;
