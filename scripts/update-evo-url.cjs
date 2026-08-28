// Actualiza la URL de Evolution API en sek_app_settings
const { createClient } = require('@supabase/supabase-js');
const { createCipheriv, randomBytes, scryptSync } = require('crypto');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALGO = 'aes-256-gcm';
function getKey() {
  const secret = process.env.APP_ENCRYPTION_KEY || SERVICE_KEY || 'default-secret-do-not-use-in-prod';
  return scryptSync(secret, 'sekunet-salt-v1', 32);
}
function encrypt(text) {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return { encrypted, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const newConfig = JSON.stringify({
  url: 'http://129.146.7.74',
  apiKey: 'SEKUNET_EVO_KEY_123',
  instance: 'sekunet',
});

const { encrypted, iv, tag } = encrypt(newConfig);

supabase
  .from('sek_app_settings')
  .upsert({ key: 'evolution_api_config', value: encrypted, iv, tag, updated_at: new Date().toISOString() })
  .then(({ data, error }) => {
    if (error) {
      console.log('ERROR:', error.message);
    } else {
      console.log('OK - URL actualizada a http://129.146.7.74');
    }
  });
