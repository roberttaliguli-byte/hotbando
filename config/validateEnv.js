const REQUIRED_PRODUCTION_ENV = [
    'SESSION_SECRET',
    'DB_USER',
    'DB_PASSWORD',
    'DB_ROOT_PASSWORD',
    'REDIS_PASSWORD',
    'MIKROTIK_API_PASSWORD',
    'MIKROTIK_DEFAULT_PASSWORD',
    'HOTSPOT_ADMIN_PASSWORD',
    'RADIUS_SECRET',
    'ROUTER_REGISTRATION_SECRET',
    'ENCRYPTION_KEY',
    'COLLECTOR_KEY',
    'CLICKPESA_CLIENT_ID',
    'CLICKPESA_API_KEY',
    'CLICKPESA_CHECKSUM_KEY',
    'CLICKPESA_WEBHOOK_SECRET',
    'SEED_PASSWORD'
];

const PLACEHOLDER_VALUE = /^(?:<.*>|(?:replace|change|your|placeholder|example)(?:[_-]|$))/i;

function validateEnv(env = process.env) {
    if (env.NODE_ENV !== 'production') return;

    const missing = [];
    const placeholders = [];
    for (const name of REQUIRED_PRODUCTION_ENV) {
        const value = String(env[name] || '').trim();
        if (!value) {
            missing.push(name);
        } else if (PLACEHOLDER_VALUE.test(value)) {
            placeholders.push(name);
        }
    }

    if (missing.length === 0 && placeholders.length === 0) return;

    console.error('Production startup blocked: required configuration is missing or still uses placeholders.');
    if (missing.length) console.error(`MISSING environment variable names: ${missing.join(', ')}`);
    if (placeholders.length) console.error(`Replace placeholder values for: ${placeholders.join(', ')}`);
    process.exit(1);
}

module.exports = validateEnv;
