// Metro configuration for Expo (Web + iOS + Android).
// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure .cjs (used by some Supabase/ws deps) resolves on all platforms.
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

// O @supabase/supabase-js faz um import() OPCIONAL de '@opentelemetry/api'
// (telemetria). Não usamos isso; stubamos como módulo vazio para o bundle web.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@opentelemetry/api') {
    return { type: 'empty' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
